import { writable, type Writable, type Readable } from 'svelte/store';

/**
 * Enum representing the severity levels of logs.
 */
export enum LogLevel {
	/** Detailed debug information, useful for development. */
	DEBUG = 0,
	/** General informational messages. */
	INFO = 1,
	/** Warning messages indicating potential issues. */
	WARN = 2,
	/** Error messages indicating failures. */
	ERROR = 3
}

export interface LogEntry {
	timestamp: string;
	level: string; // 'DEBUG' | 'INFO' | 'WARN' | 'ERROR'
	message: unknown[];
}

/**
 * A simple logging service that supports log levels and formatting.
 *
 * Usage:
 * ```ts
 * import { Logger } from '$lib/utils/logger';
 * Logger.debug('My message', { some: 'data' });
 * ```
 */
export class LoggerService {
	private level: LogLevel = LogLevel.DEBUG;
	private logs: Writable<LogEntry[]> = writable([]);
	private maxLogs = 500;
	private shouldWriteToConsole = true;

	constructor() {
		// Default to DEBUG for now, could be configurable
	}

	/**
	 * Sets the minimum log level. Messages below this level will be suppressed.
	 * @param level - The new log level.
	 */
	setLevel(level: LogLevel) {
		this.level = level;
	}

	/**
	 * Parses and applies a log level from a string value.
	 *
	 * Returns true when the value is valid and false when ignored.
	 */
	setLevelFromString(level: string): boolean {
		const normalizedLevel = level.trim().toUpperCase();
		const levelValue = LogLevel[normalizedLevel as keyof typeof LogLevel];

		if (typeof levelValue !== 'number') {
			return false;
		}

		this.level = levelValue;
		return true;
	}

	/**
	 * Allows runtime control over in-memory retention.
	 */
	setMaxLogs(maxLogs: number): boolean {
		if (!Number.isInteger(maxLogs) || maxLogs <= 0) {
			return false;
		}

		this.maxLogs = maxLogs;
		this.logs.update((currentLogs) => currentLogs.slice(0, this.maxLogs));
		return true;
	}

	/**
	 * Enable/disable console output while still preserving store logs.
	 */
	setConsoleOutput(enabled: boolean) {
		this.shouldWriteToConsole = enabled;
	}

	/**
	 * Gets the store of logs.
	 */
	get logsStore(): Readable<LogEntry[]> {
		return { subscribe: this.logs.subscribe };
	}

	/**
	 * Clears all logs.
	 */
	clear() {
		this.logs.set([]);
	}

	private formatMessage(level: string, ...args: unknown[]): any[] {
		const timestamp = new Date().toISOString();
		return [`[${timestamp}] [${level}]`, ...args];
	}

	private addLog(level: string, args: unknown[]) {
		const entry: LogEntry = {
			timestamp: new Date().toISOString(),
			level,
			message: args
		};

		this.logs.update((currentLogs) => {
			const newLogs = [entry, ...currentLogs];
			if (newLogs.length > this.maxLogs) {
				return newLogs.slice(0, this.maxLogs);
			}
			return newLogs;
		});
	}

	/**
	 * Logs a debug message.
	 * @param args - The arguments to log.
	 */
	debug(...args: unknown[]) {
		if (this.level <= LogLevel.DEBUG) {
			if (this.shouldWriteToConsole) {
				console.debug(...this.formatMessage('DEBUG', ...args));
			}
			this.addLog('DEBUG', args);
		}
	}

	/**
	 * Logs an info message.
	 * @param args - The arguments to log.
	 */
	info(...args: unknown[]) {
		if (this.level <= LogLevel.INFO) {
			if (this.shouldWriteToConsole) {
				console.info(...this.formatMessage('INFO', ...args));
			}
			this.addLog('INFO', args);
		}
	}

	/**
	 * Logs a warning message.
	 * @param args - The arguments to log.
	 */
	warn(...args: unknown[]) {
		if (this.level <= LogLevel.WARN) {
			if (this.shouldWriteToConsole) {
				console.warn(...this.formatMessage('WARN', ...args));
			}
			this.addLog('WARN', args);
		}
	}

	/**
	 * Logs an error message.
	 * @param args - The arguments to log.
	 */
	error(...args: unknown[]) {
		if (this.level <= LogLevel.ERROR) {
			if (this.shouldWriteToConsole) {
				console.error(...this.formatMessage('ERROR', ...args));
			}
			this.addLog('ERROR', args);
		}
	}
}

export const Logger = new LoggerService();
