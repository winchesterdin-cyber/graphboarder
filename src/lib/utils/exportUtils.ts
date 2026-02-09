type CsvRow = Record<string, unknown>;

export const convertArrayToCSV = (data: CsvRow[]): string => {
	if (!data || !data.length) {
		return '';
	}

	const flattenObject = (obj: CsvRow, prefix = ''): CsvRow => {
		return Object.keys(obj).reduce<CsvRow>((acc, k) => {
			const pre = prefix.length ? prefix + '.' : '';
			const value = obj[k];
			if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
				Object.assign(acc, flattenObject(value as CsvRow, pre + k));
			} else {
				acc[pre + k] = value;
			}
			return acc;
		}, {});
	};

	const flatData = data.map((item) => flattenObject(item));
	const headers = Array.from(
		new Set(flatData.reduce((keys, obj) => keys.concat(Object.keys(obj)), []))
	);

	const csvContent = [
		headers.join(','),
		...flatData.map((row) =>
			headers
				.map((header) => {
					const val = row[header as keyof typeof row];
					if (val === null || val === undefined) {
						return '';
					}
					let stringVal = String(val);
					if (stringVal.includes(',') || stringVal.includes('"') || stringVal.includes('\n')) {
						stringVal = `"${stringVal.replace(/"/g, '""')}"`;
					}
					return stringVal;
				})
				.join(',')
		)
	].join('\n');

	return csvContent;
};

export const downloadCSV = (data: CsvRow[], filename = 'export.csv') => {
	const csv = convertArrayToCSV(data);
	const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
	const link = document.createElement('a');
	if (link.download !== undefined) {
		const url = URL.createObjectURL(blob);
		link.setAttribute('href', url);
		link.setAttribute('download', filename);
		link.style.visibility = 'hidden';
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
		setTimeout(() => URL.revokeObjectURL(url), 100);
	}
};

/**
 * Downloads the given data as a JSON file.
 * @param data - The data array to download.
 * @param filename - The name of the file to download (default: 'export.json').
 */
export const downloadJSON = (data: CsvRow[], filename = 'export.json') => {
	if (!data || !data.length) {
		return;
	}

	const json = JSON.stringify(data, null, 2);
	const blob = new Blob([json], { type: 'application/json;charset=utf-8;' });
	const link = document.createElement('a');
	if (link.download !== undefined) {
		const url = URL.createObjectURL(blob);
		link.setAttribute('href', url);
		link.setAttribute('download', filename);
		link.style.visibility = 'hidden';
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
		setTimeout(() => URL.revokeObjectURL(url), 100);
	}
};

/**
 * Downloads any JSON-serializable value as a JSON file.
 * @param data - The value to serialize and download.
 * @param filename - The name of the file to download (default: 'export.json').
 */
export const downloadJSONValue = (data: unknown, filename = 'export.json') => {
	if (data === undefined) {
		return;
	}

	const json = JSON.stringify(data, null, 2);
	const blob = new Blob([json], { type: 'application/json;charset=utf-8;' });
	const link = document.createElement('a');
	if (link.download !== undefined) {
		const url = URL.createObjectURL(blob);
		link.setAttribute('href', url);
		link.setAttribute('download', filename);
		link.style.visibility = 'hidden';
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
		setTimeout(() => URL.revokeObjectURL(url), 100);
	}
};

/**
 * Downloads plain text content as a file.
 * @param content - The text content to download.
 * @param filename - The name of the file to download.
 * @param mimeType - Optional MIME type for the file (default: text/plain).
 */
export const downloadTextFile = (
	content: string,
	filename: string,
	mimeType = 'text/plain;charset=utf-8;'
) => {
	if (!content) {
		return;
	}

	const blob = new Blob([content], { type: mimeType });
	const link = document.createElement('a');
	if (link.download !== undefined) {
		const url = URL.createObjectURL(blob);
		link.setAttribute('href', url);
		link.setAttribute('download', filename);
		link.style.visibility = 'hidden';
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
		setTimeout(() => URL.revokeObjectURL(url), 100);
	}
};
