# Architecture design — API migration toolkit

## System overview

The API migration toolkit is composed of three layers: a CLI tool for schema-level diffing (wrapping oasdiff), a web-based response diff engine, and a migration guide layer that ties diffs to structured documentation. Each layer can be used independently or composed into a full pipeline.

```
┌─────────────────────────────────────────────────────────────────┐
│                        Developer surfaces                        │
│                                                                  │
│   Browser UI (response diff + migration guide viewer)           │
│   CLI (schema diff + CI pipeline integration)                   │
│   CI/CD (GitHub Actions, automated breaking change detection)   │
└─────────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────────┐
│                         Core toolkit                             │
│                                                                  │
│   oasdiff_compare.py    diff_engine.js    guide_renderer.js     │
│   (schema diff CLI)     (response diff)   (migration guide)     │
└─────────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────────┐
│                      External dependencies                       │
│                                                                  │
│   oasdiff binary        No external deps    localStorage        │
│   (Go, installed)       (pure JS)           (browser)           │
└─────────────────────────────────────────────────────────────────┘
```

---

## Component architecture

### 1. Schema diff CLI (`oasdiff_compare.py`)

A Python wrapper around the `oasdiff` binary. Handles schema fetching, format detection, binary installation, and output formatting.

```
oasdiff_compare.py
│
├── ensure_oasdiff()          # locate or auto-install binary
│   ├── shutil.which()        # check PATH
│   ├── brew install          # macOS auto-install
│   └── GitHub release fetch  # Linux auto-install
│
├── fetch_schema(url, label)  # download spec to temp file
│   ├── urllib.request        # HTTP GET with User-Agent
│   ├── content sniff         # detect YAML vs JSON
│   └── NamedTemporaryFile    # write to disk
│
├── run_oasdiff(binary, mode, base, revision)
│   ├── subprocess.run        # exec oasdiff, stream stdout
│   └── return exit code      # 0 = clean, 1 = breaking found
│
└── main()
    ├── argparse              # CLI argument parsing
    ├── interactive prompts   # URL input if args missing
    └── print_exit_summary()  # human-readable result
```

**Data flow:**

```
URL input
    │
    ▼
fetch_schema() ──► temp file (YAML/JSON)
                        │
                        ▼
              run_oasdiff(mode, base.yaml, revision.yaml)
                        │
                        ▼
              oasdiff binary ──► stdout stream ──► terminal
                        │
                        ▼
              exit code 0/1 ──► CI pass/fail
```

**Environment requirements:**

| Dependency | Version | Install |
|---|---|---|
| Python | 3.8+ | system |
| oasdiff | 1.10+ | auto or manual |
| urllib (stdlib) | — | included |
| subprocess (stdlib) | — | included |

**Error handling matrix:**

| Error | Behaviour |
|---|---|
| HTTP 4xx on schema URL | Exit with message, no diff |
| HTTP 5xx on schema URL | Exit with message, no diff |
| Invalid JSON/YAML in spec | oasdiff reports parse error |
| oasdiff not found, user declines install | Exit with instructions |
| Breaking changes detected | Exit code 1 (CI-safe) |
| No changes detected | Exit code 0, clean message |

---

### 2. Response diff engine (`diff_engine.js`)

A pure JavaScript module with no external dependencies. Takes two parsed JSON objects and returns a structured diff result.

#### Object flattening

The core operation is reducing nested objects to flat key-value maps using dot-notation paths:

```javascript
// Input
{
  "address": {
    "line1": "123 Main St",
    "city": "San Francisco"
  },
  "billing": "charge_automatically"
}

// Flattened output
{
  "address.line1": "123 Main St",
  "address.city": "San Francisco",
  "billing": "charge_automatically"
}
```

**Flattening rules:**
- Objects are recursively traversed depth-first
- Arrays are treated as leaf values (not traversed), with type reported as `array[N]`
- Empty objects `{}` are leaf values
- `null` is a leaf value
- Path separator is `.` (dot)
- Keys containing dots are not escaped in v1 (future: configurable separator)

#### Change detection algorithm

```
flatten(a) → fa
flatten(b) → fb
allKeys = union(keys(fa), keys(fb))
processed = Set()

for each key in allKeys:
  if key in processed: skip

  if key in fa AND key in fb:
    if serialize(fa[key]) == serialize(fb[key]):
      emit UNCHANGED
    elif typeof(fa[key]) != typeof(fb[key]):
      emit TYPE_CHANGE (with old type, new type)
    else:
      emit VALUE_CHANGED

  elif key in fa only:
    # check for rename: same value at a different key in fb
    renamedTo = find key in fb where:
      key not in fa AND
      key not in processed AND
      serialize(fb[key]) == serialize(fa[key])

    if renamedTo found:
      emit RENAMED (old path → new path)
      processed.add(renamedTo)
    else:
      # check for move: same leaf name and value at different path
      movedTo = find key in fb where:
        key not in fa AND
        key not in processed AND
        leafName(key) == leafName(current) AND
        serialize(fb[key]) == serialize(fa[key])

      if movedTo found:
        emit MOVED (old path → new path)
        processed.add(movedTo)
      else:
        emit REMOVED

  elif key in fb only:
    emit ADDED

  processed.add(key)
```

**Algorithm complexity:** O(n²) in the worst case for rename detection (for each removed key, scan all added keys). Acceptable for typical API response sizes (< 200 fields). For large schemas, a value-to-keys index should be used to reduce to O(n).

#### Change type taxonomy

```
DiffResult {
  type: 'unchanged' | 'removed' | 'added' | 'changed' |
        'renamed' | 'moved' | 'type-change'
  path: string              // dot-notation path in old object
  newPath?: string          // for renamed / moved
  old?: any                 // old value (absent for added)
  new?: any                 // new value (absent for removed)
  oldType?: string          // for type-change
  newType?: string          // for type-change
}
```

#### Severity mapping

| Change type | Severity | Breaking? | Action required |
|---|---|---|---|
| removed | critical | yes | Remove all reads/writes of this field |
| type-change | high | yes | Update serialisation/deserialisation logic |
| renamed | high | yes | Find and replace key name |
| moved | medium | yes | Update access path |
| changed | medium | maybe | Verify new default is acceptable |
| added | low | no | Optionally adopt new field |
| unchanged | none | no | No action |

---

### 3. Migration guide renderer

A structured documentation layer built over the diff output. Maps each `DiffResult` to a human-readable migration step with code examples.

#### Guide structure

```
MigrationGuide {
  title: string
  versions: { base: string, revision: string }
  sunsetDate?: Date
  timeline: TimelineStep[]
  changes: MigrationChange[]
}

MigrationChange {
  diffResult: DiffResult
  summary: string           // one-line plain English description
  severity: 'breaking' | 'deprecated' | 'non-breaking'
  codeExamples: {
    [language: string]: {
      before: string
      after: string
    }
  }
  checklistItems: ChecklistItem[]
}

ChecklistItem {
  id: string               // stable ID for persistence
  text: string
  subtext?: string
  completed: boolean
}
```

#### Checklist persistence

Checklist state is stored in `localStorage` keyed by a hash of the guide's version pair:

```javascript
const storageKey = `migration-checklist-${btoa(baseVersion + ':' + revisionVersion)}`;
const state = JSON.parse(localStorage.getItem(storageKey) || '{}');
// state: { [checklistItemId]: boolean }
```

This persists across browser sessions without requiring a backend. The trade-off is that state is device-local. A future backend integration would sync state across team members.

---

## Data flow — end to end

### Flow 1: CLI schema diff in CI

```
GitHub Actions trigger (PR opened)
        │
        ▼
Download base spec   ◄── main branch OpenAPI URL
Download PR spec     ◄── PR branch OpenAPI URL
        │
        ▼
oasdiff_compare.py --mode breaking --fail-on-breaking
        │
        ├── No breaking changes → exit 0 → CI passes
        │
        └── Breaking changes found → exit 1 → CI fails
                    │
                    ▼
            PR blocked, developer sees oasdiff output:
            "[breaking] GET /users response property username removed"
```

### Flow 2: Browser response diff

```
Developer pastes v1 JSON ──► textarea (v1)
Developer pastes v2 JSON ──► textarea (v2)
Developer clicks Compare
        │
        ▼
JSON.parse(v1), JSON.parse(v2)
        │
        ▼
flatten(a), flatten(b)
        │
        ▼
diffAlgorithm(fa, fb) ──► DiffResult[]
        │
        ▼
renderDiffTable(results, filter='all')
        │
        ├── summary chips (counts by type)
        ├── filter buttons (all / breaking / renamed / etc.)
        └── diff table rows (path / badge / old / new)
```

### Flow 3: Migration guide generation

```
DiffResult[]  +  version metadata  +  sunset date
        │
        ▼
mapToMigrationChanges(results)
        │
        ├── generateSummary(diffResult)    → plain English
        ├── classifySeverity(diffResult)   → breaking / deprecated / non-breaking
        ├── generateCodeExamples(diffResult, languages) → before/after
        └── generateChecklistItems(diffResult) → actionable steps
        │
        ▼
renderMigrationGuide(guide)
        │
        ├── timeline component
        ├── per-change sections with code tabs
        ├── interactive checklist (state → localStorage)
        └── export as markdown button
```

---

## CI/CD integration

### GitHub Actions workflow

```yaml
name: API breaking change detection

on:
  pull_request:
    paths:
      - 'openapi/**'
      - 'api/**'

jobs:
  api-diff:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Set up Python
        uses: actions/setup-python@v4
        with:
          python-version: '3.11'

      - name: Install oasdiff
        run: |
          curl -fsSL https://github.com/oasdiff/oasdiff/releases/download/v1.10.22/oasdiff_1.10.22_linux_amd64.tar.gz \
            | tar -xz -C /usr/local/bin oasdiff

      - name: Compare schemas
        run: |
          python oasdiff_compare.py \
            https://raw.githubusercontent.com/${{ github.repository }}/main/openapi.yaml \
            https://raw.githubusercontent.com/${{ github.repository }}/${{ github.head_ref }}/openapi.yaml \
            --mode breaking \
            --fail-on-breaking

      - name: Post diff as PR comment
        if: always()
        run: |
          python oasdiff_compare.py \
            https://raw.githubusercontent.com/${{ github.repository }}/main/openapi.yaml \
            https://raw.githubusercontent.com/${{ github.repository }}/${{ github.head_ref }}/openapi.yaml \
            --mode changelog > diff_output.txt
          # post diff_output.txt as PR comment via GitHub API
```

### Deprecation timeline enforcement

A secondary CI check can enforce that breaking changes are not removed before their stated sunset date:

```python
# check_sunset.py — parse deprecation headers from spec and fail if
# a field is being removed before its Sunset date
import yaml, sys
from datetime import datetime

def check_sunset(spec_path):
    with open(spec_path) as f:
        spec = yaml.safe_load(f)
    today = datetime.utcnow()
    violations = []
    # traverse spec looking for x-sunset on deprecated: true fields
    # flag any where x-sunset > today and the field is being removed
    ...
    if violations:
        for v in violations:
            print(f"[VIOLATION] {v['path']} sunset {v['date']} has not passed")
        sys.exit(1)
```

---

## File structure

```
api-migration-toolkit/
│
├── README.md
├── DESIGN.md                    # this project's design decisions
├── ARCHITECTURE.md              # this document
│
├── cli/
│   └── oasdiff_compare.py       # schema diff CLI
│
├── web/
│   ├── index.html               # entry point
│   ├── diff-engine.js           # response diff algorithm
│   ├── guide-renderer.js        # migration guide UI
│   └── styles.css               # design tokens and component styles
│
├── docs/
│   ├── examples/
│   │   ├── stripe-v1.json       # example response payloads
│   │   ├── stripe-v2.json
│   │   ├── twilio-v1.json
│   │   └── twilio-v2.json
│   └── guides/
│       └── stripe-2024-04-10.md # example migration guide
│
├── ci/
│   ├── github-actions.yml       # example CI workflow
│   └── check_sunset.py          # sunset date enforcement
│
└── tests/
    ├── test_diff_engine.js      # unit tests for diff algorithm
    ├── test_oasdiff_compare.py  # unit tests for CLI
    └── fixtures/                # test JSON pairs
```

---

## Extension points

### Custom change detectors

The diff engine exposes a plugin interface for custom change detection rules:

```javascript
diffEngine.addDetector({
  name: 'array-to-paginated',
  // detect when an array field becomes { data: [], has_more: bool }
  detect: (oldVal, newVal, path) => {
    if (Array.isArray(oldVal) &&
        typeof newVal === 'object' &&
        Array.isArray(newVal?.data) &&
        'has_more' in newVal) {
      return {
        type: 'paginated-refactor',
        severity: 'breaking',
        summary: `${path} changed from array to paginated envelope`,
        migration: 'Update reads to use .data property, handle has_more for pagination'
      };
    }
    return null;
  }
});
```

This allows provider-specific patterns (Stripe's list pagination refactor, Twilio's cost object refactor) to be detected and described accurately.

### Code example generators

Migration change objects can be augmented with language-specific code generators:

```javascript
codeGenerators.register('stripe-rename', {
  languages: ['node', 'python', 'ruby', 'php', 'go'],
  generate: (change, language) => ({
    before: templates[language].read(change.path),
    after:  templates[language].read(change.newPath)
  })
});
```

### Export formats

The migration guide can be exported in multiple formats:

| Format | Use case |
|---|---|
| Markdown | Internal wiki, GitHub PRs |
| HTML | Developer portal publication |
| JSON | Programmatic consumption, other tools |
| CSV | Spreadsheet tracking for non-technical stakeholders |

---

## Security considerations

### Schema fetching

The CLI fetches OpenAPI specs from arbitrary URLs. Mitigations:

- Timeout set to 15 seconds (prevents hanging on slow/unresponsive servers)
- `User-Agent` header identifies the tool
- No credentials are stored; authentication (if needed) must be passed via environment variables
- Fetched specs are written to `/tmp` and deleted after diffing — they are never persisted

### Response diff

The browser-based diff tool operates entirely client-side. Pasted JSON never leaves the browser. No telemetry, no backend calls. This is intentional — API responses often contain PII or sensitive business data and should not be sent to a third-party service.

### CI integration

The GitHub Actions workflow requires read access to the repository to fetch spec files from branches. It does not require write access and does not post comments by default (that requires a separate step with explicit permissions scoped to `pull-requests: write`).

---

## Performance considerations

### Diff engine

| Input size | Field count | Diff time (estimated) |
|---|---|---|
| Small response | < 50 fields | < 1ms |
| Medium response | 50–200 fields | 1–5ms |
| Large response | 200–1000 fields | 5–50ms |
| Very large spec | 1000+ fields | 50–500ms |

The O(n²) rename detection is the bottleneck. For specs with 1000+ fields, a value-to-keys reverse index reduces this to O(n):

```javascript
// Build reverse index: serialised value → [keys with that value]
const valueIndex = new Map();
Object.entries(fb).forEach(([k, v]) => {
  const key = JSON.stringify(v);
  if (!valueIndex.has(key)) valueIndex.set(key, []);
  valueIndex.get(key).push(k);
});

// Rename detection becomes O(1) per removed field
const renamedTo = valueIndex.get(JSON.stringify(fa[removedKey]))
  ?.find(k => !(k in fa) && !processed.has(k));
```

### Schema fetching

OpenAPI specs can be large (> 1MB). The CLI streams the download directly to disk rather than buffering in memory. Parsed YAML/JSON is handled by oasdiff natively — the Python wrapper does not parse the spec content itself.
