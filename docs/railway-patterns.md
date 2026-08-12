---
title: Railway patterns
description: Named railway and flow patterns for neverthrow + never-rest — gates, routers, tees, recover, fan-out, and a white-label tenant provisioning kitchen sink.
---

# Railway patterns

Most HTTP libraries teach you middleware, try/catch, and status codes. never-rest teaches you a **railway**: two tracks (`Ok` and `Err`), functions that stay on those tracks, and composition that short-circuits on failure. The peer library is [neverthrow](https://github.com/supermacro/neverthrow) ([npm](https://www.npmjs.com/package/neverthrow)). The metaphor that made the idea famous is Scott Wlaschin’s [Railway Oriented Programming](https://fsharpforfunandprofit.com/rop/) ([long-form post](https://fsharpforfunandprofit.com/posts/recipe-part2/), [slides](https://speakerdeck.com/swlaschin/railway-oriented-programming-a-functional-approach-to-error-handling)).

never-rest’s bet is blunt: put that railway at the HTTP boundary — handlers and clients both return `Result` / `ResultAsync` — and the usual middleware stack becomes ordinary TypeScript. This page names the patterns, shows them in neverthrow, and points at primary docs so you can learn the craft, not only the package.

Thesis and the short auth example: [concepts.md — No middleware](./concepts.md#no-middleware--the-chain-is-the-middleware). Graded disclosure and cause chains: [errors-as-intelligence.md](./errors-as-intelligence.md).

## Pattern catalogue

| Pattern | Job | Primitive | Fails the request? |
| --- | --- | --- | --- |
| [Gate](#gate-before) | May this continue? | [andThen](https://supermacro-neverthrow-22.mintlify.app/api/result/and-then) | Yes |
| [Router / distributor](#router--distributor) | Which continuation? | `andThen` + branch | Yes (chosen path may) |
| [Transform](#transform) | Reshape success, same failure modes | [map](https://supermacro-neverthrow-22.mintlify.app/api/result/map) | No |
| [Translate](#translate-maperr) | Relabel / unify the failure track | [mapErr](https://supermacro-neverthrow-22.mintlify.app/api/result/map-err) | No (already failed) |
| [Side effect (tee)](#side-effect-tee) | Observe without changing the value | [andTee](https://supermacro-neverthrow-22.mintlify.app/api/result/tee-methods) / [orTee](https://supermacro-neverthrow-22.mintlify.app/api/result/tee-methods) | No |
| [Through](#through-required-observation) | Observe, but observation may fail | [andThrough](https://supermacro-neverthrow-22.mintlify.app/api/result/through-methods) | Yes |
| [After-effect (required)](#after-effect-required) | Follow-up that must land | `andThen` | Yes |
| [After-effect (best-effort)](#after-effect-best-effort) | Follow-up that must not invent failure | `andTee` | No |
| [Recover / compensate](#recover--compensate) | Failure track → success track | [orElse](https://supermacro-neverthrow-22.mintlify.app/api/result/or-else) | Depends |
| [Fan-out + join](#fan-out--join) | Independent steps, all must succeed | [ResultAsync.combine](https://supermacro-neverthrow-22.mintlify.app/api/result-async/combine) | Yes (first `Err`) |
| [Accumulate](#accumulate) | Independent steps, collect every error | [combineWithAllErrors](https://supermacro-neverthrow-22.mintlify.app/api/result/combine) | Yes (all `Err`s) |
| [Lift / adapt](#lift--adapt) | Bring throwing or one-track code onto the railway | [fromThrowable](https://supermacro-neverthrow-22.mintlify.app/api/result/from-throwable) / [fromPromise](https://supermacro-neverthrow-22.mintlify.app/api/result-async/from-promise) | Yes if lift maps to `Err` |
| [Terminate / dead-end](#terminate--dead-end) | Leave the railway | [match](https://supermacro-neverthrow-22.mintlify.app/api/result/match) / [unwrapOr](https://supermacro-neverthrow-22.mintlify.app/api/result/unwrap-or) | N/A |
| [Bubble / cause-chain](#bubble--cause-chain) | Wrap a downstream failure inside a caller-facing one | [chain](./api#chain) | Yes |
| [Disclose](#disclose) | Redact at the edge by trust | [disclose](./api#disclose) | No |
| [Retry branch](#retry-branch) | Act on `retryable` | `match` / `orElse` | Product choice |

In Wlaschin’s vocabulary, `andThen` is **bind**, `map` is **map**, and `andTee` is **tee**. neverthrow’s README is the TypeScript handbook; the ROP talk is the intuition.

Wlaschin later wrote [Against Railway-Oriented Programming](https://fsharpforfunandprofit.com/posts/against-railway-oriented-programming/) — do not sprinkle `Result` into every pure helper. never-rest agrees: the railway belongs at **boundaries** (HTTP handlers, clients, gateways), where failure is part of the contract.

---

## Gate (before)

A gate answers “may this continue?” It returns `Ok` with context the rest of the chain needs, or `Err` with a declared code. Later steps never run on failure.

```ts
requireAuth(request)
  .andThen((session) => requireRole(session, 'billing'))
  .andThen((session) => loadInvoiceFor(session.userId, input.id))
```

Use a gate for auth, tenancy, blocking feature flags, idempotency-key uniqueness, and rate limits that should surface as `Err` rather than a silent drop.

neverthrow: [andThen](https://supermacro-neverthrow-22.mintlify.app/api/result/and-then). ROP: [switch functions + bind](https://fsharpforfunandprofit.com/posts/recipe-part2/).

## Router / distributor

A gate blocks or allows. A **router** (flow-based programming’s **distributor**) looks at the value and chooses which outlet to take — still one `Result` out, different continuations by content.

```ts
.andThen((tenant) => {
  switch (tenant.plan) {
    case 'starter':
      return provisionStarter(tenant);
    case 'pro':
      return provisionPro(tenant);
    case 'enterprise':
      return provisionEnterprise(tenant);
  }
})
```

Same shape for content-type negotiation, webhook event types, or “create vs update” forks after an existence check. The branch lives in the handler, not in a global middleware registry keyed by path.

## Transform

`map` reshapes an `Ok` value and leaves `Err` untouched. It cannot introduce a new failure mode — if the function can fail, that is `andThen`, not `map`.

```ts
loadUser(id).map((user) => ({
  id: user.id,
  displayName: user.name.trim(),
}))
```

neverthrow: [map](https://supermacro-neverthrow-22.mintlify.app/api/result/map). ROP: [one-track functions adapted with map](https://fsharpforfunandprofit.com/posts/recipe-part2/).

## Translate (mapErr)

`mapErr` reshapes the failure track — unify vendor errors onto your **declared** `RailError` codes, add `nextStep`, stamp `origin`, or narrow a wide union before the HTTP edge.

Do not `mapErr` into `internal` (or other reserved wire codes) inside handler pipelines expecting that message on the public wire — reserved codes are host-owned and normalised at disclosure. Use a domain code on the route's `errors` array; put downstream detail under `cause` for `full` disclosure.

```ts
billing.createCustomer(input).mapErr((e) =>
  e.code === 'card_declined'
    ? railError('payment_required', 'Plan payment failed', {
        nextStep: 'Update payment method and retry',
      })
    : railError('dependency_failed', 'Billing upstream failed', { retryable: true }),
)
```

neverthrow: [mapErr](https://supermacro-neverthrow-22.mintlify.app/api/result/map-err). Cross-service wrapping that preserves the downstream error as data uses [chain](./api#chain) (see [Bubble](#bubble--cause-chain)).

## Side effect (tee)

Tees watch the train without switching tracks. `andTee` runs on `Ok` and keeps the same `Ok`; `orTee` runs on `Err` and keeps the same `Err`. Errors thrown or returned inside the tee are discarded — observation must not invent a caller-visible failure.

```ts
loadInvoiceFor(session.userId, input.id)
  .andTee((invoice) => metrics.increment('invoice.read', { plan: invoice.plan }))
  .orTee((error) => log.warn('invoice.read_failed', { code: error.code }))
```

Use for logging, metrics, tracing, and debug dumps.

neverthrow: [andTee](https://supermacro-neverthrow-22.mintlify.app/api/result/tee-methods), [orTee](https://supermacro-neverthrow-22.mintlify.app/api/result/tee-methods). ROP: [tee](https://fsharpforfunandprofit.com/rop/).

## Through (required observation)

`andThrough` is the strict cousin of `andTee`: the callback returns a `Result`, success keeps the **original** `Ok` value, and failure becomes the chain’s `Err`. Use when “we must record this, or the operation did not really succeed” — without changing the success payload.

```ts
createOrder(input).andThrough((order) => writeAuditRequired(order.id))
```

neverthrow: [andThrough](https://supermacro-neverthrow-22.mintlify.app/api/result/through-methods) / `asyncAndThrough`.

## After-effect (required)

Sometimes success is incomplete until a follow-up lands — outbox row, webhook ack, reservation commit. Chain with `andThen` and return the value the route’s `output` schema expects:

```ts
createOrder(input).andThen((order) =>
  writeOutbox('order.created', order).map(() => order),
)
```

If `writeOutbox` fails, the handler returns that `Err`. The client never sees a half-finished success body for a step you declared as required.

## After-effect (best-effort)

When the domain result is already correct and a follow-up is optional, tee it:

```ts
createOrder(input)
  .andTee((order) => cache.warm(`order:${order.id}`, order))
  .andTee((order) => analytics.track('order_created', { id: order.id }))
```

Required vs best-effort is a product decision — encode it by choosing `andThen` / `andThrough` or `andTee`, not a middleware flag.

## Recover / compensate

`orElse` runs only on `Err` and can switch back to the success track (or replace one failure with another). That is the alternate outlet after a miss — default resource, fallback cache, “treat not_found as empty list”.

```ts
loadPrimaryConfig(tenantId)
  .orElse((error) =>
    error.code === 'not_found' ? loadDefaultConfig() : errAsync(error),
  )
```

Compensation for partial provisioning (refund after identity failed) is the same primitive with harder domain rules — still userland, still visible in the chain.

neverthrow: [orElse](https://supermacro-neverthrow-22.mintlify.app/api/result/or-else).

## Fan-out + join

When steps do **not** depend on each other, run them together and join. `combine` succeeds only if every arm is `Ok`; the first `Err` wins.

```ts
import { ResultAsync } from 'neverthrow';

ResultAsync.combine([
  fetchProfile(userId),
  fetchBilling(userId),
  fetchEntitlements(userId),
]).map(([profile, billing, entitlements]) => ({
  profile,
  billing,
  entitlements,
}))
```

Sequential provisioning (each step needs the previous id) stays on `andThen`. Independent hydration uses combine.

neverthrow: [Combining Results](https://supermacro-neverthrow-22.mintlify.app/guides/combining-results) · [Result.combine](https://supermacro-neverthrow-22.mintlify.app/api/result/combine).

## Accumulate

Validation often wants **every** problem, not the first. `combineWithAllErrors` joins independent checks and keeps the full error list.

```ts
import { Result, err, ok } from 'neverthrow';

const checks = [
  validateSlug(input.slug),
  validateName(input.name),
  validatePlan(input.plan),
];

Result.combineWithAllErrors(checks).mapErr((issues) =>
  railError('validation_error', 'Invalid tenant draft', {
    issues: issues.flatMap((e) => e.issues ?? []),
  }),
)
```

neverthrow: [combineWithAllErrors](https://supermacro-neverthrow-22.mintlify.app/api/result/combine). never-rest’s `parseInput` already maps Standard Schema issues onto `RailIssue[]` for request bodies — accumulate shines for multi-field domain rules beyond the schema.

## Lift / adapt

Legacy SDKs throw. Databases return bare promises. **Lift** them onto the railway at the edge of your module so the rest of the handler stays pure `Result` composition.

```ts
import { ResultAsync } from 'neverthrow';
import { railError } from '@eddy-works/never-rest';

const findUser = (id: string) =>
  ResultAsync.fromPromise(
    db.user.find(id),
    (cause) =>
      railError('dependency_failed', 'User lookup failed', {
        retryable: true,
        // attach cause via chain when the upstream is already a RailError
      }),
  ).andThen((user) =>
    user === null
      ? errAsync(railError('not_found', `User ${id} not found`))
      : okAsync(user),
  )
```

neverthrow: [Result.fromThrowable](https://supermacro-neverthrow-22.mintlify.app/api/result/from-throwable), [ResultAsync.fromPromise](https://supermacro-neverthrow-22.mintlify.app/api/result-async/from-promise), [fromSafePromise](https://supermacro-neverthrow-22.mintlify.app/api/utilities/from-safe-promise). ROP: [adapt exceptions to Result](https://fsharpforfunandprofit.com/rop/).

## Terminate / dead-end

Sooner or later you leave the railway — render HTTP, update UI, exit a CLI. `match` forces both tracks to be handled. `unwrapOr` supplies a default when an empty success is acceptable.

```ts
const result = await client.getUser({ id });

return result.match(
  (user) => Response.json(user, { status: 200 }),
  (error) => Response.json(error, { status: statusFor(statuses, error) }),
)
```

Inside never-rest, `respond` / `serve` are the framework’s terminate step: `Result` in, status + body out. Handlers should stay on the railway until that edge.

neverthrow: [match](https://supermacro-neverthrow-22.mintlify.app/api/result/match), [unwrapOr](https://supermacro-neverthrow-22.mintlify.app/api/result/unwrap-or). ROP: [dead-end functions](https://fsharpforfunandprofit.com/posts/recipe-part2/).

## Bubble / cause-chain

When a gateway calls a downstream service, do not flatten the failure into a string. Wrap it with [chain](./api#chain) so the downstream `RailError` survives as `cause`, with `origin` stamped per hop.

```ts
const downstream = await inventory.reserve(input);

if (downstream.isErr()) {
  return err(
    chain(
      {
        code: 'order_failed',
        message: 'Could not fulfil',
        origin: 'orders',
      },
      downstream.error,
    ),
  );
}
```

See [errors-as-intelligence.md — Gateway composition](./errors-as-intelligence.md#gateway-composition) and [specs/cause-chaining.spec.md](https://github.com/project-eddy/never-rest/blob/main/specs/cause-chaining.spec.md).

## Disclose

The same `RailError` can be rendered at `full`, `internal`, or `public` depending on who is calling. That is an edge pattern — redact after the railway has finished, not inside every domain step.

```ts
disclose(error, 'public') // drops cause, origin, diagnostic issue paths
```

[disclose](./api.md#disclose) · [concepts.md — Trust circles](./concepts.md#trust-circles-and-graded-disclosure).

## Retry branch

`retryable: true` marks failures that may succeed later (network `unavailable`, transient dependencies). Agents and orchestrators branch without parsing status text:

```ts
const result = await client.reserve({ sku, qty });

await result.match(
  (ok) => proceed(ok),
  (error) =>
    error.retryable
      ? scheduleRetry(error)
      : surface(error),
)
```

[errors-as-intelligence.md — Retryable](./errors-as-intelligence.md#retryable).

---

## Putting middleware jobs on one chain

One handler, no middleware stack — gates, tees, domain, required and best-effort after-effects:

```ts
getInvoice: ({ input, request }) =>
  requireAuth(request)
    .andThen((session) => requireRole(session, 'billing'))
    .andTee((session) => metrics.increment('invoice.auth_ok'))
    .andThen((session) => loadInvoiceFor(session.userId, input.id))
    .andTee((invoice) => audit.read('invoice', invoice.id))
    .andThen((invoice) => touchLastViewed(invoice.id).map(() => invoice)),
```

Read it top to bottom. That is the interceptor model.

Making that policy mandatory across routes — capability types, registration composers, and when host/gateway wraps still belong outside the railway — is covered in [advanced-usage.md](./advanced-usage.md).

---

## Kitchen sink — white-label enterprise tenant provisioning

Enterprise SaaS white-label is not “insert a tenant row”. It is a **business model encoded as an infrastructure pipeline**: contract and entitlement checks, geographic routing for latency and data residency, fault-tolerant Postgres, schema deploy, branded seed packs, custom-domain cutover. Middleware stacks hide that story across `app.use` layers. On a railway the whole provision run is one readable chain — [gates](#gate-before) at the start **and midway**, a [router](#router--distributor) for region/cloud, [fan-out](#fan-out--join) for schemas, [accumulate](#accumulate) for seed preflight, sequential seeds, [tees](#side-effect-tee), and a [required after-effect](#after-effect-required).

Scenario: an operator (or partner API) calls `provisionWhiteLabelTenant`. Every hard step **must succeed**. Infra is never created if the MSA is unsigned; schemas never deploy if the HA cluster is not ready; brand seeds never run if residency rejected the chosen region. Compensating teardown mid-flight remains userland [orElse](#recover--compensate) / saga — this example is **fail-stop provisioning of a unique customer deployment**.

```ts
import { Result, ResultAsync, ok, err, okAsync, errAsync } from 'neverthrow';
import { railError, type RailError } from '@eddy-works/never-rest';

type Session = { userId: string; roles: readonly string[] };

/** What sales sold — the business shape that becomes infra. */
type WhiteLabelDraft = {
  slug: string;
  displayName: string;
  customerId: string;
  /** Preferred geography; residency policy may override or reject. */
  regionPreference: 'eu' | 'us' | 'apac';
  dataResidency: 'eu-only' | 'us-only' | 'unrestricted';
  tier: 'standard' | 'mission_critical';
  brandPackId: string;
  customDomain: string;
  seedManifest: readonly SeedSpec[];
};

type SeedSpec = { id: string; path: string };

type EntitledDraft = WhiteLabelDraft & { entitlementId: string; msaId: string };
type ReservedSlug = EntitledDraft & { reservationId: string };
type RegionTarget = {
  cloud: 'aws' | 'gcp';
  region: 'eu-west-1' | 'us-east-1' | 'ap-southeast-1';
};
type RoutedDraft = ReservedSlug & { target: RegionTarget };
type CapacityOk = RoutedDraft & { capacityTicket: string };
type ClusterHandle = CapacityOk & { clusterId: string };
type ReadyCluster = ClusterHandle & { primaryUrl: string; replicaUrls: readonly string[] };
type Schematized = ReadyCluster & { schemas: readonly ('app' | 'audit' | 'billing' | 'brand')[] };
type Migrated = Schematized & { migrationHead: string };
type Seeded = Migrated & { seeded: readonly string[] };
type DomainWired = Seeded & { dnsRecordId: string };
type ProvisionedTenant = DomainWired & { tenantId: string; status: 'live' };

type ProvisionError = RailError<
  | 'unauthorized'
  | 'forbidden'
  | 'conflict'
  | 'contract_incomplete'
  | 'entitlement_denied'
  | 'residency_violation'
  | 'capacity_exhausted'
  | 'quota_exceeded'
  | 'dependency_failed'
  | 'migration_failed'
  | 'seed_failed'
  | 'validation_error'
  | 'dns_pending'
  | 'internal'
>;

function requireAuth(request: Request): ResultAsync<Session, ProvisionError> { /* … */ }
function requireRole(session: Session, role: string): ResultAsync<Session, ProvisionError> { /* … */ }

/** Midway gate — commercial reality before any cloud spend. */
function requireSignedMsaAndEntitlement(
  draft: WhiteLabelDraft,
): ResultAsync<EntitledDraft, ProvisionError> {
  return contracts.getActiveMsa(draft.customerId).andThen((msa) => {
    if (msa.status !== 'signed') {
      return errAsync(
        railError('contract_incomplete', 'Customer MSA is not signed', {
          nextStep: 'Complete MSA countersignature before provisioning',
        }),
      );
    }
    return entitlements
      .require(draft.customerId, 'white_label', draft.tier)
      .mapErr(() =>
        railError('entitlement_denied', 'White-label entitlement missing for tier', {
          nextStep: 'Upgrade the customer entitlement or change tier',
        }),
      )
      .map((entitlementId) => ({
        ...draft,
        msaId: msa.id,
        entitlementId,
      }));
  });
}

function reserveSlug(draft: EntitledDraft): ResultAsync<ReservedSlug, ProvisionError> {
  return registry.reserveSlug(draft.slug).mapErr((e) =>
    e.kind === 'taken'
      ? railError('conflict', `Tenant slug ${draft.slug} is taken`, {
          nextStep: 'Choose another slug',
        })
      : railError('dependency_failed', 'Slug registry unavailable', { retryable: true }),
  ).map((reservationId) => ({ ...draft, reservationId }));
}

/**
 * Router — geography / cloud service selection.
 * Business inputs (preference + residency) decide which fault domain we build in.
 */
function routeRegion(draft: ReservedSlug): ResultAsync<RoutedDraft, ProvisionError> {
  const table: Record<
    WhiteLabelDraft['regionPreference'],
    RegionTarget
  > = {
    eu: { cloud: 'aws', region: 'eu-west-1' },
    us: { cloud: 'aws', region: 'us-east-1' },
    apac: { cloud: 'gcp', region: 'ap-southeast-1' },
  };
  const target = table[draft.regionPreference];
  return okAsync({ ...draft, target });
}

/** Midway gate — legal residency must accept the routed region. */
function requireResidencyAllows(draft: RoutedDraft): ResultAsync<RoutedDraft, ProvisionError> {
  const okRegion =
    draft.dataResidency === 'unrestricted' ||
    (draft.dataResidency === 'eu-only' && draft.target.region.startsWith('eu')) ||
    (draft.dataResidency === 'us-only' && draft.target.region.startsWith('us'));

  return okRegion
    ? okAsync(draft)
    : errAsync(
        railError('residency_violation', 'Routed region violates data residency', {
          nextStep: 'Change regionPreference to match dataResidency, or amend the MSA',
        }),
      );
}

/** Midway gate — region must have HA capacity for mission_critical. */
function requireRegionCapacity(draft: RoutedDraft): ResultAsync<CapacityOk, ProvisionError> {
  return capacity
    .reserve({
      ...draft.target,
      ha: draft.tier === 'mission_critical',
    })
    .mapErr((e) =>
      e.kind === 'exhausted'
        ? railError('capacity_exhausted', `No HA capacity in ${draft.target.region}`, {
            nextStep: 'Pick another regionPreference or wait for capacity',
            retryable: true,
          })
        : railError('dependency_failed', 'Capacity service unavailable', { retryable: true }),
    )
    .map((capacityTicket) => ({ ...draft, capacityTicket }));
}

/** Fault-tolerant Postgres for this tenant’s white-label cell. */
function createHaCluster(draft: CapacityOk): ResultAsync<ClusterHandle, ProvisionError> {
  return cloud
    .createPostgres({
      name: draft.slug,
      cloud: draft.target.cloud,
      region: draft.target.region,
      multiAz: draft.tier === 'mission_critical',
      replicas: draft.tier === 'mission_critical' ? 2 : 1,
    })
    .mapErr(() =>
      railError('dependency_failed', 'Cloud createPostgres failed', { retryable: true }),
    )
    .map((clusterId) => ({ ...draft, clusterId }));
}

function waitUntilReady(handle: ClusterHandle): ResultAsync<ReadyCluster, ProvisionError> {
  return cloud
    .waitHealthy(handle.clusterId)
    .mapErr((e) =>
      e.kind === 'timeout'
        ? railError('dependency_failed', 'Cluster did not become ready in time', {
            retryable: true,
            nextStep: 'Retry provisionWhiteLabelTenant or inspect cloud health',
          })
        : railError('dependency_failed', 'Cluster health check failed', { retryable: true }),
    )
    .map(({ primaryUrl, replicaUrls }) => ({ ...handle, primaryUrl, replicaUrls }));
}

/** Fan-out — product schemas for this cell; all must succeed. */
function deploySchemas(cluster: ReadyCluster): ResultAsync<Schematized, ProvisionError> {
  const names = ['app', 'audit', 'billing', 'brand'] as const;
  return ResultAsync.combine(
    names.map((schema) =>
      pg.createSchema(cluster.primaryUrl, schema).mapErr(() =>
        railError('dependency_failed', `Schema ${schema} deploy failed`, { retryable: true }),
      ),
    ),
  ).map(() => ({ ...cluster, schemas: names }));
}

function applyMigrations(cluster: Schematized): ResultAsync<Migrated, ProvisionError> {
  return migrator
    .up(cluster.primaryUrl, { schemas: cluster.schemas })
    .mapErr((e) =>
      railError('migration_failed', e.message ?? 'Migration failed', {
        nextStep: 'Fix the failing migration and retry from migrationHead',
      }),
    )
    .map((migrationHead) => ({ ...cluster, migrationHead }));
}

/** Accumulate — every brand/seed path checked before first write. */
function preflightSeeds(
  cluster: Migrated,
  manifest: readonly SeedSpec[],
): ResultAsync<Migrated, ProvisionError> {
  const checked = Result.combineWithAllErrors(
    manifest.map((seed) =>
      seedFiles.exists(seed.path)
        ? ok(seed)
        : err(
            railError('validation_error', `Missing seed file ${seed.path}`, {
              issues: [{ path: [seed.id], message: 'file not found' }],
            }),
          ),
    ),
  ).mapErr((errors) =>
    railError('validation_error', 'Seed manifest failed preflight', {
      issues: errors.flatMap((e) => e.issues ?? []),
      nextStep: 'Fix brand pack seed paths and retry',
    }),
  );

  return checked.match(
    () => okAsync(cluster),
    (error) => errAsync(error),
  );
}

/** Sequential seeds — brand pack + reference data; later never runs if earlier fails. */
function runSeedScripts(
  cluster: Migrated,
  manifest: readonly SeedSpec[],
): ResultAsync<Seeded, ProvisionError> {
  return manifest
    .reduce(
      (acc, seed) =>
        acc.andThen((done) =>
          pg
            .runSqlFile(cluster.primaryUrl, seed.path)
            .map(() => [...done, seed.id] as const)
            .mapErr(() =>
              railError('seed_failed', `Seed ${seed.id} failed`, {
                nextStep: `Fix ${seed.path} and re-run remaining seeds after ${done.at(-1) ?? 'migrations'}`,
              }),
            ),
        ),
      okAsync([] as readonly string[]),
    )
    .map((seeded) => ({ ...cluster, seeded }));
}

function attachBrandPack(seeded: Seeded): ResultAsync<Seeded, ProvisionError> {
  return brands
    .materialize(seeded.primaryUrl, seeded.brandPackId)
    .map(() => seeded)
    .mapErr(() =>
      railError('dependency_failed', 'Brand pack materialize failed', { retryable: true }),
    );
}

function wireCustomDomain(seeded: Seeded): ResultAsync<DomainWired, ProvisionError> {
  return dns
    .upsertCname({
      host: seeded.customDomain,
      target: `edge.${seeded.target.region}.example.com`,
    })
    .mapErr((e) =>
      e.kind === 'pending'
        ? railError('dns_pending', 'Custom domain DNS not yet propagated', {
            retryable: true,
            nextStep: 'Wait for DNS and retry from wireCustomDomain',
          })
        : railError('dependency_failed', 'DNS upsert failed', { retryable: true }),
    )
    .map((dnsRecordId) => ({ ...seeded, dnsRecordId }));
}

/** Midway gate — do not mark live until smoke against primary + replica passes. */
function requireSmokeHealthy(wired: DomainWired): ResultAsync<DomainWired, ProvisionError> {
  return health
    .smoke({ primaryUrl: wired.primaryUrl, replicas: wired.replicaUrls })
    .mapErr(() =>
      railError('dependency_failed', 'Post-provision smoke failed', {
        retryable: true,
        nextStep: 'Inspect cluster health; retry smoke before go-live',
      }),
    )
    .map(() => wired);
}

function persistLiveTenant(
  wired: DomainWired,
  actor: Session,
): ResultAsync<ProvisionedTenant, ProvisionError> {
  return tenants
    .insertLive({
      ...wired,
      createdBy: actor.userId,
    })
    .mapErr(() =>
      railError('dependency_failed', 'Could not persist live tenant row', { retryable: true }),
    )
    .map((tenantId) => ({ ...wired, tenantId, status: 'live' as const }));
}

function emitProvisioned(
  tenant: ProvisionedTenant,
): ResultAsync<ProvisionedTenant, ProvisionError> {
  return outbox
    .write('tenant.whitelabel_provisioned', tenant)
    .map(() => tenant)
    .mapErr(() =>
      railError('dependency_failed', 'Outbox write failed after white-label provision', {
        retryable: true,
      }),
    );
}

// Handler — commercial gates, geo router, residency/capacity gates, HA infra,
// schemas, migrations, brand seeds, DNS, smoke gate, outbox, tees.
provisionWhiteLabelTenant: ({ input, request }) =>
  requireAuth(request)
    .andThen((session) => requireRole(session, 'operator'))
    .andTee((session) =>
      metrics.increment('tenant.whitelabel_attempt', { by: session.userId }),
    )
    .andThen((session) =>
      requireSignedMsaAndEntitlement(input) // midway gate: contract
        .andThen((entitled) => reserveSlug(entitled))
        .andThen((reserved) => routeRegion(reserved)) // router: geo / cloud
        .andThen((routed) => requireResidencyAllows(routed)) // midway gate: residency
        .andThen((routed) => requireRegionCapacity(routed)) // midway gate: capacity
        .andThen((capacityOk) => createHaCluster(capacityOk))
        .andThen((handle) => waitUntilReady(handle))
        .andThen((ready) => deploySchemas(ready)) // fan-out
        .andThen((schematized) => applyMigrations(schematized))
        .andThen((migrated) => preflightSeeds(migrated, input.seedManifest)) // accumulate
        .andThen((migrated) => runSeedScripts(migrated, input.seedManifest))
        .andThen((seeded) => attachBrandPack(seeded))
        .andThen((seeded) => wireCustomDomain(seeded))
        .andThen((wired) => requireSmokeHealthy(wired)) // midway gate: go-live
        .andThen((wired) => persistLiveTenant(wired, session))
        .andThen((live) => emitProvisioned(live)) // required after-effect
        .andTee((live) =>
          audit.write('tenant.whitelabel_provisioned', {
            tenantId: live.tenantId,
            region: live.target.region,
            actor: session.userId,
          }),
        )
        .andTee((live) =>
          metrics.increment('tenant.whitelabel_ok', {
            tier: live.tier,
            region: live.target.region,
          }),
        )
        .orTee((error) =>
          metrics.increment('tenant.whitelabel_fail', { code: error.code }),
        ),
    ),
```

What this buys you over a middleware stack:

1. **The business model is visible** — MSA/entitlement → slug → geo router → residency → capacity → HA Postgres → schemas → migrations → brand seeds → DNS → smoke → live row → outbox.
2. **Midway gates are first-class** — commercial, legal, capacity, and go-live checks sit in the chain where the decision actually belongs, not only at the HTTP edge.
3. **Geography is a router, not a config flag scattered across jobs** — `routeRegion` turns preference + policy into a concrete cloud fault domain.
4. **Parallel only where safe** — schemas [combine](https://supermacro-neverthrow-22.mintlify.app/api/result/combine); seeds stay sequential.
5. **Failure stops the line** — no cloud spend without a signed MSA; no seeds if residency rejected the region; no `live` without smoke.
6. **Codes stay declared** — `contract_incomplete`, `residency_violation`, `capacity_exhausted`, `migration_failed`, … mapped by your `StatusMap`.
7. **Required vs best-effort is local** — outbox `andThen`; audit/metrics `andTee`.

Compensation (tear down a half-built cell after `migration_failed`) is real distributed-systems work — [recover](#recover--compensate) / saga in userland. The point of the railway here is that **unique customer deployments are infrastructure management systems**, and senior engineers can read the provision story top to bottom instead of reconstructing it from middleware order.

---

## Further reading

| Resource | Why |
| --- | --- |
| [Railway Oriented Programming](https://fsharpforfunandprofit.com/rop/) (Wlaschin) | The metaphor, slides, and talk index |
| [Railway oriented programming](https://fsharpforfunandprofit.com/posts/recipe-part2/) | Bind, map, tee, adapters in prose |
| [Against Railway-Oriented Programming](https://fsharpforfunandprofit.com/posts/against-railway-oriented-programming/) | When *not* to use `Result` everywhere |
| [neverthrow API docs](https://supermacro-neverthrow-22.mintlify.app/introduction) | Method pages for map, andThen, tee, combine, … |
| [neverthrow on GitHub](https://github.com/supermacro/neverthrow) / [npm](https://www.npmjs.com/package/neverthrow) | Source, README, package |
| [Combining Results](https://supermacro-neverthrow-22.mintlify.app/guides/combining-results) | Fan-out vs andThen |
| [Error Recovery](https://supermacro-neverthrow-22.mintlify.app/guides/error-recovery) | orElse, match, unwrapOr |
| [neverthrow tutorial](https://dj-nuo.com/blog/2025/10/08/neverthrow-tutorial/) | Practical map / andThen / andTee walkthrough |
| [concepts.md](./concepts.md) | Railway at the HTTP boundary; no middleware |
| [errors-as-intelligence.md](./errors-as-intelligence.md) | `nextStep`, `origin`, `retryable`, gateway chains |
| [comparison.md](./comparison.md) | Why never-rest chooses `Result` over throw-based servers |
