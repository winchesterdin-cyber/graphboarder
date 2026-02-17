import { describe, it, expect } from 'vitest';
import { convertArrayToCSV, convertArrayToCSVWithMetadata, downloadTextFile } from './exportUtils';

describe('exportUtils', () => {
	describe('convertArrayToCSV', () => {
		it('should convert an array of objects to CSV string', () => {
			const data = [
				{ name: 'John', age: 30, city: 'New York' },
				{ name: 'Jane', age: 25, city: 'San Francisco' }
			];
			const expected = 'name,age,city\nJohn,30,New York\nJane,25,San Francisco';
			expect(convertArrayToCSV(data)).toBe(expected);
		});

		it('should handle nested objects', () => {
			const data = [
				{ name: 'John', address: { city: 'New York', zip: '10001' } },
				{ name: 'Jane', address: { city: 'San Francisco', zip: '94105' } }
			];
			const expected =
				'name,address.city,address.zip\nJohn,New York,10001\nJane,San Francisco,94105';
			expect(convertArrayToCSV(data)).toBe(expected);
		});

		it('should handle null and undefined values', () => {
			const data = [
				{ name: 'John', age: null },
				{ name: 'Jane', age: undefined }
			];
			const expected = 'name,age\nJohn,\nJane,';
			expect(convertArrayToCSV(data)).toBe(expected);
		});

		it('should escape values containing commas, quotes, or newlines', () => {
			const data = [
				{ name: 'John, Doe', bio: 'He said "Hello"' },
				{ name: 'Jane\nDoe', bio: 'Line 1\nLine 2' }
			];
			const expected = 'name,bio\n"John, Doe","He said ""Hello"""\n"Jane\nDoe","Line 1\nLine 2"';
			expect(convertArrayToCSV(data)).toBe(expected);
		});

		it('should return empty string for empty array', () => {
			expect(convertArrayToCSV([])).toBe('');
		});

		it('supports custom delimiter and sorted headers', () => {
			const data = [{ b: 2, a: 1 }];
			expect(convertArrayToCSV(data, { delimiter: ';', sortHeaders: true })).toBe('a;b\n1;2');
		});

		it('supports custom headers and BOM output', () => {
			const data = [{ a: 1, b: 2 }];
			const csv = convertArrayToCSV(data, { headers: ['b'], includeBom: true });
			expect(csv.startsWith('\uFEFF')).toBe(true);
			expect(csv).toContain('b\n2');
		});

		it('sanitizes spreadsheet formula payloads in safe mode', () => {
			const data = [{ name: '=HYPERLINK("x")' }];
			expect(convertArrayToCSV(data, { excelSafeMode: true })).toBe('name\n"\'=HYPERLINK(""x"")"');
		});

		it('serializes arrays using join mode', () => {
			const data = [{ id: 1, tags: ['alpha', 'beta'] }];
			expect(
				convertArrayToCSV(data, {
					arrayMode: 'join',
					arrayJoinDelimiter: '|'
				})
			).toBe('id,tags\n1,alpha|beta');
		});

		it('supports configurable boolean/null/undefined values', () => {
			const data = [{ active: true, deleted: false, nullable: null, unknown: undefined }];
			expect(
				convertArrayToCSV(data, {
					booleanMode: 'numeric',
					nullValue: 'NULL',
					undefinedValue: 'UNDEFINED'
				})
			).toBe('active,deleted,nullable,unknown\n1,0,NULL,UNDEFINED');
		});

		it('supports row numbers and header labels', () => {
			const data = [{ a: 1 }];
			expect(
				convertArrayToCSV(data, {
					includeRowNumber: true,
					rowNumberHeader: '__index',
					headerLabelMap: { __index: '#', a: 'A Value' }
				})
			).toBe('#,A Value\n1,1');
		});

		it('supports trim and always quote mode', () => {
			const data = [{ text: '  hello  ' }];
			expect(convertArrayToCSV(data, { trimStringValues: true, quoteMode: 'always' })).toBe(
				'"text"\n"hello"'
			);
		});

		it('enforces max rows and max cell length in metadata mode', () => {
			const data = [{ name: 'abcdef' }, { name: 'ghijkl' }, { name: 'mnopqr' }];
			const result = convertArrayToCSVWithMetadata(data, {
				maxRows: 2,
				maxCellLength: 4,
				truncateCellSuffix: '*'
			});
			expect(result.rowCount).toBe(2);
			expect(result.truncatedRowCount).toBe(1);
			expect(result.csv).toBe('name\nabc*\nghi*');
		});

		it('returns metadata for diagnostics', () => {
			const data = [{ id: 1 }, { id: 2 }];
			const result = convertArrayToCSVWithMetadata(data);
			expect(result.rowCount).toBe(2);
			expect(result.headers).toEqual(['id']);
			expect(result.truncatedRowCount).toBe(0);
			expect(result.csv).toContain('id');
		});
	});

	describe('downloadTextFile', () => {
		it('should no-op when content is empty', () => {
			expect(() => downloadTextFile('', 'empty.txt')).not.toThrow();
		});
	});
});
