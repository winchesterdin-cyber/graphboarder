export interface SafeJsonParseResult<T> {
	ok: boolean;
	data: T | null;
	errorMessage?: string;
}

/**
 * Safely parses JSON while preserving an actionable error message.
 */
export const safeJsonParse = <T>(input: string): SafeJsonParseResult<T> => {
	try {
		return {
			ok: true,
			data: JSON.parse(input) as T
		};
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : 'Unknown JSON parsing error';
		return {
			ok: false,
			data: null,
			errorMessage
		};
	}
};
