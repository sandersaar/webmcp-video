# Security model

WebMCP Video is a static local demonstration. It has no authentication, backend, database, or secret configuration.

## Boundaries

- Page configuration and fixture requests must use the page origin.
- Browser input cannot select an origin, tenant, library, video, or provider.
- Moment references are random, page-bound, rights-bound, and short-lived.
- Rights changes invalidate prior references and abort active playback.
- Tool results permit one strict YouTube watch link.
- Tool results reject embedded URLs, media locators, credentials, special object keys, accessors, and cycles.
- The UI uses `textContent` and explicit DOM construction.
- The repository uses no dynamic code execution or browser storage.

## Third-party runtime

The page loads the official YouTube IFrame API from one fixed HTTPS URL at runtime.

That provider script runs with page privileges. Its endpoint does not offer a versioned integrity hash.

The page limits script and frame origins with Content Security Policy. CI replaces the provider runtime with a deterministic driver.

## Audit limits

The visible audit is local, session-only evidence. It is not durable production audit evidence.

## Reporting

Report a suspected vulnerability privately to the repository owner before public disclosure.

Do not include credentials, private media, or personal data in a public issue.
