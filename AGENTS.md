# Agent guidance

## Changelog

- `CHANGELOG.md` follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); the package follows Semantic Versioning.
- **Every** pull request adds an entry under `## [Unreleased]`. CI fails the pull request when `CHANGELOG.md` is untouched. There is no skip label and no actor exemption — Dependabot PRs need a follow-up commit with an `### Internal` bullet before they can merge.
- Use `Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`, or `Security` for anything a consumer could notice. Create the subsection if it is missing.
- Use `### Internal` — a repo-local category, ignored at release time — for chore, CI, dependency, and refactor work that consumers never see. This keeps the consumer-facing categories honest while still satisfying the gate.
- Write each entry for someone deciding whether to upgrade: what changed for them, not which files moved. Reference the issue or PR number where it adds context.
- Commit messages follow Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`, `ci:`), which map onto the changelog categories.

### Releasing

1. Move the `## [Unreleased]` entries under a new `## [x.y.z] - yyyy-mm-dd` heading, leaving `## [Unreleased]` empty. Drop the `### Internal` block rather than publishing it.
2. Update the link definitions at the bottom of the file, including the `Unreleased` compare range.
3. Bump `version` in `package.json` to match.
4. Push a `vx.y.z` tag. The release workflow refuses to publish when the tag and `package.json` version disagree.

## Implementation plans

- Store implementation plans in the repository-root `plans/` directory, one Markdown file per independently implementable plan.
- Name files `<yyyymmdd>-<slug>.md`, matching the existing plans. Include the issue number in the slug when the work comes from an issue, e.g. `20260810-issue-17-client-request-credentials.md`.
- Plans are tracked in git. Do not leave a finished plan in `.tmp/`, an agent workspace, or any other temporary directory.
- Temporary investigation artefacts, scoreboards, and scratch output stay under `.tmp/`, which is ignored.
