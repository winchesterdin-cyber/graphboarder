import {
	parse,
	Kind,
	type FieldNode,
	type OperationDefinitionNode,
	type SelectionSetNode
} from 'graphql';
import type {
	SchemaData,
	SchemaDataStore,
	RootType,
	FieldWithDerivedData,
	GraphQLType,
	GraphQLField
} from '../types/index';
import { Logger } from './logger';
import { get } from 'svelte/store';

export interface MockGenerationOptions {
	/**
	 * Optional deterministic seed for stable mock output.
	 */
	seed?: string | number;
	/**
	 * Number of items emitted for list fields.
	 */
	listLength?: number;
}

/**
 * Creates deterministic pseudo-random generator when a seed is provided.
 */
const createRandomProvider = (seed?: string | number): (() => number) => {
	if (seed === undefined) {
		return Math.random;
	}

	let state = 2166136261;
	for (const char of String(seed)) {
		state ^= char.charCodeAt(0);
		state = Math.imul(state, 16777619);
	}

	return () => {
		state += 0x6d2b79f5;
		let t = state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
};

/**
 * Generates mock data for a given GraphQL query and schema.
 * @param query - The GraphQL query string.
 * @param schemaData - The schema data.
 * @param options - Optional deterministic generation options.
 * @returns A JSON object representing the mock response.
 */
export function generateMockData(
	query: string,
	schemaData: SchemaDataStore | SchemaData,
	options: MockGenerationOptions = {}
): Record<string, any> {
	try {
		const schema = 'subscribe' in schemaData ? get(schemaData) : schemaData;
		const ast = parse(query);
		const operation = ast.definitions.find(
			(def) => def.kind === Kind.OPERATION_DEFINITION
		) as OperationDefinitionNode;

		if (!operation) {
			throw new Error('No operation definition found in query.');
		}

		const operationType = operation.operation;
		let rootType: RootType | undefined;
		const random = createRandomProvider(options.seed);
		const listLength = Math.max(1, options.listLength || 2);

		Logger.info('Generating mock data.', {
			hasSeed: options.seed !== undefined,
			listLength,
			operationType
		});

		const rootTypeNameMap: Record<string, string> = {
			query: 'Query',
			mutation: 'Mutation',
			subscription: 'Subscription'
		};

		const targetRootTypeName = rootTypeNameMap[operationType];
		rootType = schema.rootTypes.find((rt) => rt.name === targetRootTypeName);

		if (!rootType) {
			Logger.warn(`Could not find root type for operation ${operationType}`);
			return {};
		}

		return {
			data: generateMockForSelectionSet(
				operation.selectionSet,
				rootType,
				schema,
				random,
				listLength
			)
		};
	} catch (error) {
		Logger.error('Error generating mock data:', error);
		return { errors: [{ message: (error as Error).message }] };
	}
}

function generateMockForSelectionSet(
	selectionSet: SelectionSetNode,
	parentType: RootType | GraphQLField | GraphQLType | any,
	schema: SchemaData,
	random: () => number,
	listLength: number
): Record<string, any> {
	const result: Record<string, any> = {};

	for (const selection of selectionSet.selections) {
		if (selection.kind === Kind.FIELD) {
			const fieldNode = selection as FieldNode;
			const fieldName = fieldNode.name.value;
			const alias = fieldNode.alias?.value || fieldName;

			let fieldDef: FieldWithDerivedData | undefined;
			let fields: FieldWithDerivedData[] = [];

			if ('fields' in parentType && Array.isArray(parentType.fields)) {
				fields = parentType.fields;
			} else if (parentType.kind === 'OBJECT' && parentType.type) {
				const typeName = getTypeName(parentType);
				const typeDef = schema.rootTypes.find((t) => t.name === typeName);
				if (typeDef && typeDef.fields) fields = typeDef.fields;
			} else if (parentType.name) {
				const typeDef = schema.rootTypes.find((t) => t.name === parentType.name);
				if (typeDef && typeDef.fields) fields = typeDef.fields;
			}

			fieldDef = fields.find((f) => f.name === fieldName);

			if (!fieldDef) {
				if (fieldName === '__typename') {
					result[alias] = getTypeName(parentType) || 'Unknown';
					continue;
				}
				Logger.warn(`Field ${fieldName} not found in type ${getTypeName(parentType)}`);
				result[alias] = null;
				continue;
			}

			result[alias] = generateMockValue(fieldDef, fieldNode, schema, random, listLength);
		} else if (selection.kind === Kind.INLINE_FRAGMENT) {
			const fragmentSelections = generateMockForSelectionSet(
				selection.selectionSet,
				parentType,
				schema,
				random,
				listLength
			);
			Object.assign(result, fragmentSelections);
		}
	}

	return result;
}

function generateMockValue(
	fieldDef: FieldWithDerivedData,
	fieldNode: FieldNode,
	schema: SchemaData,
	random: () => number,
	listLength: number
): any {
	const type = fieldDef.type;
	const { isList, underlyingType } = unwrapType(type);

	if (isList) {
		return Array.from({ length: listLength }, () =>
			generateMockSingleValue(underlyingType, fieldNode, schema, random, listLength)
		);
	}

	return generateMockSingleValue(underlyingType, fieldNode, schema, random, listLength);
}

function generateMockSingleValue(
	type: GraphQLType,
	fieldNode: FieldNode,
	schema: SchemaData,
	random: () => number,
	listLength: number
): any {
	if (type.kind === 'SCALAR') {
		return generateScalar(type.name || 'String', random);
	}

	if (type.kind === 'ENUM') {
		const enumType = schema.rootTypes.find((t) => t.name === type.name && t.kind === 'ENUM');
		if (enumType && enumType.enumValues && enumType.enumValues.length > 0) {
			return enumType.enumValues[0].name;
		}
		return 'ENUM_VALUE';
	}

	if (type.kind === 'OBJECT' || type.kind === 'INTERFACE' || type.kind === 'UNION') {
		if (fieldNode.selectionSet) {
			const typeDef = schema.rootTypes.find((t) => t.name === type.name);
			return generateMockForSelectionSet(
				fieldNode.selectionSet,
				typeDef || type,
				schema,
				random,
				listLength
			);
		}
		return {};
	}

	return null;
}

function generateScalar(typeName: string, random: () => number): any {
	switch (typeName) {
		case 'Int':
			return Math.floor(random() * 100);
		case 'Float':
			return Number((random() * 100).toFixed(2));
		case 'String':
			return 'MockString_' + Math.floor(random() * 1000);
		case 'Boolean':
			return random() > 0.5;
		case 'ID':
			return 'ID_' + Math.floor(random() * 10000);
		default:
			if (typeName.toLowerCase().includes('date')) return new Date().toISOString();
			return 'Scalar_' + typeName;
	}
}

function unwrapType(type: GraphQLType): { isList: boolean; underlyingType: GraphQLType } {
	let isList = false;
	let current = type;

	while (current.kind === 'NON_NULL' || current.kind === 'LIST') {
		if (current.kind === 'LIST') isList = true;
		if (current.ofType) {
			current = current.ofType;
		} else if (current.type) {
			current = current.type;
		} else {
			break;
		}
	}
	return { isList, underlyingType: current };
}

function getTypeName(type: any): string | undefined {
	if (!type) return undefined;
	if (type.name) return type.name;
	if (type.type) return getTypeName(type.type);
	if (type.ofType) return getTypeName(type.ofType);
	return undefined;
}
