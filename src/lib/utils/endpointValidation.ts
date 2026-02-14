import { Logger } from './logger';

export interface EndpointValidationResult {
	ok: boolean;
	error?: string;
}

/**
 * Validates endpoint URL and enforces http(s) protocols.
 */
export const validateEndpointUrl = (url: string): EndpointValidationResult => {
	const normalizedUrl = url.trim();
	if (!normalizedUrl) {
		return { ok: false, error: 'Endpoint URL is required.' };
	}

	try {
		const parsed = new URL(normalizedUrl);
		if (!['http:', 'https:'].includes(parsed.protocol)) {
			return { ok: false, error: 'Only http:// and https:// URLs are supported.' };
		}
		return { ok: true };
	} catch {
		return { ok: false, error: 'Endpoint URL is invalid.' };
	}
};

/**
 * Parses and validates header text in `Key: Value` line format.
 */
export const parseHeadersInput = (
	headersInput: string
): { ok: boolean; headers: Record<string, string>; error?: string } => {
	const headers: Record<string, string> = {};
	if (!headersInput.trim()) {
		return { ok: true, headers };
	}

	for (const [index, line] of headersInput.split('\n').entries()) {
		const trimmed = line.trim();
		if (!trimmed) {
			continue;
		}

		const separatorIndex = trimmed.indexOf(':');
		if (separatorIndex <= 0 || separatorIndex === trimmed.length - 1) {
			Logger.warn('Invalid endpoint header format.', { index, line: trimmed });
			return {
				ok: false,
				headers: {},
				error: `Invalid header format on line ${index + 1}. Use Key: Value.`
			};
		}

		const key = trimmed.slice(0, separatorIndex).trim();
		const value = trimmed.slice(separatorIndex + 1).trim();
		if (!key || !value) {
			return {
				ok: false,
				headers: {},
				error: `Invalid header content on line ${index + 1}.`
			};
		}

		headers[key] = value;
	}

	return { ok: true, headers };
};
