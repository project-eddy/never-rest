#!/usr/bin/env node
/**
 * Typecheck fenced TypeScript blocks marked `<!-- check -->` in docs.
 *
 * Usage:
 *   node scripts/check-doc-snippets.mjs
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readdirSync, readFileSync, statSync } from 'node:fs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, '.tmp', 'doc-snippets');
const MARKER = '<!-- check -->';
const FENCE = /```ts\r?\n([\s\S]*?)```/;

const SEARCH_ROOTS = ['README.md', 'docs', 'skills'];

function collectMarkdown(path, files = []) {
  const stats = statSync(path);
  if (stats.isDirectory()) {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') {
        continue;
      }
      collectMarkdown(join(path, entry.name), files);
    }
    return files;
  }
  if (path.endsWith('.md')) {
    files.push(path);
  }
  return files;
}

function extractSnippets() {
  const snippets = [];
  const files = SEARCH_ROOTS.flatMap((root) => collectMarkdown(join(ROOT, root)));

  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    let searchFrom = 0;
    let index = 0;
    while (searchFrom < source.length) {
      const markerAt = source.indexOf(MARKER, searchFrom);
      if (markerAt === -1) {
        break;
      }
      const afterMarker = source.slice(markerAt + MARKER.length);
      const fence = afterMarker.match(FENCE);
      if (fence === null) {
        searchFrom = markerAt + MARKER.length;
        continue;
      }
      index += 1;
      snippets.push({
        file: relative(ROOT, file),
        index,
        code: fence[1],
      });
      searchFrom = markerAt + MARKER.length + fence[0].length;
    }
  }

  return snippets;
}

function writeTsconfig() {
  const tsconfig = {
    compilerOptions: {
      target: 'ES2022',
      lib: ['ES2022', 'DOM', 'DOM.Iterable'],
      module: 'NodeNext',
      moduleResolution: 'NodeNext',
      strict: true,
      skipLibCheck: true,
      noEmit: true,
      paths: {
        '@eddy-works/never-rest': [join(ROOT, 'src/index.ts')],
        '@eddy-works/never-rest/contract': [join(ROOT, 'src/contract/index.ts')],
        '@eddy-works/never-rest/server': [join(ROOT, 'src/server/index.ts')],
        '@eddy-works/never-rest/client': [join(ROOT, 'src/client/index.ts')],
        '@eddy-works/never-rest/node': [join(ROOT, 'src/node/index.ts')],
        '@eddy-works/never-rest/local': [join(ROOT, 'src/local/index.ts')],
        '@eddy-works/never-rest/testing': [join(ROOT, 'src/testing/index.ts')],
        '@eddy-works/never-rest/openapi': [join(ROOT, 'src/openapi/index.ts')],
        '@eddy-works/never-rest/query': [join(ROOT, 'src/query/index.ts')],
        '@eddy-works/never-rest/policy': [join(ROOT, 'src/policy/index.ts')],
        '@eddy-works/never-rest/limits': [join(ROOT, 'src/limits/index.ts')],
        '@eddy-works/never-rest/mcp': [join(ROOT, 'src/mcp/index.ts')],
      },
    },
    include: ['./*.ts'],
  };
  writeFileSync(join(OUT, 'package.json'), `${JSON.stringify({ type: 'module' }, null, 2)}\n`);
  writeFileSync(join(OUT, 'tsconfig.json'), `${JSON.stringify(tsconfig, null, 2)}\n`);
}

function slug(file, index) {
  return `${file.replaceAll(/[^A-Za-z0-9]+/g, '-')}-${index}.ts`;
}

const snippets = extractSnippets();
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

if (snippets.length === 0) {
  console.error('docs:snippets: no <!-- check --> TypeScript fences found');
  process.exit(1);
}

for (const snippet of snippets) {
  writeFileSync(join(OUT, slug(snippet.file, snippet.index)), snippet.code);
}
writeTsconfig();

try {
  execFileSync('pnpm', ['exec', 'tsc', '--noEmit', '-p', OUT], {
    cwd: ROOT,
    stdio: 'inherit',
  });
} catch {
  process.exit(1);
}

console.log(`docs:snippets: checked ${snippets.length} snippet(s)`);
