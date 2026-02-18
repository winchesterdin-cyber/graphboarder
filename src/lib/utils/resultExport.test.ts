import { describe, it, expect } from 'vitest';
import { findExportableRows } from './resultExport';

describe('findExportableRows', () => {
	it('returns object rows from shallow arrays', () => {
		const payload = {
			data: {
				users: [{ id: 1, name: 'Ana' }],
				meta: { total: 1 }
			}
		};

		const result = findExportableRows(payload);
		expect(result?.path).toBe('root.data.users');
		expect(result?.rows).toEqual([{ id: 1, name: 'Ana' }]);
		expect(result?.depth).toBe(2);
		expect(result?.candidateCount).toBe(1);
	});

	it('skips arrays of primitives and finds nested object arrays', () => {
		const payload = {
			data: {
				ids: [1, 2, 3],
				edges: [{ node: { id: 'a' } }]
			}
		};

		const result = findExportableRows(payload);
		expect(result?.path).toBe('root.data.edges');
		expect(result?.rows).toEqual([{ node: { id: 'a' } }]);
	});

	it('returns empty rows when the first array is empty and minRows is zero', () => {
		const payload = { data: { users: [] } };

		const result = findExportableRows(payload, { minRows: 0 });
		expect(result?.path).toBe('root.data.users');
		expect(result?.rows).toEqual([]);
	});

	it('returns null when no exportable arrays exist', () => {
		const payload = { data: { stats: { total: 2 } } };
		const result = findExportableRows(payload);
		expect(result).toBeNull();
	});

	it('enforces minRows option', () => {
		const payload = { data: { users: [{ id: 1 }] } };
		const result = findExportableRows(payload, { minRows: 2 });
		expect(result).toBeNull();
	});

	it('supports legacy numeric maxDepth argument for backward compatibility', () => {
		const payload = {
			data: {
				layerOne: {
					layerTwo: {
						users: [{ id: 1 }]
					}
				}
			}
		};

		const blockedByDepth = findExportableRows(payload, 2);
		expect(blockedByDepth).toBeNull();

		const foundWithDepth = findExportableRows(payload, 4);
		expect(foundWithDepth?.path).toBe('root.data.layerOne.layerTwo.users');
	});

	it('prefers paths with preferred tokens when scores are close', () => {
		const payload = {
			data: {
				users: [{ id: 1 }, { id: 2 }],
				results: [{ id: 11 }, { id: 22 }]
			}
		};

		const result = findExportableRows(payload, { preferredPathTokens: ['results'] });
		expect(result?.path).toBe('root.data.results');
	});

	it('supports excluded and required tokens', () => {
		const payload = {
			data: {
				users: [{ id: 1 }],
				archivedUsers: [{ id: 2 }]
			}
		};

		const result = findExportableRows(payload, {
			excludedPathTokens: ['archived'],
			requirePathTokens: ['users']
		});
		expect(result?.path).toBe('root.data.users');
	});

	it('allows empty object rows when option is enabled', () => {
		const payload = {
			data: {
				rows: [{}]
			}
		};

		const blocked = findExportableRows(payload, { allowEmptyObjectRows: false });
		expect(blocked).toBeNull();

		const allowed = findExportableRows(payload, { allowEmptyObjectRows: true });
		expect(allowed?.path).toBe('root.data.rows');
	});

	it('stops searching when maxCandidates is reached', () => {
		const payload = {
			data: {
				first: [{ id: 1 }],
				second: [{ id: 2 }],
				third: [{ id: 3 }]
			}
		};

		const result = findExportableRows(payload, { maxCandidates: 1 });
		expect(result?.candidateCount).toBe(1);
		expect(result?.path).toBe('root.data.first');
		expect(result?.inspectedNodeCount).toBeGreaterThan(0);
	});

	it('supports score tuning with preferShallow and preferLargeDatasets', () => {
		const payload = {
			data: {
				shallowSmall: [{ id: 1 }],
				deep: {
					nested: {
						largeRows: [{ id: 10 }, { id: 11 }, { id: 12 }, { id: 13 }]
					}
				}
			}
		};

		const shallowPreferred = findExportableRows(payload, {
			preferShallow: true,
			preferLargeDatasets: false
		});
		expect(shallowPreferred?.path).toBe('root.data.shallowSmall');

		const largePreferred = findExportableRows(payload, {
			preferShallow: false,
			preferLargeDatasets: true
		});
		expect(largePreferred?.path).toBe('root.data.deep.nested.largeRows');
	});

	it('supports minimum key count and object ratio thresholds', () => {
		const payload = {
			data: {
				mixed: [{ id: 1 }, 'x', { id: 2, extra: true }],
				rich: [
					{ id: 1, extra: true },
					{ id: 2, extra: false }
				]
			}
		};

		const strict = findExportableRows(payload, {
			minObjectKeys: 2,
			minObjectRatio: 0.75
		});
		expect(strict?.path).toBe('root.data.rich');
	});

	it('supports regex include/exclude path filters', () => {
		const payload = {
			data: {
				allowedRows: [{ id: 1 }],
				debugRows: [{ id: 2 }]
			}
		};

		const result = findExportableRows(payload, {
			includePathPattern: 'allowed',
			excludePathPattern: 'debug'
		});
		expect(result?.path).toBe('root.data.allowedRows');
	});

	it('stops traversal when maxInspectedNodes is reached', () => {
		const payload = {
			data: {
				a: { b: { c: [{ id: 1 }] } }
			}
		};

		const blocked = findExportableRows(payload, { maxInspectedNodes: 2 });
		expect(blocked).toBeNull();

		const found = findExportableRows(payload, { maxInspectedNodes: 10 });
		expect(found?.path).toBe('root.data.a.b.c');
	});
});
