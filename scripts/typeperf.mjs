#!/usr/bin/env node
/**
 * Type-performance CI gate for never-rest.
 *
 * 1. Verifies the TypeScript compiler version matches perf/baseline.json.
 * 2. Runs isolated @ark/attest benches (inline instantiation snapshots).
 * 3. Recomputes per-route slopes and fails if the gated series exceeds budget.
 *
 * Usage:
 *   node scripts/typeperf.mjs
 *   node scripts/typeperf.mjs --self-test   # verify gate catches runaway instantiations
 */
import { readFileSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const perfDir = join(root, "perf");
const benchDir = join(perfDir, "benches");
const baselinePath = join(perfDir, "baseline.json");

const selfTest = process.argv.includes("--self-test");

/** Least-squares slope and intercept for y = intercept + slope * x. */
function linearRegression(xs, ys) {
  const n = xs.length;
  const sumX = xs.reduce((a, b) => a + b, 0);
  const sumY = ys.reduce((a, b) => a + b, 0);
  const sumXY = xs.reduce((a, x, i) => a + x * ys[i], 0);
  const sumXX = xs.reduce((a, x) => a + x * x, 0);
  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;
  return { intercept: Math.round(intercept), slopePerRoute: Math.round(slope) };
}

function readBaseline() {
  return JSON.parse(readFileSync(baselinePath, "utf8"));
}

function assertTypeScriptVersion(baseline) {
  const result = spawnSync("npx", ["tsc", "--version"], {
    cwd: root,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    console.error("typeperf: failed to read TypeScript version");
    process.exit(result.status ?? 1);
  }
  const match = result.stdout.match(/(\d+\.\d+\.\d+)/);
  const version = match?.[1];
  if (version !== baseline.typescript) {
    console.error(
      `typeperf: TypeScript ${version} does not match baseline ${baseline.typescript}. ` +
        "Re-measure and update perf/baseline.json after upgrading TypeScript.",
    );
    process.exit(1);
  }
}

function assertSlopeBudget(baseline) {
  const { gate, routeCounts, series } = baseline;
  const gated = series[gate.series];
  if (!gated) {
    console.error(`typeperf: unknown gate series "${gate.series}"`);
    process.exit(1);
  }
  const ys = routeCounts.map((c) => gated.counts[String(c)]);
  const measured = linearRegression(routeCounts, ys);
  if (measured.slopePerRoute > gate.maxSlopePerRoute) {
    console.error(
      `typeperf: ${gate.series} slope ${measured.slopePerRoute} instantiations/route ` +
        `exceeds budget ${gate.maxSlopePerRoute}/route`,
    );
    process.exit(1);
  }
  console.log(
    `typeperf: ${gate.series} slope ${measured.slopePerRoute}/route ` +
      `(budget ${gate.maxSlopePerRoute}/route)`,
  );
}

function runBench(fileName) {
  const benchPath = join(benchDir, fileName);
  console.log(`\n=== ${fileName} ===`);
  const result = spawnSync("node", ["--experimental-strip-types", benchPath], {
    cwd: perfDir,
    env: process.env,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function runBenches() {
  const files = readdirSync(benchDir)
    .filter((f) => f.endsWith(".bench.ts") && !f.startsWith("_"))
    .sort();

  if (files.length === 0) {
    console.error("typeperf: no bench files found in perf/benches/");
    process.exit(1);
  }

  for (const file of files) {
    runBench(file);
  }
}

function runSelfTest() {
  console.log(
    "\n=== self-test: recursive conditional probe (expect failure) ===",
  );
  const result = spawnSync(
    "node",
    [
      "--experimental-strip-types",
      join(benchDir, "_recursive-gate-probe.bench.ts"),
    ],
    {
      cwd: perfDir,
      env: process.env,
      encoding: "utf8",
    },
  );
  if (result.status === 0) {
    console.error(
      "typeperf self-test: probe bench passed but should have failed",
    );
    process.exit(1);
  }
  console.log("typeperf self-test: probe correctly failed the gate");
}

const baseline = readBaseline();
assertTypeScriptVersion(baseline);
runBenches();
assertSlopeBudget(baseline);

if (selfTest) {
  runSelfTest();
}

console.log("\ntypeperf: all checks passed");
