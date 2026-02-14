# Team Notes (Utility Reliability + UX Hardening Pass)

## What changed

- Logger supports runtime configuration for:
  - level parsing from strings (`setLevelFromString`),
  - retention limits (`setMaxLogs`),
  - console output toggling (`setConsoleOutput`).
- Toast store now has typed creation options and explicit lifecycle controls:
  - `addToast({ message, type, timeout })`,
  - deterministic UUID IDs,
  - `clear()` helper for tests and UI resets.
- Endpoint add flow now validates URL protocol and parses headers through dedicated helpers (`validateEndpointUrl`, `parseHeadersInput`) before persisting endpoints.
- Query history now uses deterministic identity dedupe and centralized max-capacity normalization for safer merge/import behavior.
- Command palette ranking now supports fuzzy search + recency weighting and tracks usage with `markUsed`.
- New `safeJsonParse` utility standardizes JSON parsing with structured error metadata.
- Share utilities emit targeted diagnostics during compression/decompression and use safe parsing for structured payloads.
- Execution snapshot creation logs metadata about response size, runtime, and exportable row detection.
- Mock generation now supports deterministic seeded output and configurable list length.

## Why this helps

- Better observability and lower debugging time in state-heavy flows.
- Stronger guardrails around endpoint setup and shared-query parsing.
- More deterministic behavior in history ranking, command discovery, and generated mocks.
- Improved unit-test reliability by reducing randomness and exposing deterministic controls.

## Follow-up recommendations

1. Reuse `validateEndpointUrl`/`parseHeadersInput` anywhere endpoint config is imported from files.
2. Add a common test logger policy to silence expected warnings in selected tests.
3. Consider persisting command usage timestamps between sessions for long-term personalization.
4. Add seeded-mock mode toggle in the UI (dev/debug panel) for reproducible demo snapshots.
5. Keep e2e container image aligned with Playwright native dependencies (e.g., `libatk-1.0-0`).
