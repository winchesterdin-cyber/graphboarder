import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import QueryHistory from './QueryHistory.svelte';
import { addToHistory, clearHistory } from '$lib/stores/queryHistory';

describe('QueryHistory Component', () => {
	beforeEach(() => {
		clearHistory();
	});

	it('should render history items', async () => {
		addToHistory({
			query: 'query { test }',
			endpointId: '1',
			operationName: 'testQuery'
		});

		const { getByText } = render(QueryHistory, {
			props: {
				onRestore: () => {},
				onClose: () => {}
			}
		});

		expect(getByText('testQuery')).toBeTruthy();
	});

	it('should call onRestore when Restore button is clicked', async () => {
		addToHistory({
			query: 'query { test }',
			endpointId: '1',
			operationName: 'testQuery'
		});

		const onRestore = vi.fn();
		const { getByText } = render(QueryHistory, {
			props: {
				onRestore,
				onClose: () => {}
			}
		});

		await fireEvent.click(getByText('Restore'));
		expect(onRestore).toHaveBeenCalled();
	});

	it('should show export and import buttons', () => {
		const { getByText } = render(QueryHistory, {
			props: {
				onRestore: () => {},
				onClose: () => {}
			}
		});

		expect(getByText('Export')).toBeTruthy();
		expect(getByText('Import')).toBeTruthy();
	});

	it('should expand details and copy query text', async () => {
		addToHistory({
			query: 'query { test }',
			endpointId: '1',
			operationName: 'testQuery',
			variables: { limit: 10 }
		});

		const writeText = vi.fn().mockResolvedValue(undefined);
		Object.defineProperty(globalThis.navigator, 'clipboard', {
			value: { writeText },
			configurable: true
		});

		const { getByTitle, getByText, getByLabelText } = render(QueryHistory, {
			props: {
				onRestore: () => {},
				onClose: () => {}
			}
		});

		await fireEvent.click(getByTitle('Show Details'));
		expect(getByText('Variables')).toBeTruthy();

		await fireEvent.click(getByLabelText('Copy Query'));
		expect(writeText).toHaveBeenCalledWith('query { test }');
	});
});
