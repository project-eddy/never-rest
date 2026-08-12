#!/usr/bin/env node
/**
 * lint-gherkin.mjs — enforce the utility-belt Gherkin markdown convention.
 *
 * Checks every `*.spec.md` under the given paths for:
 *   - YAML frontmatter with `title` and `status` (draft|accepted|superseded)
 *   - a job-story blockquote callout
 *   - a top-level `#` heading plus overview prose before scenarios
 *   - each `##` section owns exactly one fenced ```gherkin block
 *   - each Scenario / Scenario Outline / Example has exactly one `When`
 *   - steps use Given / When / Then / But / And / * only
 *
 * Usage:
 *   node scripts/lint-gherkin.mjs <file-or-dir> [...more]
 *   node scripts/lint-gherkin.mjs specs/
 *
 * Exit 0 when clean; exit 1 and print diagnostics otherwise.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const STATUS_VALUES = new Set(['draft', 'accepted', 'superseded']);
const SCENARIO_KEYWORDS =
	/^(Scenario Outline|Scenario|Example|Background|Feature):\s*(.*)$/;
const STEP_KEYWORDS = /^(Given|When|Then|But|And|\*)\s+/;
const ALLOWED_BLANK_OR_TAG_OR_COMMENT = /^(\s*|@\S.*|#.*)$/;

/** Collect `*.spec.md` paths from a file or directory (recursive). */
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
	if (!match) return { frontmatter: null, body: source, endLine: 0 };
	const frontmatter = {};
	for (const line of match[1].split(/\r?\n/)) {
		const pair = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
		if (pair) frontmatter[pair[1]] = pair[2].replace(/^["']|["']$/g, '');
	}
	const endLine = match[0].split(/\r?\n/).length - 1;
	return { frontmatter, body: source.slice(match[0].length), endLine };
}

/** Count `When` steps that open a step (not `And` continuing a When). */
function countWhenSteps(scenarioLines) {
	let count = 0;
	for (const line of scenarioLines) {
		const trimmed = line.trim();
		if (/^When\s+/.test(trimmed)) count += 1;
	}
	return count;
}

/** Validate step lines inside one scenario block. */
function lintScenarioSteps(scenarioLines, file, heading, name, issues) {
	const label = name ? `"${name}"` : `(unnamed under "## ${heading}")`;
	for (const line of scenarioLines) {
		const trimmed = line.trim();
		if (!trimmed) continue;
		if (SCENARIO_KEYWORDS.test(trimmed)) continue;
		if (ALLOWED_BLANK_OR_TAG_OR_COMMENT.test(trimmed)) continue;
		if (/^Examples:\s*$/.test(trimmed)) continue;
		if (/^\|/.test(trimmed)) continue;
		if (!STEP_KEYWORDS.test(trimmed)) {
			issues.push(
				`${file}: scenario ${label}: unexpected line in gherkin fence: ${trimmed}`
			);
		}
	}
}

/** Lint one `*.spec.md` file; push human-readable issues. */
function lintFile(file, issues) {
	const source = readFileSync(file, 'utf8');
	const { frontmatter, body, endLine } = parseFrontmatter(source);

	if (!frontmatter) {
		issues.push(`${file}: missing YAML frontmatter`);
	} else {
		if (!frontmatter.title) {
			issues.push(`${file}: frontmatter missing required "title"`);
		}
		if (!frontmatter.status) {
			issues.push(`${file}: frontmatter missing required "status"`);
		} else if (!STATUS_VALUES.has(frontmatter.status)) {
			issues.push(
				`${file}: frontmatter status must be draft|accepted|superseded (got "${frontmatter.status}")`
			);
		}
	}

	const lines = body.split(/\r?\n/);
	let jobStory = false;
	let h1 = null;
	let overviewLines = [];
	let afterH1 = false;
	let currentH2 = null;
	let h2Blocks = new Map();
	let inGherkin = false;
	let gherkinLines = [];
	let gherkinStartLine = 0;

	function ensureH2Bucket(heading) {
		if (!h2Blocks.has(heading)) {
			h2Blocks.set(heading, { fences: [], scenarios: [] });
		}
		return h2Blocks.get(heading);
	}

	for (let i = 0; i < lines.length; i += 1) {
		const line = lines[i];
		const lineNo = endLine + i + 1;
		const trimmed = line.trim();

		if (!inGherkin) {
			if (/^>\s*\*\*Job story:\*\*/i.test(line)) {
				jobStory = true;
			}

			const h1Match = line.match(/^#\s+(.*)$/);
			if (h1Match && !h1) {
				h1 = h1Match[1].trim();
				afterH1 = true;
				continue;
			}

			const h2Match = line.match(/^##\s+(.*)$/);
			if (h2Match) {
				afterH1 = false;
				currentH2 = h2Match[1].trim();
				ensureH2Bucket(currentH2);
				continue;
			}

			if (afterH1 && trimmed !== '') {
				overviewLines.push(trimmed);
			}

			if (/^```\s*gherkin\s*$/i.test(trimmed)) {
				if (!currentH2) {
					issues.push(
						`${file}:${lineNo}: gherkin fence appears outside a ## section`
					);
				}
				inGherkin = true;
				gherkinLines = [];
				gherkinStartLine = lineNo;
				continue;
			}

			if (/^```/.test(trimmed)) {
				issues.push(
					`${file}:${lineNo}: non-gherkin fenced block in a .spec.md file (use \`\`\`gherkin)`
				);
			}
		} else if (/^```\s*$/.test(trimmed)) {
			inGherkin = false;
			if (currentH2) {
				const bucket = ensureH2Bucket(currentH2);
				bucket.fences.push({ startLine: gherkinStartLine, lines: gherkinLines });
			}
		} else {
			gherkinLines.push(line);
		}
	}

	if (inGherkin) {
		issues.push(`${file}: unclosed gherkin fence starting at line ${gherkinStartLine}`);
	}

	if (!jobStory) {
		issues.push(`${file}: missing job-story callout (> **Job story:** …)`);
	}
	if (!h1) {
		issues.push(`${file}: missing top-level # heading`);
	}
	if (overviewLines.length === 0) {
		issues.push(`${file}: missing overview prose between # heading and first ## section`);
	}
	if (h2Blocks.size === 0) {
		issues.push(`${file}: no ## scenario sections found`);
	}

	for (const [heading, bucket] of h2Blocks) {
		if (bucket.fences.length === 0) {
			issues.push(`${file}: "## ${heading}" has no gherkin fence`);
			continue;
		}
		if (bucket.fences.length > 1) {
			issues.push(
				`${file}: "## ${heading}" has ${bucket.fences.length} gherkin fences (expected exactly one)`
			);
		}

		for (const fence of bucket.fences) {
			let current = null;
			const scenarios = [];
			for (const line of fence.lines) {
				const match = line.trim().match(SCENARIO_KEYWORDS);
				if (match) {
					if (current) scenarios.push(current);
					current = {
						keyword: match[1],
						name: match[2].trim(),
						lines: [line]
					};
				} else if (current) {
					current.lines.push(line);
				} else if (line.trim() !== '') {
					issues.push(
						`${file}: "## ${heading}": content before first Scenario/Background/Feature: ${line.trim()}`
					);
				}
			}
			if (current) scenarios.push(current);

			if (scenarios.length === 0) {
				issues.push(
					`${file}: "## ${heading}": gherkin fence has no Scenario / Background / Feature`
				);
				continue;
			}

			for (const scenario of scenarios) {
				lintScenarioSteps(scenario.lines, file, heading, scenario.name, issues);
				if (scenario.keyword === 'Background' || scenario.keyword === 'Feature') {
					continue;
				}
				const whenCount = countWhenSteps(scenario.lines);
				if (whenCount !== 1) {
					const label = scenario.name ? `"${scenario.name}"` : '(unnamed)';
					issues.push(
						`${file}: "## ${heading}" scenario ${label}: expected exactly one When (found ${whenCount})`
					);
				}
			}
		}
	}
}

function main() {
	const paths = process.argv.slice(2);
	if (paths.length === 0) {
		console.error('Usage: lint-gherkin.mjs <file-or-dir> [...more]');
		process.exit(1);
	}

	const files = paths.flatMap(collectSpecFiles);
	if (files.length === 0) {
		console.error('No *.spec.md files found under:', paths.join(', '));
		process.exit(1);
	}

	const issues = [];
	for (const file of files) {
		lintFile(file, issues);
	}

	if (issues.length > 0) {
		for (const issue of issues) {
			console.error(issue);
		}
		console.error(`\n${issues.length} issue(s) in ${files.length} spec file(s).`);
		process.exit(1);
	}

	console.log(`ok — ${files.length} spec file(s) passed gherkin lint`);
}

main();
