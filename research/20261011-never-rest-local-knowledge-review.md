---
schema: eddy-review/v1
doc:
  id: never-rest-local-knowledge-review-2026-10-11
  title: Never-rest and a fresh local-first knowledge workspace
  kind: derivative
  status: proposed
  reviewed_at: 2026-10-11
vars:
  codebase_strategy: greenfield
  knowledge_source_of_truth: markdown-and-jsonl
  search_engine: qmd
  first_interface: cli
  agent_runtime: agnostic
  protocol_strategy: core-plus-optional-adapters
  ui_platform: undecided
---

# Never-rest and a fresh local-first knowledge workspace

Review and implementation plan - 11 October 2026

## Decision

Start a new application repository. Do not fork Kanon and do not turn never-rest
into a knowledge-management framework. Preserve Kanon's useful distinction
between original material, normalized references and authored derivatives.
**Agent-runtime, editor and UI-framework independence are hard requirements:**
the knowledge core must function without Cursor, Claude Code, Gemini, Codex, Pi
or any other named assistant. Use never-rest for validated, Result-based
operations; expose those operations to humans and compatible agents through a
standalone CLI, an optional MCP adapter, a direct TypeScript API and (later)
private HTTP. Use upstream QMD for retrieval.

Markdown with `doc` and `vars` frontmatter is the working document format. JSONL
holds explicit version checkpoints and provenance events. Git distributes the
canonical files and records changes. QMD and the application's metadata database
are rebuildable projections, not the source of truth. A private journal can
participate in a person's local workspace without becoming part of an
organizational repository or shared server.

This is a source/documentation review and a proposed implementation plan, not a
completed implementation, runtime benchmark, penetration test or certification.
Selected current source files were examined, along with Kanon's README/reflection
and upstream primary documentation. No repository changes, issues or pull
requests were made during the review itself. Existing tests were not executed
during the review.

## 1. What the review establishes

### Never-rest

The inspected package declares version 0.6.0. It already provides contract
definitions, Standard Schema validation, neverthrow results, HTTP serving and
clients, in-process dispatch, OpenAPI export, a Node bridge, testing helpers and
a query-cache integration. This is enough to begin the knowledge application's
contract and local service layer.

The CI configuration includes linting, type checks, tests and coverage,
complexity checks, type-performance checks, example conformance, packaging
checks and mutation testing.

Specific findings:

| Finding | Evidence | Required response |
| --- | --- | --- |
| An example grants full disclosure when the caller supplies `x-internal: 1`. | README quickstart. | Replace it with public disclosure or a server-verified principal; search all examples for equivalent patterns. |
| The fetch server reads the JSON body before calling a domain handler. | `src/server/serve.ts`. | Protect ingress before parsing; handler gates alone cannot bound parsing cost. |
| The Node bridge buffers the incoming body before invoking its fetch handler. | `src/node/to-node-handler.ts`. | Enforce byte limits and early admission at the Node boundary, not only around `serve()`. |
| Public disclosure preserves message text and issue messages, and filters `nextStep` heuristically. | `src/disclose.ts`. | Treat domain messages as explicitly public data or render them through a safe catalogue. Do not describe regex filtering as comprehensive redaction. |
| The client expects JSON error envelopes. An HTML or empty proxy rejection becomes a generic internal error. | `src/client/response.ts`. | Preserve typed HTTP/boundary failures, status and safe retry metadata independently of envelope decoding. |
| Policy examples are userland conventions, not mandatory route registration. The docs contain an `as never` example and stale error typing. | `docs/advanced-usage.md`. | Compile examples; distinguish type guidance from runtime security enforcement. |

These findings describe mechanisms and unsafe examples, not proof that an Eddy
deployment has been exploited.

### Kanon

Kanon describes an ELT-style workflow: immutable ingest, normalized canonical
sources, ontology-guided derived content, then a Fumadocs site. Its ontology and
operating conventions live largely in Cursor rules, skills and hooks.

Retain the source/derivative distinction, provenance, editorial corrections,
recoverable originals and human-readable files. The Cursor-first implementation
is historical context, **not** a design constraint.

### QMD: released versus unreleased

The latest GitHub release returned during this review is v2.8.3, published 16
August 2026. Start from a pinned released artifact. Do not make unreleased
metadata filtering a dependency of v0.1, and never make it an authorization
boundary.

## 2. Never-rest product boundary

Keep a small transport-independent core. Add optional boundary/policy modules
with narrow contracts.

**Core owns:** contracts, input/output validation, domain Result semantics, safe
error serialization, and transport-independent operation dispatch.

**Optional policy layer owns:** verified-principal interfaces, mandatory policy
registration, authorization composition, rate-limit adapters, resource-budget
interfaces and safe recovery metadata.

**HTTP/Node integration owns:** early admission, bounded request/response reads,
HTTP metadata, connection-disconnect propagation, trusted proxy integration and
compatibility with host middleware. The layer that actually reads bytes must
enforce its bounds.

**Deployment owns:** VPNs, TLS termination, firewalls, listener exposure,
operating-system isolation, external connection limits and volumetric
denial-of-service protection.

Do not ship an OAuth issuer, user directory, VPN, firewall or secret-management
service in never-rest. Do not require QMD, a database or an identity vendor as a
core dependency.

### Admission order

At the network boundary: server connection/header/read limits → trusted peer
information and cheap anonymous admission → credential verification → bounded
body parsing and validation → authorized operation → cost/concurrency admission
→ domain work → safe response.

At a local/MCP boundary: establish the trusted caller profile → validate
operation/input → authorize → apply relevant concurrency/budget checks → run the
same domain operation. Local transport removes a public listener, not the need
for authorization.

## 3. Backlog (never-rest only)

This research file records the review. Implementation of the never-rest items is
planned in `plans/20261011-never-rest-0.7-kanon-readiness.md` and the seven
`plans/20261011-nr-0*.md` files.

| ID | Priority | Deliverable |
| --- | --- | --- |
| NR-01 | P0 | Public-safe examples and explicit disclosure contract. |
| NR-02 | P0 | Early ingress and bounded byte reads in Node/fetch integration. |
| NR-03 | P0 | Mandatory operation-policy registration with verified principals. |
| NR-04 | P1 | Typed boundary errors and safe response metadata. |
| NR-05 | P1 | Limiter adapter and concurrency interfaces. |
| NR-06 | P1 | Cancellation and explicit retry semantics. |
| NR-07 | P1 | CI/spec/docs consistency. |

Knowledge-workspace items (KB-01–KB-14) belong in a fresh application
repository. They are not implemented here.

## Sources

Inspected 11 October 2026: never-rest 0.6.0 (`package.json`, README, `serve.ts`,
`to-node-handler.ts`, `disclose.ts`, `response.ts`, `docs/advanced-usage.md`,
CI), Kanon README and v1 reflection, QMD v2.8.3 release notes and tagged README,
QMD main-branch changelog (Unreleased). Re-check releases when implementation
begins.
