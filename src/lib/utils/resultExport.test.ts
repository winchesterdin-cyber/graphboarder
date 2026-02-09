import { describe, it, expect } from 'vitest';
import { findExportableRows } from './resultExport';

describe('findExportableRows', () => {
	it('returns the first array of objects at the shallowest level', () => {
		const payload = {
			data: {
				users: [{ id: 1, name: 'Ana' }],
				meta: { total: 1 }
			}
		};

		const result = findExportableRows(payload);
		expect(result?.path).toBe('root.data.users');
		expect(result?.rows).toEqual([{ id: 1, name: 'Ana' }]);
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

	it('returns empty rows when the first array is empty', () => {
		const payload = { data: { users: [] } };

		const result = findExportableRows(payload);
		expect(result?.path).toBe('root.data.users');
		expect(result?.rows).toEqual([]);
	});

	it('returns null when no exportable arrays exist', () => {
		const payload = { data: { stats: { total: 2 } } };
		const result = findExportableRows(payload);
		expect(result).toBeNull();
	});
});
