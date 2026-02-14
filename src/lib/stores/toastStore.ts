import { writable } from 'svelte/store';
import { Logger } from '$lib/utils/logger';

/**
 * Represents the type of a toast message.
 */
export type ToastType = 'info' | 'success' | 'warning' | 'error';

/**
 * Represents a toast message object.
 */
export interface ToastMessage {
	id: string;
	type: ToastType;
	message: string;
	timeout?: number;
	createdAt: number;
}

/**
 * Structured options for creating a toast.
 */
export interface ToastOptions {
	message: string;
	type?: ToastType;
	timeout?: number;
}

const DEFAULT_TOAST_TIMEOUT_MS = 3000;

/**
 * Store for managing toast messages.
 */
function createToastStore() {
	const { subscribe, update, set } = writable<ToastMessage[]>([]);

	/**
	 * Adds a new toast message using structured options.
	 * @param options Structured toast options.
	 * @returns ID of the toast for lifecycle operations.
	 */
	const addToast = ({
		message,
		type = 'info',
		timeout = DEFAULT_TOAST_TIMEOUT_MS
	}: ToastOptions): string => {
		const id = crypto.randomUUID();
		const toastEntry: ToastMessage = {
			id,
			type,
			message,
			timeout,
			createdAt: Date.now()
		};

		Logger.info('Adding toast notification.', {
			id,
			type,
			timeout,
			messageLength: message.length
		});
		update((toasts) => [...toasts, toastEntry]);

		if (timeout && timeout > 0) {
			setTimeout(() => {
				remove(id);
			}, timeout);
		}

		return id;
	};

	/**
	 * Backward-compatible toast signature used across existing call sites.
	 */
	const add = (message: string, type: ToastType = 'info', timeout = DEFAULT_TOAST_TIMEOUT_MS) =>
		addToast({ message, type, timeout });

	/**
	 * Removes a toast message by ID.
	 * @param id The ID of the toast to remove.
	 */
	const remove = (id: string) => {
		Logger.debug('Removing toast notification.', { id });
		update((toasts) => toasts.filter((t) => t.id !== id));
	};

	/**
	 * Clears all active toast messages.
	 */
	const clear = () => {
		Logger.debug('Clearing all toast notifications.');
		set([]);
	};

	return {
		subscribe,
		add,
		addToast,
		remove,
		clear,
		/**
		 * specific helpers
		 */
		info: (message: string, timeout?: number) => addToast({ message, type: 'info', timeout }),
		success: (message: string, timeout?: number) => addToast({ message, type: 'success', timeout }),
		warning: (message: string, timeout?: number) => addToast({ message, type: 'warning', timeout }),
		error: (message: string, timeout?: number) => addToast({ message, type: 'error', timeout })
	};
}

export const toast = createToastStore();
