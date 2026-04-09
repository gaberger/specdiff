<div align="center">

# apidiff

**API migration toolkit** &mdash; compare OpenAPI specs, detect breaking changes, generate migration guides.

[![Built with hex](https://img.shields.io/badge/built%20with-hex-C8B496?style=flat-square)](https://github.com/gaberger/hex)
[![Tests](https://img.shields.io/badge/tests-51%20passing-16a34a?style=flat-square)](#tests)
[![Validation](https://img.shields.io/badge/algorithm%20validation-27%2F27%20(100%25)-16a34a?style=flat-square)](#algorithm-validation)
[![Formally Verified](https://img.shields.io/badge/formally%20verified-Coq%2FRocq-9333ea?style=flat-square)](proofs/)

</div>

---

Compare OpenAPI specs across versions to detect renamed fields, type changes, removed endpoints, and new additions. Auto-generate migration checklists with timelines, severity ratings, and progress tracking.

## Quick Start

```bash
# Install dependencies
bun install

# Start the web UI
bun run start:web
# Open http://localhost:4747

# Or use the CLI
bun run start:cli
```

## Features

| Feature | Description |
|---------|-------------|
| **Spec Diffing** | Compare two OpenAPI specs (JSON/YAML) with structured change breakdown |
| **Change Classification** | Every difference classified as `renamed` `moved` `removed` `added` `type-change` `changed` `unchanged` |
| **Migration Guides** | Auto-generated guides with timelines, severity ratings, and interactive checklists |
| **Integration Library** | Pre-loaded spec comparisons for Stripe, HubSpot, Twilio, GitHub, Shopify, Slack |
| **Algorithm Validation** | Each integration includes documented change notes &mdash; validates diff detection accuracy |
| **Diff-Aware Editors** | Side-by-side editors with line highlighting colored by change type |
| **Scroll Sync** | Optional lock/unlock synchronized scrolling between old and new editors |
| **File Drop & URL Fetch** | Load specs by pasting, dragging files, or fetching from a URL |
| **Markdown Export** | Download migration guides as `.md` files |

## Architecture

Built with [**hex**](https://github.com/gaberger/hex) &mdash; hexagonal architecture (ports & adapters) with enforced boundary rules.

```
src/
  core/
    domain/          # Pure business logic, zero external deps
    ports/           # Typed interfaces (contracts between layers)
    usecases/        # Application logic composing ports
  adapters/
    primary/         # Driving: CLI, Web UI
    secondary/       # Driven: storage, API fetch, oasdiff
  composition-root   # Wires adapters to ports (single DI point)
```

> **Boundary rules** enforced by `hex analyze .`:
> - `domain/` imports nothing outside `domain/`
> - `ports/` may only import from `domain/`
> - `adapters/` may only import from `ports/` (never other adapters)
> - `composition-root` is the only file that imports adapters

## Algorithm Validation

The diff algorithm is validated against documented API breaking changes from 6 major providers. Each integration includes `changeNotes` &mdash; real breaking changes from official changelogs &mdash; and a validation panel checks whether the algorithm detected each one.

### Results: 27/27 documented changes detected (100%)

| Provider | Endpoint | Documented Changes | Detected | Score |
|:---------|:---------|:------------------:|:--------:|:-----:|
| **Stripe** | Customer schema | 4 | 4/4 | :white_check_mark: 100% |
| **Stripe** | Charge schema | 2 | 2/2 | :white_check_mark: 100% |
| **HubSpot** | Contacts endpoint | 4 | 4/4 | :white_check_mark: 100% |
| **Twilio** | Messages endpoint | 4 | 4/4 | :white_check_mark: 100% |
| **GitHub** | Users endpoint | 3 | 3/3 | :white_check_mark: 100% |
| **Shopify** | Product schema | 5 | 5/5 | :white_check_mark: 100% |
| **Slack** | channels &rarr; conversations | 5 | 5/5 | :white_check_mark: 100% |

<details>
<summary><strong>Validated change types</strong></summary>

- **Renames:** `billing` &rarr; `collection_method`, `sid` &rarr; `message_sid`, `body_html` &rarr; `descriptionHtml`
- **Type changes:** `price` string &rarr; object, `num_segments` string &rarr; integer
- **Removals:** `gravatar_id`, `sources`, `identity_profiles`
- **Additions:** `invoice_settings`, `node_id`, `twitter_username`, `subresource_uris`
- **Structural:** REST &rarr; GraphQL endpoints, Swagger 2.0 &rarr; OpenAPI 3.0, enum casing changes
- **Path migrations:** `/channels.*` &rarr; `/conversations.*`, `/contacts/v2/` &rarr; `/crm/v3/`

</details>

The core diff algorithm is also [**formally verified with Coq/Rocq proofs**](proofs/) for totality, determinism, and structural consistency.

## Tests

```bash
bun test
# 51 pass, 0 fail across 5 test files
```

## Architecture Decision Records

| ADR | Decision |
|:----|:---------|
| [001](docs/adrs/ADR-001-hexagonal-architecture.md) | Hexagonal architecture with strict boundary rules |
| [002](docs/adrs/ADR-002-bun-runtime.md) | Bun as the runtime |
| [003](docs/adrs/ADR-003-pure-domain-diff-algorithm.md) | Pure domain diff algorithm with no external deps |
| [004](docs/adrs/ADR-004-xss-prevention-in-web-adapter.md) | XSS prevention &mdash; no `innerHTML` with external data |
| [005](docs/adrs/ADR-005-schema-diff-via-oasdiff.md) | Schema diff via oasdiff binary |
| [006](docs/adrs/ADR-006-in-memory-storage-with-adapter-swap.md) | In-memory storage with adapter swap |
| [007](docs/adrs/ADR-007-synced-scroll-and-diff-highlighting.md) | Synchronized scroll and diff-aware highlighting |
| [008](docs/adrs/ADR-008-openapi-spec-input-via-rest-and-file-drop.md) | OpenAPI spec input via REST and file drop |
| [009](docs/adrs/ADR-009-popular-api-integrations-sidebar.md) | Popular API integrations sidebar |

## Security

- Zero `innerHTML`/`outerHTML`/`insertAdjacentHTML` with external data ([ADR-004](docs/adrs/ADR-004-xss-prevention-in-web-adapter.md))
- All dynamic rendering uses `document.createElement()` + `textContent`
- No secrets in repository

---

<div align="center">
<sub>Built with <a href="https://github.com/gaberger/hex">hex</a> &mdash; hexagonal architecture tooling</sub>
</div>
