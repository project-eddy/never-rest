# Validators (Standard Schema)

Same `users` contract rewritten with three Standard Schema libraries.
`serve` / handlers stay identical — only the schemas change.

**Protocol win.** Standard Schema is not only request validation: the same schemas define
the wire output never-rest always parses and serialises. (Parsed-output
stripping is asserted in `pnpm test` via `src/protocol/parsed-output.test.ts`.)

| File | Validator |
| --- | --- |
| [`src/contracts/zod.ts`](src/contracts/zod.ts) | Zod 4 |
| [`src/contracts/valibot.ts`](src/contracts/valibot.ts) | Valibot |
| [`src/contracts/arktype.ts`](src/contracts/arktype.ts) | ArkType |

Framework mounts under `examples/` keep using Zod via
[`shared-contract`](../packages/shared-contract). This package is the lesson
for “bring your own validator.”

## Yup and friends

never-rest validates through [Standard Schema](https://standardschema.dev/)
(`~standard`). Yup does not implement that interface, so Yup schemas are not
accepted. Use Zod, Valibot, ArkType, or any other Standard Schema library.

## Run

```bash
pnpm install
pnpm build
pnpm --filter @never-rest-examples/validators start
```

Expected output:

```
zod      valid=201  invalid=400
valibot  valid=201  invalid=400
arktype  valid=201  invalid=400
```

## Side by side

`createUser` body — non-empty `name`:

```ts
// Zod
z.object({ name: z.string().min(1) })

// Valibot
v.object({ name: v.pipe(v.string(), v.minLength(1)) })

// ArkType
type({ name: 'string>0' })
```
