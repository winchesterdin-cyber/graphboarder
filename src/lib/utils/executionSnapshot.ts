import { findExportableRows } from './resultExport';

export interface ExecutionSnapshot {
	/** ISO timestamp for when the snapshot was captured. */
	createdAt: string;
	/** Pretty-printed JSON result used for diffing. */
	result: string;
	/** Raw payload returned by the execution. */
	payload: unknown;
	/** Execution duration in milliseconds. */
	executionTimeMs: number;
	/** Response size in bytes. */
	responseSizeBytes: number;
	/** Optional export path for the first tabular dataset. */
	exportRowsPath?: string;
	/** Optional row count for the first tabular dataset. */
	exportRowsCount?: number;
}

interface BuildExecutionSnapshotParams {
	payload: unknown;
	result: string;
	executionTimeMs: number;
	responseSizeBytes: number;
}

/**
 * Captures an execution snapshot for later comparison.
 *
 * We persist both the raw payload and a prettified result string so that
 * users can diff results across runs while still having metadata for badges
 * (row counts, export paths) in the UI.
 */
export const buildExecutionSnapshot = ({
	payload,
	result,
	executionTimeMs,
	responseSizeBytes
}: BuildExecutionSnapshotParams): ExecutionSnapshot => {
	const exportRowsInfo = findExportableRows(payload);

	return {
		createdAt: new Date().toISOString(),
		result,
		payload,
		executionTimeMs,
		responseSizeBytes,
		exportRowsPath: exportRowsInfo?.path,
		exportRowsCount: exportRowsInfo?.rows.length
	};
};
