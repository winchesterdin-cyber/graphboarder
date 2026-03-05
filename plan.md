# Endpoint Management Enhancement Plan

This plan upgrades endpoint validation and endpoint manager behavior with a comprehensive reliability and safety pass. Every item below has been implemented and verified with automated tests.

## Implemented Improvements (20)

1. Add URL normalization output so callers can store canonical endpoint URLs.
2. Auto-infer protocol for protocol-less URLs (`https://` default, `http://` for localhost).
3. Enforce strict URL max length guardrail (`2048`).
4. Reject URL whitespace to avoid malformed endpoint entries.
5. Reject inline URL credentials (`user:pass@host`).
6. Reject URL hash fragments for endpoint safety.
7. Emit warnings when query-string parameters are present.
8. Emit warnings when endpoint path does not look GraphQL-like.
9. Emit warnings for insecure non-localhost HTTP usage.
10. Return structured URL warnings instead of string-only responses.
11. Introduce strict RFC-like header-name token validation.
12. Add comment support (`#` and `//`) in multiline header input.
13. Add wrapping quote normalization for header values.
14. Aggregate header parsing errors with line-level diagnostics.
15. Reject duplicate headers in a case-insensitive manner.
16. Reject hop-by-hop and transport-managed headers (e.g., `Connection`, `Host`).
17. Add header count limits (50 lines) to prevent abuse.
18. Add line and value length limits for defensive parsing.
19. Emit warnings for environment placeholder header values (`${TOKEN}`).
20. Emit warnings for non-Bearer authorization formats and surface warnings in the UI.

## Implementation Notes

- Core logic was upgraded in `src/lib/utils/endpointValidation.ts` with typed result structures, warnings, guardrails, and detailed logging.
- Component integration was completed in `src/lib/components/UI/EndpointManager.svelte`, including warning toasts/logging and use of normalized URLs.
- Unit tests were expanded in `src/lib/utils/endpointValidation.test.ts` to verify success, warnings, and failure paths.

## Verification

- Formatting, linting, type checks, and full test suites were run successfully after implementation.
- The endpoint validation tests now cover protocol inference, URL safety constraints, warning generation, header aggregation behavior, duplicate detection, and limits.
