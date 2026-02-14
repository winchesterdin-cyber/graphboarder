import { describe, expect, it } from 'vitest';
import { parseHeadersInput, validateEndpointUrl } from './endpointValidation';

describe('endpointValidation', () => {
	it('validates http and https URLs', () => {
		expect(validateEndpointUrl('https://api.example.com/graphql').ok).toBe(true);
		expect(validateEndpointUrl('http://localhost:4000/graphql').ok).toBe(true);
		expect(validateEndpointUrl('ftp://example.com/graphql').ok).toBe(false);
		expect(validateEndpointUrl('not-a-url').ok).toBe(false);
	});

	it('parses valid headers', () => {
		const result = parseHeadersInput('Authorization: Bearer abc\nX-Tenant: graphboarder');
		expect(result.ok).toBe(true);
		expect(result.headers).toEqual({
			Authorization: 'Bearer abc',
			'X-Tenant': 'graphboarder'
		});
	});

	it('rejects invalid header lines', () => {
		const result = parseHeadersInput('Authorization Bearer abc');
		expect(result.ok).toBe(false);
		expect(result.error).toContain('line 1');
	});
});
