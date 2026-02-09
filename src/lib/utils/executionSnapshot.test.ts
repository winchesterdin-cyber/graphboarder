import { describe, expect, it } from 'vitest';
import { buildExecutionSnapshot } from './executionSnapshot';

describe('buildExecutionSnapshot', () => {
	it('captures exportable row metadata for tabular payloads', () => {
		const payload = {
			data: {
				users: [
					{ id: 1, name: 'Ada' },
					{ id: 2, name: 'Linus' }
				]
			}
		};

		const snapshot = buildExecutionSnapshot({
			payload,
			result: JSON.stringify(payload, null, 2),
			executionTimeMs: 123,
			responseSizeBytes: 456
		});

		expect(snapshot.exportRowsCount).toBe(2);
		expect(snapshot.exportRowsPath).toBe('root.data.users');
		expect(snapshot.executionTimeMs).toBe(123);
		expect(snapshot.responseSizeBytes).toBe(456);
	});

	it('omits export metadata when no rows are available', () => {
		const payload = { data: { user: { id: 1 } } };

		const snapshot = buildExecutionSnapshot({
			payload,
			result: JSON.stringify(payload, null, 2),
			executionTimeMs: 10,
			responseSizeBytes: 25
		});

		expect(snapshot.exportRowsCount).toBeUndefined();
		expect(snapshot.exportRowsPath).toBeUndefined();
	});
});
