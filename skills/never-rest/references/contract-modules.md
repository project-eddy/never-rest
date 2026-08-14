# Contract modules

The contract is the shared HTTP law. Keep it in its own module so handlers,
`serve`, hosts, clients, OpenAPI, and tests all import the same object.

## Do

- Keep contracts in their own module (or package), not next to `serve` or `main()`.
- One `ContractDef` per service / bounded context; a module may export several.
- Export each as `as const satisfies ContractDef` plus the schemas it owns.
- Import that module from handlers, `serve`, `createClient`, and `toOpenAPI`.
- Share a package when more than one app or process must stay on the same law
  (see [`examples/packages/shared-contract`](../../../examples/packages/shared-contract)).

## Do not

- Bury a `ContractDef` next to `serve`, handlers, or a demo `main()` in the
  same file. That couples the wire law to one runtime and makes a second
  client or OpenAPI export a copy-paste.
- Put handlers, `serve`, or host mounts in the contract module. Lesson 1 is
  the bar: contract + schemas only.
- Put byte paths (multipart, SSE) on the contract you pass to `serve`. Those
  stay on the host — see [files-and-streams.md](../../../docs/files-and-streams.md).

## Shape

```ts
// contract.ts
import { z } from 'zod';
import type { ContractDef } from '@eddy-works/never-rest/contract';

export const inventoryContract = {
  reserve: {
    method: 'POST',
    path: '/reserve',
    body: z.object({ sku: z.string(), qty: z.number().int().positive() }),
    output: z.object({ reservationId: z.string() }),
    errors: { not_found: 404 },
  },
} as const satisfies ContractDef;
```

Several services in one demo → several named exports in one module:
[`examples/gateway/src/contract.ts`](../../../examples/gateway/src/contract.ts).
One catalog → one export:
[`examples/files-and-streams/src/contract.ts`](../../../examples/files-and-streams/src/contract.ts).
