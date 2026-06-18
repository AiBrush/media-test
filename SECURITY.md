# Security Policy

## Supported Versions

| Version | Supported |
| --- | --- |
| latest | Yes |
| < 0.1.0 | No |

## Reporting a Vulnerability

If you discover a security vulnerability, please report it responsibly:

1. Do not open a public issue.
2. Use GitHub Private Vulnerability Reporting for this repository when available:
   <https://github.com/AiBrush/media-test/security/advisories/new>
3. Include:
   - A description of the vulnerability.
   - Steps to reproduce.
   - Affected browser, engine, fixture, or script.
   - Potential impact.
   - Any proof-of-concept input, if it can be shared safely.

We will acknowledge receipt within 48 hours and aim to provide a fix within 7 days for critical issues.

## Scope

Security reports may include:

- Unsafe handling of local fixture media.
- Browser execution paths that unexpectedly expose local files or secrets.
- Dependency, script, or build issues that allow code execution beyond the intended benchmark workflow.
- Result or report generation bugs that could hide security-relevant failures.

Performance differences, unsupported codecs, ordinary benchmark failures, and expected `N/A` capability gaps are not security issues by themselves.

## Disclosure Policy

- We follow coordinated disclosure.
- Please allow reasonable time for a fix before public disclosure.
- Credit will be given to reporters in the advisory and release notes when desired.
