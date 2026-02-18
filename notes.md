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

---

## Export Workflow Enhancement Pass (Plan-backed)

### Completed improvements

- CSV conversion now supports configurable delimiter, line terminator, BOM, ordered/custom headers, safe spreadsheet mode, array/date formatting modes, and metadata return payloads.
- Downloads now use a shared browser-safe trigger helper and filename normalization for safer cross-platform file naming.
- Result export discovery now supports scoring, preferred path tokens, minimum row thresholds, and richer metadata (`depth`, `score`).
- Added new diagnostics logs and implementation comments across conversion/download/discovery pipelines.

### Validation summary

- Extended `exportUtils` unit coverage with option and hardening behavior tests.
- Extended `resultExport` unit coverage with ranking and filtering behavior tests.
- Corrected CSV safe-mode unit expectation to account for RFC-compatible quoting when formulas include embedded quotes.
- Added backward-compatible support for legacy numeric `maxDepth` arguments in `findExportableRows`, with explicit diagnostics for migration visibility.

## 2026-02-16 Export hardening enhancement pass

- Implemented 20 major export improvements across CSV conversion and exportable row discovery.
- Added explicit logs for truncation, candidate limits, and path filtering behavior.
- Added tests for new CSV options (quoting, row numbers, truncation, boolean/null/undefined formatting).
- Added tests for discovery controls (required/excluded tokens, empty object handling, candidate budget).
- Fixed `maxCandidates` enforcement in export-row discovery so processed candidate metadata is accurate and deterministic.
- Added score-tuning coverage tests for `preferShallow` and `preferLargeDatasets` behavior.
- Rebalanced depth scoring when `preferShallow` is enabled so shallow arrays are intentionally favored over deeper collections.

## 2026-02-17 CSV and export-discovery reliability pass

- CSV exports now support header suppression (`omitHeaderRow`), empty-row suppression (`skipEmptyRows`), header cleanup (`trimHeaders`), header dedupe (`dedupeHeaders`), and line-break normalization (`lineBreakMode`).
- CSV metadata now includes `skippedRowCount`, and `rowCount` reflects emitted rows after filtering.
- CSV header processing now separates source-key lookup from display-label rendering, preventing value loss when header labels are transformed.
- Export discovery now supports structural filters and runtime guards: `minObjectKeys`, `minObjectRatio`, `maxInspectedNodes`, `includePathPattern`, and `excludePathPattern`.
- Added diagnostics logs for regex skips, object-ratio threshold rejections, and traversal cap early-exit behavior.
- Extended unit coverage in `exportUtils.test.ts` and `resultExport.test.ts` to validate every newly added option.
