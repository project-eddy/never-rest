# Security Policy

## Supported versions

Security fixes are applied to the latest release of `@eddy-works/never-rest` on npm.

## Reporting a vulnerability

Please do **not** open a public GitHub issue for security reports.

Use [GitHub private vulnerability reporting](https://github.com/project-eddy/never-rest/security/advisories/new).

Include:

- Affected package version
- A clear description of the issue
- Steps to reproduce, or a proof of concept if you have one
- Impact assessment if known

We aim to acknowledge reports within 5 business days and to keep you updated until the issue is resolved or declined.

## Scope notes

- Handler disclosure (`full` / `internal` / `public`) is caller-configured. Misconfiguration that leaks internal detail is an application concern, not a library CVE, unless the library itself fails to apply the requested level.
- Do not report issues that require a compromised npm publish credential or GitHub admin access as product vulnerabilities; those are infrastructure incidents.
