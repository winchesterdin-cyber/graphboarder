import { Logger } from './logger';

const URL_MAX_LENGTH = 2_048;
const HEADER_MAX_COUNT = 50;
const HEADER_LINE_MAX_LENGTH = 8_192;
const HEADER_VALUE_MAX_LENGTH = 4_096;
const HEADER_NAME_TOKEN_REGEX = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
const HOP_BY_HOP_HEADERS = new Set([
	'connection',
	'keep-alive',
	'proxy-authenticate',
	'proxy-authorization',
	'te',
	'trailer',
	'transfer-encoding',
	'upgrade',
	'host',
	'content-length'
]);

/**
 * Warnings are used for non-fatal quality hints so callers can decide whether to show guidance.
 */
interface ValidationWarning {
	code: string;
	message: string;
}

export interface EndpointValidationResult {
	ok: boolean;
	error?: string;
	normalizedUrl?: string;
	warnings: ValidationWarning[];
}

interface HeaderValidationIssue {
	line: number;
	message: string;
}

export interface ParsedHeadersResult {
	ok: boolean;
	headers: Record<string, string>;
	errors: HeaderValidationIssue[];
	warnings: ValidationWarning[];
	error?: string;
}

const pushWarning = (warnings: ValidationWarning[], code: string, message: string) => {
	warnings.push({ code, message });
	Logger.debug('Endpoint validation warning raised.', { code, message });
};

const removeWrappingQuotes = (value: string): string => {
	if (
		(value.startsWith('"') && value.endsWith('"')) ||
		(value.startsWith("'") && value.endsWith("'"))
	) {
		return value.slice(1, -1);
	}

	return value;
};

const normalizeUrlWithoutProtocol = (input: string): string => {
	if (/^localhost(?::\d+)?\//i.test(input) || /^localhost(?::\d+)?$/i.test(input)) {
		return `http://${input}`;
	}
	return `https://${input}`;
};

/**
 * Validates endpoint URL and enforces http(s) protocols.
 *
 * Major enhancements:
 * - Supports protocol auto-inference for host-only URLs
 * - Blocks unsafe URL credentials and fragments
 * - Provides normalization output and warnings for suspicious but valid input
 */
export const validateEndpointUrl = (url: string): EndpointValidationResult => {
	const warnings: ValidationWarning[] = [];
	const normalizedUrl = url.trim();
	if (!normalizedUrl) {
		return { ok: false, error: 'Endpoint URL is required.', warnings };
	}

	if (normalizedUrl.length > URL_MAX_LENGTH) {
		return {
			ok: false,
			error: `Endpoint URL exceeds ${URL_MAX_LENGTH} characters.`,
			warnings
		};
	}

	if (/\s/.test(normalizedUrl)) {
		return { ok: false, error: 'Endpoint URL cannot contain whitespace.', warnings };
	}

	const hasProtocol = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(normalizedUrl);
	const candidateUrl = hasProtocol ? normalizedUrl : normalizeUrlWithoutProtocol(normalizedUrl);
	if (!hasProtocol) {
		pushWarning(
			warnings,
			'missing-protocol',
			'Endpoint URL did not include a protocol and was normalized automatically.'
		);
	}

	try {
		const parsed = new URL(candidateUrl);
		if (!['http:', 'https:'].includes(parsed.protocol)) {
			return { ok: false, error: 'Only http:// and https:// URLs are supported.', warnings };
		}

		if (!parsed.hostname) {
			return { ok: false, error: 'Endpoint URL must include a hostname.', warnings };
		}

		if (parsed.username || parsed.password) {
			return {
				ok: false,
				error: 'Endpoint URL must not include inline credentials.',
				warnings
			};
		}

		if (parsed.hash) {
			return { ok: false, error: 'Endpoint URL must not include a hash fragment.', warnings };
		}

		if (parsed.search) {
			pushWarning(
				warnings,
				'query-string',
				'Endpoint URL includes query parameters. Ensure your API expects them.'
			);
		}

		if (
			parsed.protocol === 'http:' &&
			parsed.hostname !== 'localhost' &&
			parsed.hostname !== '127.0.0.1'
		) {
			pushWarning(
				warnings,
				'insecure-http',
				'Using HTTP on non-localhost hosts is insecure. Prefer HTTPS for production endpoints.'
			);
		}

		if (!/graphql/i.test(parsed.pathname)) {
			pushWarning(
				warnings,
				'non-graphql-path',
				'Endpoint path does not include "graphql". Confirm this endpoint serves GraphQL requests.'
			);
		}

		return { ok: true, normalizedUrl: parsed.toString(), warnings };
	} catch (error) {
		Logger.warn('Endpoint URL failed validation parsing.', {
			input: normalizedUrl,
			error: error instanceof Error ? error.message : String(error)
		});
		return { ok: false, error: 'Endpoint URL is invalid.', warnings };
	}
};

/**
 * Parses and validates header text in `Key: Value` line format.
 *
 * Enhancements include:
 * - Comment support (`# comment` / `// comment`)
 * - Better diagnostics (aggregated errors, bounded limits, unsafe header detection)
 * - Duplicate header guarding and quote normalization
 */
export const parseHeadersInput = (headersInput: string): ParsedHeadersResult => {
	const headers: Record<string, string> = {};
	const errors: HeaderValidationIssue[] = [];
	const warnings: ValidationWarning[] = [];
	const seenHeaderNames = new Set<string>();

	if (!headersInput.trim()) {
		return { ok: true, headers, errors, warnings };
	}

	const lines = headersInput.split('\n');
	if (lines.length > HEADER_MAX_COUNT) {
		errors.push({
			line: 0,
			message: `Too many header lines (${lines.length}). Maximum supported is ${HEADER_MAX_COUNT}.`
		});
		return {
			ok: false,
			headers: {},
			errors,
			warnings,
			error: errors[0].message
		};
	}

	for (const [index, line] of lines.entries()) {
		const trimmed = line.trim();
		const lineNumber = index + 1;
		if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) {
			continue;
		}

		if (trimmed.length > HEADER_LINE_MAX_LENGTH) {
			errors.push({
				line: lineNumber,
				message: `Header line ${lineNumber} exceeds ${HEADER_LINE_MAX_LENGTH} characters.`
			});
			continue;
		}

		const separatorIndex = trimmed.indexOf(':');
		if (separatorIndex <= 0 || separatorIndex === trimmed.length - 1) {
			Logger.warn('Invalid endpoint header format.', { index, line: trimmed });
			errors.push({
				line: lineNumber,
				message: `Invalid header format on line ${lineNumber}. Use Key: Value.`
			});
			continue;
		}

		const key = trimmed.slice(0, separatorIndex).trim();
		const rawValue = trimmed.slice(separatorIndex + 1).trim();
		const value = removeWrappingQuotes(rawValue);
		const normalizedKey = key.toLowerCase();

		if (!key || !value) {
			errors.push({
				line: lineNumber,
				message: `Invalid header content on line ${lineNumber}.`
			});
			continue;
		}

		if (!HEADER_NAME_TOKEN_REGEX.test(key)) {
			errors.push({
				line: lineNumber,
				message: `Invalid header name on line ${lineNumber}.`
			});
			continue;
		}

		if (seenHeaderNames.has(normalizedKey)) {
			errors.push({
				line: lineNumber,
				message: `Duplicate header "${key}" on line ${lineNumber}.`
			});
			continue;
		}

		if (value.length > HEADER_VALUE_MAX_LENGTH) {
			errors.push({
				line: lineNumber,
				message: `Header value for "${key}" exceeds ${HEADER_VALUE_MAX_LENGTH} characters.`
			});
			continue;
		}

		if (HOP_BY_HOP_HEADERS.has(normalizedKey)) {
			errors.push({
				line: lineNumber,
				message: `Header "${key}" is not allowed in endpoint configuration.`
			});
			continue;
		}

		if (/\$\{[^}]+\}/.test(value)) {
			pushWarning(
				warnings,
				'env-placeholder',
				`Header "${key}" contains an environment variable placeholder. Ensure it is substituted before use.`
			);
		}

		if (normalizedKey === 'authorization' && !/^bearer\s+.+/i.test(value)) {
			pushWarning(
				warnings,
				'authorization-format',
				'Authorization header does not use Bearer token format.'
			);
		}

		seenHeaderNames.add(normalizedKey);
		headers[key] = value;
	}

	if (errors.length > 0) {
		Logger.warn('Endpoint headers failed validation.', { errors, warningCount: warnings.length });
		return {
			ok: false,
			headers: {},
			errors,
			warnings,
			error: errors[0].message
		};
	}

	Logger.info('Endpoint headers parsed successfully.', {
		headerCount: Object.keys(headers).length,
		warningCount: warnings.length
	});
	return { ok: true, headers, errors, warnings };
};
