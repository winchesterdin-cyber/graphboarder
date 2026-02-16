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
});
