import { describe, expect, it } from 'vitest';
import { safeJsonParse } from './safeJson';

describe('safeJsonParse', () => {
	it('returns parsed data when input is valid JSON', () => {
		const result = safeJsonParse<{ query: string }>(JSON.stringify({ query: '{ users { id } }' }));

		expect(result.ok).toBe(true);
		expect(result.data).toEqual({ query: '{ users { id } }' });
		expect(result.errorMessage).toBeUndefined();
	});

	it('returns error metadata when input is invalid JSON', () => {
		const result = safeJsonParse<{ query: string }>('{"query":');

		expect(result.ok).toBe(false);
		expect(result.data).toBeNull();
		expect(result.errorMessage).toBeTruthy();
	});
});
