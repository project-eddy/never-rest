#!/usr/bin/env node
/**
 * Per-function CRAP (Change Risk Anti-Patterns) for src/.
 *
 * CRAP(m) = comp(m)^2 * (1 - cov(m)/100)^3 + comp(m)
 *   — Savoia & Evans, 2007
 *
 * Cyclomatic complexity from the TypeScript AST (McCabe: 1 + decisions).
 * Coverage from Vitest's Istanbul JSON (`coverage/coverage-final.json`).
 *
 * Usage:
 *   pnpm test:coverage && node scripts/crap.mjs
 *   node scripts/crap.mjs --fail-on 8
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "src");
const COVERAGE_JSON = join(ROOT, "coverage", "coverage-final.json");
const THRESHOLD = 8;

const EXCLUDE = [".test.ts", ".test-d.ts", "/fixtures/"];

function parseArgs(argv) {
  let failOn = undefined;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--fail-on") {
      failOn = Number(argv[i + 1]);
      i += 1;
    }
  }
  return { failOn };
}

function collectTsFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectTsFiles(path));
      continue;
    }
    if (!entry.name.endsWith(".ts")) {
      continue;
    }
    const rel = relative(ROOT, path).replaceAll("\\", "/");
    if (EXCLUDE.some((token) => rel.includes(token))) {
      continue;
    }
    files.push(path);
  }
  return files;
}

function isDecisionOperator(kind) {
  return (
    kind === ts.SyntaxKind.AmpersandAmpersandToken ||
    kind === ts.SyntaxKind.BarBarToken ||
    kind === ts.SyntaxKind.QuestionQuestionToken
  );
}

function complexityIn(node, skipNested) {
  let extra = 0;

  function visit(child) {
    if (skipNested.has(child)) {
      return;
    }
    switch (child.kind) {
      case ts.SyntaxKind.IfStatement:
      case ts.SyntaxKind.ForStatement:
      case ts.SyntaxKind.ForInStatement:
      case ts.SyntaxKind.ForOfStatement:
      case ts.SyntaxKind.WhileStatement:
      case ts.SyntaxKind.DoStatement:
      case ts.SyntaxKind.CatchClause:
      case ts.SyntaxKind.ConditionalExpression:
        extra += 1;
        break;
      case ts.SyntaxKind.CaseClause:
        extra += 1;
        break;
      case ts.SyntaxKind.BinaryExpression:
        if (isDecisionOperator(child.operatorToken.kind)) {
          extra += 1;
        }
        break;
      default:
        break;
    }
    ts.forEachChild(child, visit);
  }

  visit(node);
  return 1 + extra;
}

function functionName(node, sourceFile) {
  if (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) {
    return node.name?.getText(sourceFile) ?? "<anonymous>";
  }
  if (ts.isConstructorDeclaration(node)) {
    return "constructor";
  }
  if (ts.isFunctionExpression(node) || ts.isArrowFunction(node)) {
    const parent = node.parent;
    if (ts.isVariableDeclaration(parent) && parent.name) {
      return parent.name.getText(sourceFile);
    }
    if (ts.isPropertyAssignment(parent) && ts.isIdentifier(parent.name)) {
      return parent.name.text;
    }
    if (
      ts.isBinaryExpression(parent) &&
      ts.isIdentifier(parent.left) &&
      parent.operatorToken.kind === ts.SyntaxKind.EqualsToken
    ) {
      return parent.left.text;
    }
    if (
      ts.isPropertyDeclaration(parent) &&
      parent.initializer === node &&
      ts.isIdentifier(parent.name)
    ) {
      return parent.name.text;
    }
    return "<anonymous>";
  }
  return "<anonymous>";
}

function nestedFunctionNodes(body) {
  const nested = new Set();
  function visit(node) {
    if (
      node !== body &&
      (ts.isFunctionDeclaration(node) ||
        ts.isFunctionExpression(node) ||
        ts.isArrowFunction(node) ||
        ts.isMethodDeclaration(node) ||
        ts.isConstructorDeclaration(node))
    ) {
      nested.add(node);
      return;
    }
    ts.forEachChild(node, visit);
  }
  ts.forEachChild(body, visit);
  return nested;
}

function collectFunctions(sourceFile) {
  const functions = [];

  function visit(node) {
    const isFn =
      ts.isFunctionDeclaration(node) ||
      ts.isFunctionExpression(node) ||
      ts.isArrowFunction(node) ||
      ts.isMethodDeclaration(node) ||
      ts.isConstructorDeclaration(node);

    if (isFn && node.body) {
      const nested = nestedFunctionNodes(node.body);
      const start = sourceFile.getLineAndCharacterOfPosition(
        node.getStart(sourceFile),
      );
      functions.push({
        name: functionName(node, sourceFile),
        line: start.line + 1,
        complexity: complexityIn(node.body, nested),
      });
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return functions;
}

function loadCoverage() {
  try {
    statSync(COVERAGE_JSON);
  } catch {
    console.error(
      `Missing ${relative(ROOT, COVERAGE_JSON)}. Run pnpm test:coverage first.`,
    );
    process.exit(2);
  }
  return JSON.parse(readFileSync(COVERAGE_JSON, "utf8"));
}

function coverageKey(absPath) {
  const rel = relative(ROOT, absPath).replaceAll("\\", "/");
  return Object.keys(coverageByPath).find((key) => {
    const normalised = key.replaceAll("\\", "/");
    return normalised.endsWith(`/${rel}`) || normalised.endsWith(rel);
  });
}

let coverageByPath = {};

function functionCoverage(fileKey, line) {
  const file = coverageByPath[fileKey];
  if (file === undefined) {
    return 0;
  }

  if (file.fnMap !== undefined && file.f !== undefined) {
    for (const [id, meta] of Object.entries(file.fnMap)) {
      const startLine = meta.decl?.start?.line ?? meta.loc?.start?.line;
      if (startLine === line) {
        const hits = file.f[id] ?? 0;
        return hits > 0 ? statementCoverage(file, meta.loc) : 0;
      }
    }
  }

  return statementCoverage(file, {
    start: { line },
    end: { line: line + 40 },
  });
}

function statementCoverage(file, loc) {
  if (file.statementMap === undefined || file.s === undefined) {
    return file.s === undefined ? 0 : 100;
  }
  const start = loc?.start?.line;
  const end = loc?.end?.line ?? start;
  if (start === undefined) {
    return 0;
  }

  let total = 0;
  let hit = 0;
  for (const [id, span] of Object.entries(file.statementMap)) {
    const line = span.start?.line;
    if (line === undefined || line < start || line > end) {
      continue;
    }
    total += 1;
    if ((file.s[id] ?? 0) > 0) {
      hit += 1;
    }
  }
  if (total === 0) {
    return 100;
  }
  return (hit / total) * 100;
}

function crapScore(complexity, coveragePercent) {
  const uncovered = 1 - coveragePercent / 100;
  return complexity ** 2 * uncovered ** 3 + complexity;
}

function main() {
  const { failOn } = parseArgs(process.argv.slice(2));
  coverageByPath = loadCoverage();

  const rows = [];
  for (const path of collectTsFiles(SRC)) {
    const sourceFile = ts.createSourceFile(
      path,
      readFileSync(path, "utf8"),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );
    const rel = relative(ROOT, path).replaceAll("\\", "/");
    const key = coverageKey(path);
    for (const fn of collectFunctions(sourceFile)) {
      const coverage = key === undefined ? 0 : functionCoverage(key, fn.line);
      const crap = crapScore(fn.complexity, coverage);
      rows.push({
        file: rel,
        name: fn.name,
        line: fn.line,
        complexity: fn.complexity,
        coverage,
        crap,
      });
    }
  }

  rows.sort((a, b) => b.crap - a.crap);

  const over =
    failOn === undefined
      ? rows.filter((row) => row.crap > THRESHOLD)
      : rows.filter((row) => row.crap > failOn);

  console.log("file:line\tname\tCC\tcov%\tCRAP");
  for (const row of rows.slice(0, 40)) {
    console.log(
      `${row.file}:${row.line}\t${row.name}\t${row.complexity}\t${row.coverage.toFixed(0)}\t${row.crap.toFixed(2)}`,
    );
  }
  if (rows.length > 40) {
    console.log(`… ${rows.length - 40} more functions`);
  }

  const offenders = rows.filter((row) => row.crap > THRESHOLD);
  console.log(
    `\n${offenders.length} function(s) with CRAP > ${THRESHOLD} (of ${rows.length}).`,
  );
  for (const row of offenders) {
    console.log(
      `  ${row.file}:${row.line} ${row.name} CC=${row.complexity} cov=${row.coverage.toFixed(0)}% CRAP=${row.crap.toFixed(2)}`,
    );
  }

  if (failOn !== undefined && over.length > 0) {
    process.exit(1);
  }
}

main();
