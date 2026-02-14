import LZString from 'lz-string';
import { Logger } from './logger';
import { safeJsonParse } from './safeJson';

export interface ShareData {
	query: string;
	variables?: Record<string, any>;
}

/**
 * Compresses a query string (and optional variables) for use in a URL.
 * @param query - The GraphQL query string.
 * @param variables - Optional variables object.
 * @returns The compressed string.
 */
export const compressQuery = (query: string, variables?: Record<string, any>): string => {
	if (variables && Object.keys(variables).length > 0) {
		const data: ShareData = { query, variables };
		Logger.debug('Compressing share payload with variables.', {
			queryLength: query.length,
			variableKeys: Object.keys(variables)
		});
		return LZString.compressToEncodedURIComponent(JSON.stringify(data));
	}

	Logger.debug('Compressing share payload without variables.', {
		queryLength: query.length
	});
	return LZString.compressToEncodedURIComponent(query);
};

/**
 * Decompresses a query string from a URL.
 * @param compressed - The compressed string.
 * @returns The original query data (query + variables), or null if decompression fails.
 */
export const decompressQuery = (compressed: string): ShareData | null => {
	const decompressed = LZString.decompressFromEncodedURIComponent(compressed);
	if (!decompressed) {
		Logger.warn('Unable to decompress share payload.');
		return null;
	}

	// Try parsing as JSON first to see if it's the new format.
	if (decompressed.trim().startsWith('{')) {
		const parsedData = safeJsonParse<ShareData>(decompressed);
		if (
			parsedData.ok &&
			parsedData.data &&
			typeof parsedData.data === 'object' &&
			'query' in parsedData.data
		) {
			Logger.info('Decompressed structured share payload.', {
				queryLength: parsedData.data.query.length,
				hasVariables: Boolean(parsedData.data.variables)
			});
			return parsedData.data;
		}

		Logger.warn('Structured share payload parsing failed. Falling back to raw query mode.', {
			error: parsedData.errorMessage
		});
	}

	// Fallback: treat as raw query string (legacy support).
	Logger.info('Decompressed legacy share payload.');
	return { query: decompressed };
};
