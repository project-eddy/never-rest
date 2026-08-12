#!/usr/bin/env node
/**
 * extract-gherkin.mjs — pull Gherkin out of markdown spec files for agents/tests.
 *
 * Scans the given files/directories (recursing into dirs, picking up `*.spec.md`),
 * extracts YAML frontmatter and every fenced ```gherkin code block, and prints
 * JSON to stdout. Each block is tagged with the nearest preceding markdown
 * heading so scenario groups survive extraction.
 *
 * Usage:
 *   node extract-gherkin.mjs <file-or-dir> [...more]           # JSON output
 *   node extract-gherkin.mjs --feature <file-or-dir> [...]     # .feature-style text
 *
 * JSON shape:
 * [
 *   {
 *     "file": "specs/session-handoff.spec.md",
 *     "frontmatter": { "title": "...", "status": "..." },
 *     "scenarios": [
 *       { "heading": "Completing a step", "name": "Completing the final step of a stage",
 *         "keyword": "Scenario", "text": "Scenario: ...\n  Given ..." }
 *     ]
 *   }
 * ]
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SCENARIO_KEYWORDS =
	/^(Scenario Outline|Scenario|Example|Background|Feature):\s*(.*)$/;

/** Recursively collect `*.spec.md` paths from a file or directory path. */
function collectSpecFiles(path) {
	const stats = statSync(path);
	if (stats.isFile()) {
		return path.endsWith('.spec.md') ? [path] : [];
	}
	const files = [];
	for (const entry of readdirSync(path, { withFileTypes: true })) {
		if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
		const child = join(path, entry.name);
		if (entry.isDirectory()) {
			files.push(...collectSpecFiles(child));
		} else if (entry.name.endsWith('.spec.md')) {
			files.push(child);
		}
	}
	return files.sort();
}

/** Naive YAML frontmatter parser — flat `key: value` pairs only. */
function parseFrontmatter(source) {
	const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
	if (!match) return { frontmatter: {}, body: source };
	const frontmatter = {};
	for (const line of match[1].split(/\r?\n/)) {
		const pair = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
		if (pair) frontmatter[pair[1]] = pair[2].replace(/^["']|["']$/g, '');
	}
	return { frontmatter, body: source.slice(match[0].length) };
}

/** Split one gherkin block into scenario entries, keeping full text per scenario. */
function splitScenarios(blockText, heading) {
	const scenarios = [];
	let current = null;
	for (const line of blockText.split(/\r?\n/)) {
		const match = line.trim().match(SCENARIO_KEYWORDS);
		if (match) {
			if (current) scenarios.push(current);
			current = {
				heading,
				name: match[2].trim(),
				keyword: match[1],
				lines: [line]
			};
		} else if (current) {
			current.lines.push(line);
		}
	}
	if (current) scenarios.push(current);
	return scenarios.map(function toEntry(scenario) {
		return {
			heading: scenario.heading,
			name: scenario.name,
			keyword: scenario.keyword,
			text: scenario.lines.join('\n').trimEnd()
		};
	});
}

/** Extract frontmatter + gherkin blocks (with nearest heading) from one file. */
function extractFile(file) {
	const { frontmatter, body } = parseFrontmatter(readFileSync(file, 'utf8'));
	const scenarios = [];
	let heading = null;
	let inBlock = false;
	let blockLines = [];
	for (const line of body.split(/\r?\n/)) {
		if (!inBlock) {
			const headingMatch = line.match(/^#{1,6}\s+(.*)$/);
			if (headingMatch) heading = headingMatch[1].trim();
			if (/^```\s*gherkin\s*$/i.test(line.trim())) {
				inBlock = true;
				blockLines = [];
			}
		} else if (/^```\s*$/.test(line.trim())) {
			inBlock = false;
			scenarios.push(...splitScenarios(blockLines.join('\n'), heading));
		} else {
			blockLines.push(line);
		}
	}
	return { file, frontmatter, scenarios };
}

function main() {
	const args = process.argv.slice(2);
	const asFeature = args.includes('--feature');
	const paths = args.filter(function isPath(arg) {
		return arg !== '--feature';
	});
	if (paths.length === 0) {
		console.error(
			'Usage: extract-gherkin.mjs [--feature] <file-or-dir> [...more]'
		);
		process.exit(1);
	}

	const files = paths.flatMap(collectSpecFiles);
	const results = files.map(extractFile).filter(function hasScenarios(result) {
		return result.scenarios.length > 0;
	});

	if (asFeature) {
		for (const result of results) {
			console.log(`# from ${result.file}`);
			for (const scenario of result.scenarios) {
				if (scenario.heading) console.log(`# ${scenario.heading}`);
				console.log(scenario.text);
				console.log('');
			}
		}
		return;
	}
	console.log(JSON.stringify(results, null, 2));
}

main();
