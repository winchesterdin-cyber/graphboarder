import { describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import { LoggerService, LogLevel } from './logger';

describe('LoggerService', () => {
	it('applies level from string and rejects invalid values', () => {
		const logger = new LoggerService();

		expect(logger.setLevelFromString('warn')).toBe(true);
		logger.info('suppressed info message');
		expect(get(logger.logsStore)).toEqual([]);

		expect(logger.setLevelFromString('bad-level')).toBe(false);
		logger.warn('visible warning message');
		expect(get(logger.logsStore)).toHaveLength(1);
	});

	it('keeps log retention bounded by maxLogs', () => {
		const logger = new LoggerService();
		logger.setConsoleOutput(false);
		logger.setLevel(LogLevel.DEBUG);

		expect(logger.setMaxLogs(2)).toBe(true);
		expect(logger.setMaxLogs(0)).toBe(false);

		logger.debug('first');
		logger.debug('second');
		logger.debug('third');

		const logs = get(logger.logsStore);
		expect(logs).toHaveLength(2);
		expect(logs[0].message).toEqual(['third']);
		expect(logs[1].message).toEqual(['second']);
	});
});
