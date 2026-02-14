import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { get } from 'svelte/store';
import { toast } from './toastStore';

describe('toastStore', () => {
	beforeEach(() => {
		toast.clear();
		vi.useFakeTimers();
	});

	afterEach(() => {
		toast.clear();
		vi.useRealTimers();
	});

	it('adds and removes toast messages', () => {
		const id = toast.addToast({ message: 'Saved', type: 'success', timeout: 0 });
		const activeToasts = get(toast);
		expect(activeToasts).toHaveLength(1);
		expect(activeToasts[0].id).toBe(id);
		expect(activeToasts[0].type).toBe('success');

		toast.remove(id);
		expect(get(toast)).toHaveLength(0);
	});

	it('auto-removes toasts after timeout', () => {
		toast.info('Auto remove', 1000);
		expect(get(toast)).toHaveLength(1);

		vi.advanceTimersByTime(999);
		expect(get(toast)).toHaveLength(1);

		vi.advanceTimersByTime(1);
		expect(get(toast)).toHaveLength(0);
	});

	it('supports helper methods and clear lifecycle', () => {
		toast.success('ok', 0);
		toast.warning('careful', 0);
		toast.error('failed', 0);
		expect(get(toast)).toHaveLength(3);

		toast.clear();
		expect(get(toast)).toEqual([]);
	});
});
