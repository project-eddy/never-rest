#!/usr/bin/env node
/**
 * On-demand TypeScript trace diagnostic for perf fixtures (not a CI gate).
 *
 * Generates a compiler trace for one combined bench and prints a summary via
 * @typescript/analyze-trace.
 *
 * Usage:
 *   node scripts/typeperf-trace.mjs
 *   node scripts/typeperf-trace.mjs perf/benches/combined-20.bench.ts
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const root = fileURLToPath(new URL('..', import.meta.url));
const perfDir = join(root, 'perf');
const target =
  process.argv[2] ?? join(perfDir, 'benches/combined-20.bench.ts');
const traceDir = mkdtempSync(join(tmpdir(), 'never-rest-trace-'));

try {
  console.log(`typeperf-trace: tracing ${target}`);
  console.log(`typeperf-trace: output ${traceDir}`);

  const tsc = spawnSync(
    'npx',
    [
      'tsc',
      '--noEmit',
      '--generateTrace',
      traceDir,
      '-p',
      join(perfDir, 'tsconfig.json'),
    ],
    { cwd: root, stdio: 'inherit' },
  );
  if (tsc.status !== 0) {
    process.exit(tsc.status ?? 1);
  }

  const analyze = spawnSync(
    'npx',
    ['analyze-trace', traceDir],
    { cwd: root, stdio: 'inherit' },
  );
  process.exit(analyze.status ?? 0);
} finally {
  rmSync(traceDir, { recursive: true, force: true });
}
