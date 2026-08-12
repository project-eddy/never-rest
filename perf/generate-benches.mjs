import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Generate isolated @ark/attest bench files under perf/benches/.
 *
 * After regenerating, refresh inline snapshots:
 *   cd perf && ATTEST_updateSnapshots=1 node --experimental-strip-types benches/combined-20.bench.ts
 * Then re-run all benches and update perf/baseline.json slopes.
 */

const outDir = join(import.meta.dirname, "benches");
mkdirSync(outDir, { recursive: true });

const counts = [1, 5, 20, 40];

function routeEntries(n) {
  return Array.from({ length: n }, (_, i) => {
    return `  getRoute${i}: {
    method: 'GET' as const,
    path: '/items/${i}',
    query: zodSchema(z.object({ id: z.string() })),
    output: zodSchema(z.object({ id: z.string(), value: z.number() })),
    errors: ['not_found', 'forbidden'] as const,
  },`;
  }).join("\n");
}

const header = `import { bench } from '@ark/attest';
import { z } from 'zod';
import { zodSchema } from '../fixtures/schema.ts';
import type { ContractDef } from '../../src/contract/types.js';

undefined as undefined;
`;

for (const n of counts) {
  const routes = routeEntries(n);

  writeFileSync(
    join(outDir, `contract-${n}.bench.ts`),
    `${header}
bench('contract-satisfies-${n}', () => {
  const contract = {
${routes}
  } satisfies ContractDef;
  return contract;
}).types();
`,
  );

  writeFileSync(
    join(outDir, `client-${n}.bench.ts`),
    `${header}
import type { Client } from '../../src/client/types.js';

bench('client-${n}', () => {
  const contract = {
${routes}
  } satisfies ContractDef;
  return {} as Client<typeof contract>;
}).types();
`,
  );

  writeFileSync(
    join(outDir, `combined-${n}.bench.ts`),
    `${header}
import type { Client } from '../../src/client/types.js';

bench('combined-${n}', () => {
  const contract = {
${routes}
  } satisfies ContractDef;
  return {} as Client<typeof contract>;
}).types();
`,
  );

  writeFileSync(
    join(outDir, `plain-${n}.bench.ts`),
    `${header}
bench('plain-${n}', () => {
  const contract = {
${routes}
  };
  return contract;
}).types();
`,
  );

  writeFileSync(
    join(outDir, `handlers-${n}.bench.ts`),
    `${header}
import type { Handlers } from '../../src/server/serve.js';

bench('handlers-${n}', () => {
  const contract = {
${routes}
  } satisfies ContractDef;
  return {} as Handlers<typeof contract, unknown>;
}).types();
`,
  );
}

console.log("Generated bench files for", counts.join(", "));
