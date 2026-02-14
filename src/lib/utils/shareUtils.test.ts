import { describe, it, expect } from 'vitest';
import { compressQuery, decompressQuery } from './shareUtils';

describe('shareUtils', () => {
	it('should compress and decompress a simple string', () => {
		const query = 'query { users { id name } }';
		const compressed = compressQuery(query);
		const decompressed = decompressQuery(compressed);
		expect(decompressed).not.toBeNull();
		expect(decompressed?.query).toBe(query);
	});

	it('should compress and decompress query data with variables', () => {
		const query = 'query GetUser($id: ID!) { user(id: $id) { id name } }';
		const variables = { id: 'user_1' };
		const compressed = compressQuery(query, variables);
		const decompressed = decompressQuery(compressed);
		expect(decompressed).not.toBeNull();
		expect(decompressed?.query).toBe(query);
		expect(decompressed?.variables).toEqual(variables);
	});

	it('should handle empty string', () => {
		const query = '';
		const compressed = compressQuery(query);
		const decompressed = decompressQuery(compressed);
		expect(decompressed).toBeNull();
	});

	it('should return null for invalid compressed string', () => {
		const result = decompressQuery('not-compressed-string');
		expect(result).toBeNull();
	});
});
