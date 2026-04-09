# Design document — API migration toolkit

## Overview

The API migration toolkit is a suite of tools that helps developers understand, navigate, and action API changes. It addresses a gap in the current ecosystem: deprecation notices tell developers *what* is changing, but nothing shows them the precise field-level impact on their actual payloads, or gives them a structured path to migrate.

The toolkit has three integrated components:

- **Schema diff** — compares two OpenAPI specification files (by URL or path) and categorises every change as breaking, deprecated, or non-breaking
- **Response diff** — takes two raw JSON API responses and performs deep field-level comparison, detecting renames, moves, type changes, and structural shifts
- **Migration guide viewer** — a structured documentation layer that ties diffs to human-readable migration steps, code examples, and a trackable checklist

---

## Problem statement

### What providers give you

Most API providers publish a changelog. The best (Stripe, LaunchDarkly, GitHub) publish per-change migration notes. These are useful but incomplete:

- They describe changes in prose — a developer still has to manually map "the `billing` field was renamed to `collection_method`" onto their actual codebase
- They don't show the structural impact on a real response payload
- They don't distinguish between changes that affect a developer's specific integration versus changes to parts of the API they don't use
- Checklists don't exist — there's no way to track progress through a migration

### What developers actually need

A developer migrating from v1 to v2 of an API needs to answer four questions in order:

1. **What changed?** — a complete field-level diff, not just a prose description
2. **Does it affect me?** — filtered to only the paths my integration touches
3. **What do I need to change?** — concrete before/after code, not just a description
4. **Have I done it?** — a way to track completion across a team

No existing tool answers all four.

---

## Design principles

### 1. Show the actual payload, not the spec

OpenAPI specs describe what an API *can* return. Developers integrate against what it *does* return. These are often different — nullable fields, conditional properties, and undocumented fields mean the spec is a starting point, not the truth. The response diff tool works on real payloads, not specs, because that's what developers are actually debugging.

### 2. Categorise changes semantically, not syntactically

A plain text diff of two JSON objects tells you what lines changed. That's not useful. What a developer needs to know is whether a change is:

- **A rename** — same value, different key (change the key in your code, logic unchanged)
- **A move** — same key and value, different nesting level (update the path in your code)
- **A type change** — same key, different structure (may require logic changes)
- **A value change** — same key and type, different value (may be a default change)
- **A removal** — field gone entirely (breaking, requires code change)
- **An addition** — new field available (non-breaking, optional adoption)

This classification drives how urgent and invasive the required code change is.

### 3. Breaking changes are not all equal

Removing a field that a developer is actively reading is a severity-1 breaking change. Removing a field from an endpoint they never call is a non-event. The tool should make it easy to filter to only the changes that are relevant to a specific integration. Future versions should allow developers to paste their own response payloads to get personalised impact assessments.

### 4. The checklist is the deliverable

A diff is a diagnostic. A checklist is an action plan. The most valuable thing the toolkit produces is not the diff view but the structured checklist that a developer can work through, share with their team, and mark as complete. Progress should persist.

### 5. Zero friction to start

The tool should work immediately with no setup — paste two JSON blobs, click compare. No authentication, no schema upload, no configuration. Depth is available for power users (URL-based schema comparison, CI integration) but the default path is instant.

---

## User personas

### Persona 1 — the integration developer

A backend developer at a company that uses Stripe, Twilio, or a similar provider. They receive an email saying "API v1 is deprecated, migrate by January 2025." They need to understand what in their codebase needs to change and by when. They are time-pressured and may not be deeply familiar with the API they're migrating.

**Primary need:** understand the blast radius of the migration on their specific integration, fast.

**Key flows:** paste old and new response → filter to breaking changes → generate migration checklist → share with team.

### Persona 2 — the API provider

A platform engineer at a SaaS company who is making changes to their own API and wants to communicate those changes clearly to their customers. They need to produce documentation that is more useful than a changelog entry.

**Primary need:** generate a structured migration guide from a schema diff, without writing it by hand.

**Key flows:** point at old and new OpenAPI specs → review categorised changes → publish migration guide with per-change code examples.

### Persona 3 — the API governance lead

A senior engineer or architect responsible for API quality across a platform. They want to enforce that no breaking changes ship without a migration guide, and that deprecation windows are respected.

**Primary need:** CI integration that blocks releases containing undocumented breaking changes.

**Key flows:** schema diff in CI pipeline → fail build on breaking changes without migration doc → track deprecation timeline per field.

---

## Feature specification

### Schema diff (oasdiff wrapper)

**Inputs:** two OpenAPI spec URLs or file paths, comparison mode (changelog / breaking / summary)

**Outputs:** categorised list of changes with severity, affected endpoint, field path, and migration hint

**Modes:**
- `changelog` — all changes, human-readable, grouped by endpoint
- `breaking` — breaking changes only, exits non-zero for CI use
- `summary` — counts per change type, suitable for PR comments

**Key behaviours:**
- Auto-detects YAML vs JSON from response content
- Downloads specs to temp files, cleans up after diff
- Injects deprecation headers into output where present in spec (`deprecated: true`, `x-sunset`)
- Supports `--fail-on-breaking` flag for CI pipelines

### Response diff

**Inputs:** two JSON objects (raw paste or file upload)

**Outputs:** flat diff table categorised by change type, with filter controls

**Change detection logic:**

| Change type | Detection method |
|---|---|
| Renamed | Key absent in new, but identical value exists at different key |
| Moved | Same leaf key name and value, different nesting path |
| Type changed | Same key present in both, `typeof` values differ |
| Value changed | Same key and type, serialised values differ |
| Removed | Key present in old, absent in new, no rename/move match |
| Added | Key absent in old, present in new |
| Unchanged | Same key, same serialised value |

**Flattening strategy:** recursive depth-first traversal producing dot-notation paths (`address.line1`, `lines.data.0.amount`). Arrays are flattened by index.

**Filter controls:** all / removed / renamed / moved / type changed / value changed / added

**Edge cases:**
- Empty objects (`{}`) are treated as leaf values, not containers
- `null` is a valid leaf value, distinct from missing
- Array length changes are flagged as type changes (`array[2]` → `array[3]`)

### Migration guide viewer

**Structure per change:**
- Change summary (one sentence, plain language)
- Severity badge (breaking / deprecated / non-breaking)
- Sunset date if known
- Before/after code in multiple languages (Node, Python, curl minimum)
- Specific action required (rename key / update path / handle new type / etc.)
- Checklist item (checkable, state persists in localStorage)

**Checklist behaviour:**
- Each change maps to one or more checklist items
- Items can be checked off individually
- Progress bar shows completion percentage
- State persists across browser sessions via localStorage
- Checklist is exportable as markdown

---

## Interaction design

### Response diff — primary flow

```
Paste v1 JSON   →   Paste v2 JSON   →   Click Compare
                                                ↓
                                    Summary chips (counts by type)
                                                ↓
                                    Filter buttons (all / breaking / etc.)
                                                ↓
                                    Diff table (path / change type / old / new)
                                                ↓
                                    Click row → code example for that change
```

### Schema diff — CLI flow

```
$ python oasdiff_compare.py <base_url> <revision_url> --mode changelog

  fetching base: https://...
  fetching revision: https://...

  running: oasdiff changelog base.yaml revision.yaml

  ──────────────────────────────────────────────────
  [breaking]  GET /users/{id}  response 200 property username removed
  [deprecated]  GET /users/{id}  response 200 property username marked deprecated
  [added]  GET /users/{id}  response 200 property display_name added
  ──────────────────────────────────────────────────

  1 breaking  |  1 deprecated  |  1 non-breaking
```

### Migration guide — checklist flow

```
Open guide   →   See timeline (deprecated / notice / migrate / removed)
                                    ↓
                        See change summary + severity
                                    ↓
                    Select language for code examples
                                    ↓
                     Work through checklist items
                                    ↓
                   Export completed checklist as markdown
```

---

## Visual design

### Colour system for change severity

The diff UI uses semantic colour to encode urgency, not aesthetics:

| Change type | Colour | Rationale |
|---|---|---|
| Removed | Red | Breaking, immediate action required |
| Renamed | Blue | Breaking but mechanical — find and replace |
| Moved | Purple | Breaking but low-risk — path update only |
| Type changed | Amber | Breaking, may require logic changes |
| Value changed | Amber | May be breaking depending on usage |
| Added | Green | Non-breaking, optional adoption |
| Unchanged | Muted | Informational only |

### Information hierarchy in diff table

Each row in the diff table communicates in order of importance:

1. **Path** — where in the object the change is (most important — tells you what to search for)
2. **Change type** — badge showing the category of change
3. **Old value** — struck through in red
4. **New value** — in green

The path column uses dot notation so developers can immediately use it as a search term in their codebase.

### Progressive disclosure

The default view shows only changed fields. Unchanged fields are hidden but accessible via a toggle. This keeps the diff focused — in a large API response, 90% of fields are typically unchanged between versions.

---

## Accessibility

- All change types are communicated by both colour and text label (never colour alone)
- Diff table is keyboard navigable
- Summary chip counts are readable by screen readers
- Filter buttons have visible focus states
- Code examples are in `<pre>` / `<code>` blocks, selectable and copyable

---

## Out of scope (v1)

The following are deliberately excluded from the initial version:

- **Authentication** — the tool works on public or already-fetched responses; it does not handle OAuth flows or API key management
- **Webhook diff** — webhook payloads have different versioning semantics and are a separate problem
- **SDK diff** — comparing generated SDK method signatures across versions is a separate tool
- **Automated migration patching** — the tool identifies what needs to change but does not write the code changes (codemods are a future consideration)
- **Multi-version chains** — diffing v1 → v2 → v3 in sequence is a future feature; the tool handles pairwise comparison only
