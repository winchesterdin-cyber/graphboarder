import { describe, expect, it } from 'vitest';
import { parseHeadersInput, validateEndpointUrl } from './endpointValidation';

describe('endpointValidation', () => {
	it('validates http and https URLs and returns normalized URL', () => {
		expect(validateEndpointUrl('https://api.example.com/graphql').ok).toBe(true);
		expect(validateEndpointUrl('http://localhost:4000/graphql').ok).toBe(true);
		expect(validateEndpointUrl('https://api.example.com/graphql').normalizedUrl).toBe(
			'https://api.example.com/graphql'
		);
		expect(validateEndpointUrl('ftp://example.com/graphql').ok).toBe(false);
		expect(validateEndpointUrl('://bad-url').ok).toBe(false);
	});

	it('auto-adds protocol and exposes warnings for protocol-less URLs', () => {
		const result = validateEndpointUrl('api.example.com/graphql');
		expect(result.ok).toBe(true);
		expect(result.normalizedUrl).toBe('https://api.example.com/graphql');
		expect(result.warnings.map((warning) => warning.code)).toContain('missing-protocol');
	});

	it('rejects invalid URL formats and unsafe URL parts', () => {
		expect(validateEndpointUrl('https://user:pass@example.com/graphql').ok).toBe(false);
		expect(validateEndpointUrl('https://api.example.com/graphql#fragment').ok).toBe(false);
		expect(validateEndpointUrl('https://api.example.com/graph ql').ok).toBe(false);
	});

	it('provides warnings for query strings, http on non-localhost, and non-graphql paths', () => {
		const httpResult = validateEndpointUrl('http://example.com/query');
		expect(httpResult.ok).toBe(true);
		expect(httpResult.warnings.map((warning) => warning.code)).toEqual(
			expect.arrayContaining(['insecure-http', 'non-graphql-path'])
		);

		const queryResult = validateEndpointUrl('https://api.example.com/graphql?version=1');
		expect(queryResult.ok).toBe(true);
		expect(queryResult.warnings.map((warning) => warning.code)).toContain('query-string');
	});

	it('parses valid headers and strips wrapping quotes', () => {
		const result = parseHeadersInput(
			'Authorization: Bearer abc\nX-Tenant: graphboarder\nX-Quoted: "hello"'
		);
		expect(result.ok).toBe(true);
		expect(result.headers).toEqual({
			Authorization: 'Bearer abc',
			'X-Tenant': 'graphboarder',
			'X-Quoted': 'hello'
		});
		expect(result.errors).toEqual([]);
	});

	it('supports comments and empty lines in header input', () => {
		const result = parseHeadersInput('# comment\n\n// another comment\nX-Env: production');
		expect(result.ok).toBe(true);
		expect(result.headers).toEqual({
			'X-Env': 'production'
		});
	});

	it('rejects invalid header lines with detailed line diagnostics', () => {
		const result = parseHeadersInput('Authorization Bearer abc');
		expect(result.ok).toBe(false);
		expect(result.error).toContain('line 1');
		expect(result.errors[0]).toEqual(
			expect.objectContaining({
				line: 1
			})
		);
	});

	it('rejects duplicate and unsafe hop-by-hop headers', () => {
		const duplicateResult = parseHeadersInput('X-Test: one\nx-test: two');
		expect(duplicateResult.ok).toBe(false);
		expect(duplicateResult.errors[0].message).toContain('Duplicate header');

		const hopByHopResult = parseHeadersInput('Connection: keep-alive');
		expect(hopByHopResult.ok).toBe(false);
		expect(hopByHopResult.errors[0].message).toContain('not allowed');
	});

	it('warns for env placeholders and non-bearer authorization formats', () => {
		const result = parseHeadersInput('Authorization: Basic abc\nX-Token: ${TOKEN}');
		expect(result.ok).toBe(true);
		expect(result.warnings.map((warning) => warning.code)).toEqual(
			expect.arrayContaining(['authorization-format', 'env-placeholder'])
		);
	});

	it('rejects too many header lines', () => {
		const lines = Array.from({ length: 51 }, (_, index) => `X-${index}: value`).join('\n');
		const result = parseHeadersInput(lines);
		expect(result.ok).toBe(false);
		expect(result.error).toContain('Too many header lines');
	});
});
