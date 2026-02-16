import { Logger } from './logger';

type CsvRow = Record<string, unknown>;

export interface CsvConversionOptions {
	delimiter?: string;
	lineTerminator?: string;
	includeBom?: boolean;
	headers?: string[];
	sortHeaders?: boolean;
	excelSafeMode?: boolean;
	arrayMode?: 'json' | 'join';
	arrayJoinDelimiter?: string;
	dateMode?: 'iso' | 'locale';
}

export interface CsvConversionResult {
	csv: string;
	headers: string[];
	rowCount: number;
}

/**
 * Prefixes spreadsheet formula payloads to prevent accidental formula execution
 * when users open exported CSV files in Excel/Sheets.
 */
const sanitizeExcelFormula = (value: string, enabled: boolean): string => {
	if (!enabled) {
		return value;
	}

	if (/^[=+\-@]/.test(value)) {
		return `'${value}`;
	}

	return value;
};

const flattenObject = (obj: CsvRow, prefix = ''): CsvRow => {
	return Object.keys(obj).reduce<CsvRow>((acc, key) => {
		const pre = prefix.length ? `${prefix}.` : '';
		const value = obj[key];
		if (
			typeof value === 'object' &&
			value !== null &&
			!Array.isArray(value) &&
			!(value instanceof Date)
		) {
			Object.assign(acc, flattenObject(value as CsvRow, pre + key));
		} else {
			acc[pre + key] = value;
		}
		return acc;
	}, {});
};

const normalizeFilename = (filename: string, fallback: string): string => {
	const trimmed = filename.trim();
	const safe = trimmed.replace(/[\\/:*?"<>|]/g, '_');
	return safe || fallback;
};

const serializeCellValue = (value: unknown, options: Required<CsvConversionOptions>): string => {
	if (value === null || value === undefined) {
		return '';
	}

	if (Array.isArray(value)) {
		if (options.arrayMode === 'join') {
			return value.map((item) => String(item)).join(options.arrayJoinDelimiter);
		}
		return JSON.stringify(value);
	}

	if (value instanceof Date) {
		return options.dateMode === 'locale' ? value.toLocaleString() : value.toISOString();
	}

	if (typeof value === 'object') {
		return JSON.stringify(value);
	}

	return String(value);
};

const escapeCsvCell = (value: string, delimiter: string): string => {
	if (
		value.includes(delimiter) ||
		value.includes('"') ||
		value.includes('\n') ||
		value.includes('\r')
	) {
		return `"${value.replace(/"/g, '""')}"`;
	}
	return value;
};

const normalizeCsvOptions = (options?: CsvConversionOptions): Required<CsvConversionOptions> => {
	return {
		delimiter: options?.delimiter || ',',
		lineTerminator: options?.lineTerminator || '\n',
		includeBom: options?.includeBom ?? false,
		headers: options?.headers || [],
		sortHeaders: options?.sortHeaders ?? false,
		excelSafeMode: options?.excelSafeMode ?? false,
		arrayMode: options?.arrayMode || 'json',
		arrayJoinDelimiter: options?.arrayJoinDelimiter || '; ',
		dateMode: options?.dateMode || 'iso'
	};
};

/**
 * Converts rows to CSV with configurable formatting, sanitization and metadata.
 */
export const convertArrayToCSVWithMetadata = (
	data: CsvRow[],
	options?: CsvConversionOptions
): CsvConversionResult => {
	if (!data || !data.length) {
		Logger.info('CSV export skipped because dataset is empty');
		return { csv: '', headers: [], rowCount: 0 };
	}

	const normalizedOptions = normalizeCsvOptions(options);
	const flatData = data.map((item) => flattenObject(item));
	const discoveredHeaders = Array.from(
		new Set(flatData.reduce<string[]>((keys, row) => keys.concat(Object.keys(row)), []))
	);
	const headers =
		normalizedOptions.headers.length > 0
			? normalizedOptions.headers
			: normalizedOptions.sortHeaders
				? [...discoveredHeaders].sort((left, right) => left.localeCompare(right))
				: discoveredHeaders;

	const csvRows = flatData.map((row) =>
		headers
			.map((header) => {
				const rawValue = serializeCellValue(row[header as keyof typeof row], normalizedOptions);
				const safeValue = sanitizeExcelFormula(rawValue, normalizedOptions.excelSafeMode);
				return escapeCsvCell(safeValue, normalizedOptions.delimiter);
			})
			.join(normalizedOptions.delimiter)
	);

	const csvBody = [headers.join(normalizedOptions.delimiter), ...csvRows].join(
		normalizedOptions.lineTerminator
	);
	const csv = normalizedOptions.includeBom ? `\uFEFF${csvBody}` : csvBody;

	Logger.info('CSV export completed', {
		rowCount: data.length,
		headerCount: headers.length,
		options: normalizedOptions
	});

	return {
		csv,
		headers,
		rowCount: data.length
	};
};

export const convertArrayToCSV = (data: CsvRow[], options?: CsvConversionOptions): string => {
	return convertArrayToCSVWithMetadata(data, options).csv;
};

const triggerDownload = (content: string, filename: string, mimeType: string) => {
	if (typeof document === 'undefined') {
		Logger.warn('Download skipped because document is not available');
		return;
	}

	const blob = new Blob([content], { type: mimeType });
	const link = document.createElement('a');
	if (link.download === undefined) {
		Logger.warn('Download skipped because browser does not support anchor download attribute');
		return;
	}

	const url = URL.createObjectURL(blob);
	link.setAttribute('href', url);
	link.setAttribute('download', filename);
	link.style.visibility = 'hidden';
	document.body.appendChild(link);
	link.click();
	document.body.removeChild(link);
	setTimeout(() => URL.revokeObjectURL(url), 100);
};

export const downloadCSV = (
	data: CsvRow[],
	filename = 'export.csv',
	options?: CsvConversionOptions
) => {
	const { csv } = convertArrayToCSVWithMetadata(data, options);
	if (!csv) {
		return;
	}

	const safeFilename = normalizeFilename(filename, 'export.csv');
	Logger.debug('Downloading CSV file', { safeFilename });
	triggerDownload(csv, safeFilename, 'text/csv;charset=utf-8;');
};

/**
 * Downloads the given data as a JSON file.
 */
export const downloadJSON = (data: CsvRow[], filename = 'export.json') => {
	if (!data || !data.length) {
		Logger.info('JSON download skipped because array is empty');
		return;
	}

	const json = JSON.stringify(data, null, 2);
	const safeFilename = normalizeFilename(filename, 'export.json');
	Logger.debug('Downloading JSON array file', { safeFilename, rowCount: data.length });
	triggerDownload(json, safeFilename, 'application/json;charset=utf-8;');
};

/**
 * Downloads any JSON-serializable value as a JSON file.
 */
export const downloadJSONValue = (data: unknown, filename = 'export.json') => {
	if (data === undefined) {
		Logger.info('JSON value download skipped because data is undefined');
		return;
	}

	const json = JSON.stringify(data, null, 2);
	const safeFilename = normalizeFilename(filename, 'export.json');
	Logger.debug('Downloading JSON value file', { safeFilename });
	triggerDownload(json, safeFilename, 'application/json;charset=utf-8;');
};

/**
 * Downloads plain text content as a file.
 */
export const downloadTextFile = (
	content: string,
	filename: string,
	mimeType = 'text/plain;charset=utf-8;'
) => {
	if (!content) {
		Logger.info('Text download skipped because content is empty');
		return;
	}

	const safeFilename = normalizeFilename(filename, 'export.txt');
	Logger.debug('Downloading text file', { safeFilename, length: content.length, mimeType });
	triggerDownload(content, safeFilename, mimeType);
};
