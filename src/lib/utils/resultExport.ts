import { Logger } from './logger';

export interface ExportableRows {
	rows: Record<string, unknown>[];
	path: string;
	depth: number;
	score: number;
	candidateCount: number;
	inspectedNodeCount: number;
}

export interface ExportSearchOptions {
	maxDepth?: number;
	minRows?: number;
	preferredPathTokens?: string[];
	excludedPathTokens?: string[];
	requirePathTokens?: string[];
	preferShallow?: boolean;
	preferLargeDatasets?: boolean;
	allowEmptyObjectRows?: boolean;
	maxCandidates?: number;
}

type ExportSearchInput = ExportSearchOptions | number;

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
};

const hasObjectEntries = (list: unknown[], allowEmptyObjectRows: boolean): boolean => {
	if (allowEmptyObjectRows) {
		return list.some((item) => isPlainObject(item));
	}

	return list.some((item) => isPlainObject(item) && Object.keys(item).length > 0);
};

const scorePath = (path: string, preferredPathTokens: string[]): number => {
	const lowerPath = path.toLowerCase();
	return preferredPathTokens.reduce((score, token) => {
		return lowerPath.includes(token.toLowerCase()) ? score + 2 : score;
	}, 0);
};

const containsRequiredTokens = (path: string, requiredTokens: string[]): boolean => {
	if (!requiredTokens.length) {
		return true;
	}

	const lowerPath = path.toLowerCase();
	return requiredTokens.every((token) => lowerPath.includes(token.toLowerCase()));
};

const containsExcludedTokens = (path: string, excludedTokens: string[]): boolean => {
	const lowerPath = path.toLowerCase();
	return excludedTokens.some((token) => lowerPath.includes(token.toLowerCase()));
};

const scoreCandidate = (
	path: string,
	depth: number,
	rows: Record<string, unknown>[],
	options: Required<ExportSearchOptions>
): number => {
	const rowScore = options.preferLargeDatasets
		? Math.min(rows.length * 2, 40)
		: Math.min(rows.length, 20);
	// When shallow preference is enabled, depth gets a stronger weight so small
	// shallow collections can outrank larger but deeply nested arrays.
	const depthScore = options.preferShallow
		? Math.max(0, 20 - depth * 5)
		: Math.max(0, 5 - Math.floor(depth / 2));
	const tokenScore = scorePath(path, options.preferredPathTokens);
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

	const searchOptions: Required<ExportSearchOptions> = {
		maxDepth: normalizedOptions.maxDepth ?? 6,
		minRows: normalizedOptions.minRows ?? 0,
		preferredPathTokens: normalizedOptions.preferredPathTokens ?? [
			'items',
			'nodes',
			'results',
			'edges'
		],
		excludedPathTokens: normalizedOptions.excludedPathTokens ?? ['meta', 'error'],
		requirePathTokens: normalizedOptions.requirePathTokens ?? [],
		preferShallow: normalizedOptions.preferShallow ?? true,
		preferLargeDatasets: normalizedOptions.preferLargeDatasets ?? true,
		allowEmptyObjectRows: normalizedOptions.allowEmptyObjectRows ?? false,
		maxCandidates: normalizedOptions.maxCandidates ?? Number.MAX_SAFE_INTEGER
	};

	if (typeof options === 'number') {
		Logger.info('Export row discovery used legacy maxDepth argument', {
			maxDepth: searchOptions.maxDepth
		});
	}

	const queue: Array<{ value: unknown; path: string; depth: number }> = [
		{ value: payload, path: 'root', depth: 0 }
	];

	let bestCandidate: ExportableRows | null = null;
	let candidateCount = 0;
	let inspectedNodeCount = 0;

	while (queue.length > 0) {
		const current = queue.shift();
		if (!current) {
			continue;
		}

		inspectedNodeCount += 1;
		const { value, path, depth } = current;
		if (depth > searchOptions.maxDepth) {
			continue;
		}

		if (containsExcludedTokens(path, searchOptions.excludedPathTokens)) {
			Logger.debug('Skipping path because it contains excluded token', { path });
			continue;
		}

		if (Array.isArray(value)) {
			if (!containsRequiredTokens(path, searchOptions.requirePathTokens)) {
				Logger.debug('Skipping array because required path tokens are missing', { path });
				continue;
			}

			if (value.length === 0) {
				if (searchOptions.minRows === 0 && !bestCandidate) {
					bestCandidate = {
						rows: [],
						path,
						depth,
						score: 0,
						candidateCount,
						inspectedNodeCount
					};
				}
				continue;
			}

			if (!hasObjectEntries(value, searchOptions.allowEmptyObjectRows)) {
				continue;
			}

			const rows = value.filter((item) => {
				if (!isPlainObject(item)) {
					return false;
				}
				if (searchOptions.allowEmptyObjectRows) {
					return true;
				}
				return Object.keys(item).length > 0;
			}) as Record<string, unknown>[];

			if (rows.length < searchOptions.minRows) {
				continue;
			}

			// Enforce a hard cap on candidate processing to keep traversal deterministic
			// for very large payloads.
			if (candidateCount >= searchOptions.maxCandidates) {
				Logger.warn('Stopping export row discovery because maxCandidates was reached', {
					maxCandidates: searchOptions.maxCandidates
				});
				break;
			}

			candidateCount += 1;
			const score = scoreCandidate(path, depth, rows, searchOptions);
			if (!bestCandidate || score > bestCandidate.score) {
				bestCandidate = {
					rows,
					path,
					depth,
					score,
					candidateCount,
					inspectedNodeCount
				};
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
			score: bestCandidate.score,
			candidateCount,
			inspectedNodeCount
		});
	} else {
		Logger.warn('No exportable rows discovered for payload', {
			maxDepth: searchOptions.maxDepth,
			minRows: searchOptions.minRows,
			inspectedNodeCount
		});
	}

	return bestCandidate;
};
