export interface ExportableRows {
	rows: Record<string, unknown>[];
	path: string;
}

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
};

const hasObjectEntries = (list: unknown[]): boolean => {
	return list.some((item) => isPlainObject(item));
};

/**
 * Finds the first export-friendly array of objects in a result payload.
 *
 * We use a breadth-first search to prefer shallow, user-meaningful lists
 * (e.g. `data.users`) over deeply nested arrays that might be less useful.
 * This keeps CSV export predictable while avoiding expensive deep traversal.
 */
export const findExportableRows = (payload: unknown, maxDepth = 6): ExportableRows | null => {
	if (payload === null || payload === undefined) {
		return null;
	}

	const queue: Array<{ value: unknown; path: string; depth: number }> = [
		{ value: payload, path: 'root', depth: 0 }
	];

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
			if (value.length === 0 || hasObjectEntries(value)) {
				return {
					rows: value.filter((item) => isPlainObject(item)) as Record<string, unknown>[],
					path
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

	return null;
};
