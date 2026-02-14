import { describe, it, expect } from 'vitest';
import { generateMockData } from './mockGenerator';

const testSchema = {
	rootTypes: [
		{
			name: 'Query',
			kind: 'OBJECT',
			fields: [
				{
					name: 'users',
					type: {
						kind: 'LIST',
						ofType: { kind: 'OBJECT', name: 'User' }
					}
				}
			]
		},
		{
			name: 'User',
			kind: 'OBJECT',
			fields: [
				{ name: 'id', type: { kind: 'SCALAR', name: 'ID' } },
				{ name: 'name', type: { kind: 'SCALAR', name: 'String' } }
			]
		}
	],
	queryFields: [],
	mutationFields: [],
	subscriptionFields: [],
	schema: {
		queryType: { name: 'Query' }
	},
	isReady: true
} as any;

describe('mockGenerator', () => {
	it('should generate mock data for a simple query', () => {
		const query = 'query { users { id name } }';
		const result = generateMockData(query, testSchema);
		expect(result).toHaveProperty('data');
		expect(Array.isArray((result.data as any).users)).toBe(true);
	});

	it('returns deterministic values when seed is provided', () => {
		const query = 'query { users { id name } }';
		const first = generateMockData(query, testSchema, { seed: 'stable-seed' });
		const second = generateMockData(query, testSchema, { seed: 'stable-seed' });
		expect(second).toEqual(first);
	});

	it('supports custom list length option', () => {
		const query = 'query { users { id name } }';
		const result = generateMockData(query, testSchema, { seed: 42, listLength: 3 });
		expect(Array.isArray((result.data as any)?.users)).toBe(true);
		expect((result.data as any).users).toHaveLength(3);
	});

	it('should handle invalid query syntax gracefully', () => {
		const query = '{ invalidQuery';
		const result = generateMockData(query, testSchema);
		expect(result).toHaveProperty('errors');
	});

	it('should return empty object if root type not found', () => {
		const fakeSchema = { rootTypes: [], schema: {} } as any;
		const query = 'query { anything }';
		const result = generateMockData(query, fakeSchema);
		expect(result).toEqual({});
	});

	it('should generate __typename fields correctly', () => {
		const query = 'query { users { __typename } }';
		const result = generateMockData(query, testSchema);
		expect((result.data as any)?.users?.[0]?.__typename).toBe('User');
	});
});
