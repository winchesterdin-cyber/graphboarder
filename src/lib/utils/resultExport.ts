import { Logger } from './logger';

export interface ExportableRows {
	rows: Record<string, unknown>[];
	path: string;
	depth: number;
	score: number;
}

export interface ExportSearchOptions {
	maxDepth?: number;
	minRows?: number;
	preferredPathTokens?: string[];
}

type ExportSearchInput = ExportSearchOptions | number;

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
};

const hasObjectEntries = (list: unknown[]): boolean => {
	return list.some((item) => isPlainObject(item));
};

const scorePath = (path: string, preferredPathTokens: string[]): number => {
	const lowerPath = path.toLowerCase();
	return preferredPathTokens.reduce((score, token) => {
		return lowerPath.includes(token.toLowerCase()) ? score + 2 : score;
	}, 0);
};

const scoreCandidate = (
	path: string,
	depth: number,
	rows: Record<string, unknown>[],
	preferredPathTokens: string[]
): number => {
	// Higher row counts and shallower depth are generally better for exports.
	const rowScore = Math.min(rows.length, 20);
	const depthScore = Math.max(0, 10 - depth);
	const tokenScore = scorePath(path, preferredPathTokens);
	return rowScore + depthScore + tokenScore;
};

/**
 * Finds the best export-friendly array of objects in a result payload.
 * The scoring model helps pick semantically meaningful arrays when several exist.
 */
export const findExportableRows = (
	payload: unknown,
	options: ExportSearchInput = {}
): ExportableRows | null => {
	if (payload === null || payload === undefined) {
		Logger.info('Exportable row discovery skipped: payload is empty');
		return null;
	}

	// Backward compatibility: older callers passed maxDepth as a positional number.
	const normalizedOptions: ExportSearchOptions =
		typeof options === 'number' ? { maxDepth: options } : options;

	const maxDepth = normalizedOptions.maxDepth ?? 6;
	const minRows = normalizedOptions.minRows ?? 0;
	const preferredPathTokens = normalizedOptions.preferredPathTokens ?? [
		'items',
		'nodes',
		'results',
		'edges'
	];

	if (typeof options === 'number') {
		Logger.info('Export row discovery used legacy maxDepth argument', { maxDepth });
	}

	const queue: Array<{ value: unknown; path: string; depth: number }> = [
		{ value: payload, path: 'root', depth: 0 }
	];

	let bestCandidate: ExportableRows | null = null;

	while (queue.length > 0) {
		const current = queue.shift();
		if (!current) {
			continue;
		}

		const { value, path, depth } = current;
		if (depth > maxDepth) {
			continue;
		}

		if (Array.isArray(value)) {
			if (value.length === 0) {
				if (minRows === 0 && !bestCandidate) {
					bestCandidate = { rows: [], path, depth, score: 0 };
				}
				continue;
			}

			if (!hasObjectEntries(value)) {
				continue;
			}

			const rows = value.filter((item) => isPlainObject(item)) as Record<string, unknown>[];
			if (rows.length < minRows) {
				continue;
			}

			const score = scoreCandidate(path, depth, rows, preferredPathTokens);
			if (!bestCandidate || score > bestCandidate.score) {
				bestCandidate = { rows, path, depth, score };
			}
			continue;
		}

		if (isPlainObject(value)) {
			Object.entries(value).forEach(([key, child]) => {
				queue.push({
					value: child,
					path: `${path}.${key}`,
					depth: depth + 1
				});
			});
		}
	}

	if (bestCandidate) {
		Logger.info('Exportable rows discovered', {
			path: bestCandidate.path,
			depth: bestCandidate.depth,
			rowCount: bestCandidate.rows.length,
			score: bestCandidate.score
		});
	} else {
		Logger.warn('No exportable rows discovered for payload', { maxDepth, minRows });
	}

	return bestCandidate;
};
