<script lang="ts">
	/**
	 * GraphqlCodeDisplay Component
	 *
	 * Displays a GraphQL query with syntax highlighting, editing capabilities,
	 * and a toolbar for executing, formatting, and managing the query.
	 */
	import CodeEditor from './fields/CodeEditor.svelte';
	import { format } from 'graphql-formatter';
	import hljs from 'highlight.js/lib/core';
	import graphql from 'highlight.js/lib/languages/graphql';
	import { getContext, untrack } from 'svelte';
	import 'highlight.js/styles/base16/solarized-dark.css';
	import { Logger } from '$lib/utils/logger';
	import { getPreciseType } from '$lib/utils/usefulFunctions';
	import { updateStoresFromAST } from '$lib/utils/astToUIState';
	import { generateCurlCommand } from '$lib/utils/curlUtils';
	import { parseCurlCommand } from '$lib/utils/curlParser';
	import { get } from 'svelte/store';
	import { parse, print, stripIgnoredCharacters, type ASTNode } from 'graphql';
	import JSON5 from 'json5';
	import QueryHistory from '$lib/components/QueryHistory.svelte';
	import { addToHistory, type HistoryItem } from '$lib/stores/queryHistory';
	import { generateMockData } from '$lib/utils/mockGenerator';
	import { generatePostmanCollectionForQuery } from '$lib/utils/postmanUtils';
	import Modal from '$lib/components/Modal.svelte';
	import { toast } from '$lib/stores/toastStore';
	import { generateSnippet, SUPPORTED_LANGUAGES } from '$lib/utils/snippetGenerator';
	import { compressQuery, decompressQuery } from '$lib/utils/shareUtils';
	import { extractVariables } from '$lib/utils/variableExtractor';
	import {
		calculateComplexity,
		calculateResponseSize,
		formatBytes,
		type QueryComplexity
	} from '$lib/utils/queryAnalyzer';
	import {
		convertArrayToCSV,
		downloadCSV,
		downloadJSONValue,
		downloadTextFile
	} from '$lib/utils/exportUtils';
	import { findExportableRows } from '$lib/utils/resultExport';
	import { getActiveEnvironment } from '$lib/stores/environmentStore';
	import { substituteVariables } from '$lib/utils/variableSubstitutor';
	import DiffViewer from '$lib/components/UI/DiffViewer.svelte';
	import type { OperationResult } from '@urql/core';

	interface Props {
		/**
		 * Whether to show the raw, non-prettified query body.
		 */
		showNonPrettifiedQMSBody?: boolean;
		/**
		 * The GraphQL query string to display.
		 */
		value: string;
		/**
		 * The variables JSON string.
		 */
		variablesString?: string;
		/**
		 * Whether to enable syncing changes in the editor back to the UI stores.
		 * Default: true
		 */
		enableSyncToUI?: boolean;
		/**
		 * Prefix for context keys.
		 */
		prefix?: string;
		/**
		 * Whether to enable sharing the query via URL.
		 */
		enableShareUrl?: boolean;
	}

	type UrqlClient = {
		query: (
			query: string,
			variables: Record<string, unknown>
		) => { toPromise: () => Promise<OperationResult<unknown>> };
		mutation: (
			query: string,
			variables: Record<string, unknown>
		) => { toPromise: () => Promise<OperationResult<unknown>> };
	};

	let {
		showNonPrettifiedQMSBody = $bindable(false),
		value = $bindable(''),
		variablesString = $bindable('{}'),
		enableSyncToUI = true,
		prefix = '',
		enableShareUrl = false
	}: Props = $props();

	let valueModifiedManually = $state<string>(value);
	let lastSyncedValue = $state<string>(untrack(() => value));
	let showVariables = $state(false);

	// Try to get context if available
	import type { QMSMainWraperContext, QMSWraperContext } from '$lib/types/index';
	let qmsWraperCtx = $state<QMSWraperContext>();
	let mainWraperCtx = $state<QMSMainWraperContext>();

	try {
		qmsWraperCtx = getContext<QMSWraperContext>(`${untrack(() => prefix)}QMSWraperContext`);
		mainWraperCtx = getContext<QMSMainWraperContext>(
			`${untrack(() => prefix)}QMSMainWraperContext`
		);
	} catch (e) {
		Logger.debug('GraphqlCodeDisplay: Context not available', e);
	}

	// Ensure language is registered
	try {
		if (typeof hljs !== 'undefined' && hljs.registerLanguage) {
			// Some environments might not have getLanguage or might throw
			try {
				if (!hljs.getLanguage('graphql')) {
					hljs.registerLanguage('graphql', graphql);
				}
			} catch (e) {
				// If getLanguage fails, attempt registration anyway to be safe
				try {
					hljs.registerLanguage('graphql', graphql);
				} catch (e2) {
					Logger.debug('GraphqlCodeDisplay: Highlight language registration failed', e2);
				}
			}
		}
	} catch (e) {
		// ignore
	}

	$effect(() => {
		try {
			if (typeof hljs !== 'undefined' && hljs.highlightAll) {
				hljs.highlightAll();
			}
		} catch (e) {
			Logger.warn('GraphqlCodeDisplay: Highlight init failed', e);
		}
	});

	const handleMinify = () => {
		try {
			Logger.info('Minifying query...');
			const minified = stripIgnoredCharacters(value);
			value = minified;
			valueModifiedManually = minified;
			toast.success('Query minified');
		} catch (e) {
			Logger.warn('Minify failed', e);
			toast.error('Failed to minify query');
		}
	};

	let astAsString = $state('');
	let ast = $state();
	let astPrinted = $state();
	let isCopied = $state(false);
	let isCurlCopied = $state(false);
	let isMarkdownCopied = $state(false);
	let showHistory = $state(false);
	let showImportModal = $state(false);
	let importCurlValue = $state('');
	let mockDataResult = $state('');
	let showMockData = $state(false);
	let isExecuting = $state(false);
	let executionResult = $state('');
	let executionPayload = $state<unknown>(null);
	let showExecutionResult = $state(false);
	let executionTime = $state(0);
	let responseSize = $state(0);
	let queryComplexity = $state<QueryComplexity>({ depth: 0, fieldCount: 0 });
	let showSnippetsModal = $state(false);
	let selectedSnippetLanguage = $state('javascript-fetch');
	let snippetEditorLanguage = $derived(
		selectedSnippetLanguage.startsWith('python') ? 'python' : 'javascript'
	);
	let showDiffViewer = $state(false);
	let diffOriginal = $state('');
	let isCsvCopied = $state(false);
	let isResultMarkdownCopied = $state(false);

	let codeEditorInstance = $state<{ prettify?: () => Promise<void> } | null>(null);
	let exportRowsInfo = $derived(findExportableRows(executionPayload));
	let hasExportRows = $derived(!!exportRowsInfo && exportRowsInfo.rows.length > 0);

	/**
	 * Formats the query using the CodeEditor's prettify function or a fallback.
	 */
	const handlePrettify = async () => {
		if (codeEditorInstance) {
			try {
				Logger.info('Formatting query...');
				await codeEditorInstance.prettify();
				toast.success('Query formatted');
			} catch (e) {
				Logger.warn('Prettify failed', e);
				toast.error('Failed to format query');
			}
		} else {
			try {
				const formatted = format(value);
				value = formatted;
				valueModifiedManually = formatted;
				toast.success('Query formatted');
			} catch (e) {
				Logger.warn('Prettify failed', e);
				toast.error('Failed to format query');
			}
		}
	};

	const getParsedVariables = () => {
		try {
			return JSON.parse(variablesString || '{}');
		} catch (e) {
			Logger.warn('Failed to parse variables', e);
			return {};
		}
	};

	const handleExtractVariables = () => {
		try {
			Logger.info('Extracting variables from query...');
			const extracted = extractVariables(value);
			const currentVariables = getParsedVariables();

			// Merge: Keep existing values if keys match, otherwise use default from extracted.
			// Discard variables that are no longer in the query.
			const finalVariables: Record<string, unknown> = {};
			for (const key in extracted) {
				if (Object.prototype.hasOwnProperty.call(currentVariables, key)) {
					finalVariables[key] = currentVariables[key];
				} else {
					finalVariables[key] = extracted[key];
				}
			}

			variablesString = JSON.stringify(finalVariables, null, 2);
			showVariables = true;
			toast.success('Variables extracted and updated');
		} catch (e) {
			Logger.error('Failed to extract variables', e);
			toast.error('Failed to extract variables');
		}
	};

	let generatedSnippet = $derived.by(() => {
		if (showSnippetsModal && mainWraperCtx?.endpointInfo) {
			const info = get(mainWraperCtx.endpointInfo);
			let headers = info.headers || {};
			const env = getActiveEnvironment();
			if (Object.keys(env.variables).length > 0) {
				const substituted: Record<string, string> = {};
				for (const [k, v] of Object.entries(headers)) {
					substituted[k] = substituteVariables(v, env.variables);
				}
				headers = substituted;
			}
			return generateSnippet(
				selectedSnippetLanguage,
				info.url,
				value,
				getParsedVariables(),
				headers
			);
		}
		return '';
	});

	let isShareCopied = $state(false);

	const handleShare = () => {
		try {
			const vars = getParsedVariables();
			const compressed = compressQuery(value, vars);
			const url = new URL(window.location.href);
			url.searchParams.set('q', compressed);
			window.history.pushState({}, '', url.toString());
			navigator.clipboard.writeText(url.toString());
			isShareCopied = true;
			toast.success('Share URL copied to clipboard');
			Logger.info('Query Share URL copied', { hasVariables: Object.keys(vars).length > 0 });
			setTimeout(() => (isShareCopied = false), 2000);
		} catch (e) {
			Logger.error('Failed to share query', e);
			toast.error('Failed to create share URL');
		}
	};

	$effect(() => {
		if (enableShareUrl) {
			try {
				const params = new URLSearchParams(window.location.search);
				const q = params.get('q');
				if (q) {
					Logger.info('Found query in URL, restoring...');
					const restored = decompressQuery(q);
					if (restored) {
						valueModifiedManually = restored.query;
						if (restored.variables) {
							variablesString = JSON.stringify(restored.variables, null, 2);
							showVariables = true;
						}
						toast.success('Query loaded from URL');
						// Remove q from URL to clean up? Or keep it?
						// Keeping it allows reload to persist.
					}
				}
			} catch (e) {
				Logger.error('Failed to restore query from URL', e);
			}
		}
	});

	const restoreQuery = (item: HistoryItem) => {
		valueModifiedManually = item.query;
		if (item.variables) {
			variablesString = JSON.stringify(item.variables, null, 2);
			showVariables = true;
		} else {
			variablesString = '{}';
		}
		showHistory = false;
	};

	const handleCompare = (item: HistoryItem) => {
		diffOriginal = item.query;
		showDiffViewer = true;
		Logger.info('Opening diff viewer for history item', { id: item.id });
	};

	/**
	 * Executes the current query using the URQL client.
	 */
	const handleExecuteQuery = async () => {
		if (!mainWraperCtx?.urqlCoreClient) {
			toast.error('GraphQL Client not available');
			return;
		}

		const client = get(mainWraperCtx.urqlCoreClient) as UrqlClient | null;
		if (!client) {
			toast.error('GraphQL Client not initialized');
			return;
		}

		let variables = {};
		try {
			variables = JSON.parse(variablesString || '{}');
		} catch (e) {
			toast.error('Invalid Variables JSON');
			Logger.warn('Invalid Variables JSON on execute', e);
			// We can choose to return here or proceed with empty variables.
			// Usually invalid JSON means user error, so we should stop.
			return;
		}

		// Save to history
		try {
			const info = get(mainWraperCtx.endpointInfo);
			addToHistory({
				query: value,
				variables: variables,
				endpointId: info.id || 'unknown',
				operationName: qmsWraperCtx?.QMSName || 'Query',
				rowsCount: undefined // will update if successful?
			});
		} catch (e) {
			Logger.error('Failed to save to history', e);
		}

		isExecuting = true;
		showExecutionResult = true;
		executionResult = 'Loading...';
		executionPayload = null;
		executionTime = 0;
		responseSize = 0;
		const startTime = performance.now();

		try {
			// Determine if it's a mutation or query
			const isMutation = value.trim().startsWith('mutation');

			let result;

			Logger.info(`Executing ${isMutation ? 'mutation' : 'query'}...`, { variables });

			if (isMutation) {
				result = await client.mutation(value, variables).toPromise();
			} else {
				result = await client.query(value, variables).toPromise();
			}

			const endTime = performance.now();
			executionTime = Math.round(endTime - startTime);

			if (result.error) {
				Logger.error('Execution failed', result.error);
				executionResult = JSON.stringify(result.error, null, 2);
				executionPayload = null;
				toast.error('Query execution failed');
				responseSize = 0;
			} else {
				Logger.info('Execution successful', { executionTime });
				executionResult = JSON.stringify(result.data, null, 2);
				executionPayload = result.data;
				responseSize = calculateResponseSize(result.data);
				toast.success(`Query executed in ${executionTime}ms`);
			}
		} catch (e) {
			Logger.error('Execution error', e);
			executionResult = JSON.stringify({ error: (e as Error).message }, null, 2);
			executionPayload = null;
			toast.error('An error occurred during execution');
		} finally {
			isExecuting = false;
		}
	};

	const handleDownloadExecutionJSON = () => {
		if (!executionPayload) {
			toast.warning('No execution data to download');
			Logger.warn('Execution download JSON failed: No payload');
			return;
		}

		const filename = `${qmsWraperCtx?.QMSName || 'query'}-result.json`;
		downloadJSONValue(executionPayload, filename);
		Logger.info('Downloaded execution result JSON', { filename });
	};

	const handleDownloadExecutionCSV = () => {
		if (!exportRowsInfo) {
			toast.warning('No tabular data found for CSV export');
			Logger.warn('Execution download CSV failed: No exportable rows');
			return;
		}

		if (exportRowsInfo.rows.length === 0) {
			toast.warning('No rows available for CSV export');
			Logger.warn('Execution download CSV failed: Empty rows', {
				path: exportRowsInfo.path
			});
			return;
		}

		const filename = `${qmsWraperCtx?.QMSName || 'query'}-result.csv`;
		downloadCSV(exportRowsInfo.rows, filename);
		Logger.info('Downloaded execution result CSV', {
			filename,
			rowCount: exportRowsInfo.rows.length,
			path: exportRowsInfo.path
		});
	};

	/**
	 * Copies the exportable CSV to the clipboard for quick pasting.
	 * Useful for small datasets when a download is not desired.
	 */
	const handleCopyExecutionCSV = async () => {
		if (!exportRowsInfo) {
			toast.warning('No tabular data found for CSV copy');
			Logger.warn('Execution copy CSV failed: No exportable rows');
			return;
		}

		if (exportRowsInfo.rows.length === 0) {
			toast.warning('No rows available for CSV copy');
			Logger.warn('Execution copy CSV failed: Empty rows', {
				path: exportRowsInfo.path
			});
			return;
		}

		if (!navigator?.clipboard?.writeText) {
			toast.error('Clipboard access is not available');
			Logger.error('Execution copy CSV failed: Clipboard unavailable');
			return;
		}

		try {
			const csv = convertArrayToCSV(exportRowsInfo.rows);
			await navigator.clipboard.writeText(csv);
			isCsvCopied = true;
			setTimeout(() => (isCsvCopied = false), 2000);
			Logger.info('Copied execution result CSV to clipboard', {
				rowCount: exportRowsInfo.rows.length,
				path: exportRowsInfo.path
			});
			toast.success('CSV copied to clipboard');
		} catch (e) {
			Logger.error('Execution copy CSV failed', e);
			toast.error('Failed to copy CSV');
		}
	};

	/**
	 * Copies the execution result as a Markdown code block.
	 * Helps sharing results in docs or issues with proper formatting.
	 */
	const handleCopyExecutionMarkdown = async () => {
		if (!executionResult) {
			toast.warning('No execution result to copy');
			Logger.warn('Execution copy Markdown failed: No result');
			return;
		}

		if (!navigator?.clipboard?.writeText) {
			toast.error('Clipboard access is not available');
			Logger.error('Execution copy Markdown failed: Clipboard unavailable');
			return;
		}

		try {
			const markdown = `\`\`\`json\n${executionResult}\n\`\`\``;
			await navigator.clipboard.writeText(markdown);
			isResultMarkdownCopied = true;
			setTimeout(() => (isResultMarkdownCopied = false), 2000);
			Logger.info('Copied execution result as Markdown');
			toast.success('Result copied as Markdown');
		} catch (e) {
			Logger.error('Execution copy Markdown failed', e);
			toast.error('Failed to copy result as Markdown');
		}
	};

	/**
	 * Downloads the execution result as a Markdown file for easy sharing.
	 */
	const handleDownloadExecutionMarkdown = () => {
		if (!executionResult || executionResult === 'Loading...') {
			toast.warning('No execution result to download');
			Logger.warn('Execution download Markdown failed: No result');
			return;
		}

		const filename = `${qmsWraperCtx?.QMSName || 'query'}-result.md`;
		const markdown = `\`\`\`json\n${executionResult}\n\`\`\``;
		downloadTextFile(markdown, filename, 'text/markdown;charset=utf-8;');
		Logger.info('Downloaded execution result Markdown', { filename });
		toast.success('Result downloaded as Markdown');
	};

	/**
	 * Downloads the execution result as a plain text file for quick sharing.
	 */
	const handleDownloadExecutionText = () => {
		if (!executionResult || executionResult === 'Loading...') {
			toast.warning('No execution result to download');
			Logger.warn('Execution download text failed: No result');
			return;
		}

		const filename = `${qmsWraperCtx?.QMSName || 'query'}-result.txt`;
		downloadTextFile(executionResult, filename);
		Logger.info('Downloaded execution result text', { filename });
		toast.success('Result downloaded as text');
	};

	/**
	 * Downloads exportable rows as JSONL for easy streaming ingestion.
	 */
	const handleDownloadExecutionJsonl = () => {
		if (!exportRowsInfo) {
			toast.warning('No tabular data found for JSONL export');
			Logger.warn('Execution download JSONL failed: No exportable rows');
			return;
		}

		if (exportRowsInfo.rows.length === 0) {
			toast.warning('No rows available for JSONL export');
			Logger.warn('Execution download JSONL failed: Empty rows', {
				path: exportRowsInfo.path
			});
			return;
		}

		const filename = `${qmsWraperCtx?.QMSName || 'query'}-result.jsonl`;
		const jsonl = exportRowsInfo.rows.map((row) => JSON.stringify(row)).join('\n');
		downloadTextFile(jsonl, filename, 'application/x-ndjson;charset=utf-8;');
		Logger.info('Downloaded execution result JSONL', {
			filename,
			rowCount: exportRowsInfo.rows.length,
			path: exportRowsInfo.path
		});
		toast.success('Result downloaded as JSONL');
	};

	const handleGenerateMockData = () => {
		if (!mainWraperCtx?.schemaData) {
			Logger.warn('Cannot generate mock data: schemaData not available');
			return;
		}
		try {
			Logger.info('Generating mock data...');
			const result = generateMockData(value, mainWraperCtx.schemaData);
			mockDataResult = JSON.stringify(result, null, 2);
			showMockData = true;
		} catch (e) {
			Logger.error('Error generating mock data', e);
			mockDataResult = JSON.stringify({ error: (e as Error).message }, null, 2);
			showMockData = true;
		}
	};

	const handleImportCurl = () => {
		if (!importCurlValue.trim()) return;

		try {
			Logger.info('Importing cURL command...');
			const parsed = parseCurlCommand(importCurlValue);

			if (parsed.query) {
				valueModifiedManually = parsed.query;
				if (parsed.variables && Object.keys(parsed.variables).length > 0) {
					variablesString = JSON.stringify(parsed.variables, null, 2);
					showVariables = true;
				}

				// Handle headers
				let headerMessage = '';
				if (Object.keys(parsed.headers).length > 0 && mainWraperCtx?.endpointInfo) {
					const info = get(mainWraperCtx.endpointInfo);
					const storageKey = info.id ? `headers_${info.id}` : 'headers';

					// Merge with existing headers
					let existingHeaders = {};
					const stored = localStorage.getItem(storageKey);
					if (stored) {
						try {
							existingHeaders = JSON.parse(stored);
						} catch (e) {
							Logger.warn('Failed to parse stored headers during cURL import', e);
						}
					}

					const newHeaders = { ...existingHeaders, ...parsed.headers };
					localStorage.setItem(storageKey, JSON.stringify(newHeaders));
					Logger.info('Updated headers from cURL import', { headers: parsed.headers });
					headerMessage = '\nHeaders have been updated.';
				}

				Logger.info('Query imported from cURL');
				toast.success(`Query imported successfully.${headerMessage}`);
				showImportModal = false;
				importCurlValue = '';
			} else {
				toast.error('No valid GraphQL query found in the cURL command.');
			}
		} catch (e) {
			Logger.error('Failed to import cURL', e);
			toast.error('Failed to parse cURL command.');
		}
	};

	const syncQueryToUI = (ast) => {
		try {
			if (!qmsWraperCtx || !mainWraperCtx) {
				Logger.warn('GraphqlCodeDisplay: Cannot sync to UI - context not available');
				return;
			}

			const { activeArgumentsDataGrouped_Store, tableColsData_Store, paginationState, QMSName } =
				qmsWraperCtx;

			const { endpointInfo, schemaData } = mainWraperCtx;

			// Get the current QMS info
			const qmsInfo = schemaData.get_QMS_Field(QMSName, 'query', schemaData);

			if (!qmsInfo) {
				Logger.warn('GraphqlCodeDisplay: QMS info not found');
				return;
			}

			Logger.debug('GraphqlCodeDisplay: Syncing query to UI', { ast, qmsInfo });

			// Update stores from AST
			updateStoresFromAST(
				ast,
				qmsInfo,
				schemaData,
				endpointInfo,
				activeArgumentsDataGrouped_Store,
				tableColsData_Store,
				paginationState
			);
		} catch (e) {
			Logger.error('GraphqlCodeDisplay: Error syncing query to UI:', e);
		}
	};
	///
	$effect(() => {
		ast = parse(value);
	});
	$effect(() => {
		if (valueModifiedManually && valueModifiedManually !== lastSyncedValue) {
			try {
				ast = parse(valueModifiedManually as string);

				// Sync to UI if enabled and context is available
				if (enableSyncToUI && qmsWraperCtx && mainWraperCtx) {
					syncQueryToUI(ast);
					lastSyncedValue = valueModifiedManually;
				}
			} catch (e) {
				Logger.error('Error parsing manually modified query:', e);
			}
		}
	});
	$effect(() => {
		if (ast) {
			astPrinted = print(ast as ASTNode);
		}
	});

	$effect(() => {
		// Calculate complexity when query changes
		if (value) {
			queryComplexity = calculateComplexity(value);
		}
	});
	$effect(() => {
		if (getPreciseType(ast) == 'object') {
			astAsString = JSON5.stringify(ast);
		}
	});
</script>

<div class="mockup-code bg-base text-content my-1 mx-2 px-2 relative group">
	<div class="absolute top-3 right-40 flex space-x-2 items-center">
		<div
			class="badge badge-sm badge-ghost gap-1 mr-2 hidden xl:inline-flex cursor-help"
			title="Query Complexity: Depth / Fields"
		>
			<i class="bi bi-diagram-2"></i>
			{queryComplexity.depth}/{queryComplexity.fieldCount}
		</div>
		<button
			class="btn btn-xs btn-ghost text-primary font-bold transition-opacity"
			aria-label="Execute Query"
			title="Execute Query"
			onclick={handleExecuteQuery}
			disabled={isExecuting}
		>
			{#if isExecuting}
				<span class="loading loading-spinner loading-xs"></span> Running...
			{:else}
				<i class="bi bi-play-fill"></i> Execute
			{/if}
		</button>
		<button
			class="btn btn-xs btn-ghost transition-opacity"
			aria-label="History"
			title="View Query History"
			onclick={() => (showHistory = true)}
		>
			<i class="bi bi-clock-history"></i> History
		</button>
		<button
			class="btn btn-xs btn-ghost transition-opacity {showVariables
				? 'text-primary font-bold'
				: ''}"
			aria-label="Variables"
			title="Toggle Variables Editor"
			onclick={() => (showVariables = !showVariables)}
		>
			<i class="bi bi-braces"></i> Variables
		</button>
		<button
			class="btn btn-xs btn-ghost transition-opacity"
			aria-label="Extract Variables"
			title="Extract Variables from Query"
			onclick={handleExtractVariables}
		>
			<i class="bi bi-file-earmark-code"></i> Extract Vars
		</button>
		<button
			class="btn btn-xs btn-ghost transition-opacity"
			aria-label="Prettify Query"
			title="Format Query (Prettify)"
			onclick={handlePrettify}
		>
			<i class="bi bi-magic"></i> Prettify
		</button>
		<button
			class="btn btn-xs btn-ghost transition-opacity"
			aria-label="Minify Query"
			title="Minify Query (Remove Whitespace)"
			onclick={handleMinify}
		>
			<i class="bi bi-arrows-collapse"></i> Minify
		</button>
		<button
			class="btn btn-xs btn-ghost transition-opacity"
			aria-label="Copy to Clipboard"
			title="Copy Query to Clipboard"
			onclick={() => {
				Logger.info('Copied query to clipboard');
				navigator.clipboard.writeText(value);
				isCopied = true;
				toast.success('Query copied to clipboard');
				setTimeout(() => (isCopied = false), 2000);
			}}
		>
			{#if isCopied}
				<i class="bi bi-check"></i> Copied!
			{:else}
				<i class="bi bi-clipboard"></i> Copy
			{/if}
		</button>
		<button
			class="btn btn-xs btn-ghost transition-opacity"
			aria-label="Copy as cURL"
			title="Copy as cURL Command"
			onclick={() => {
				if (mainWraperCtx?.endpointInfo) {
					Logger.info('Copied query as cURL to clipboard');
					const info = get(mainWraperCtx.endpointInfo);
					let headers = info.headers || {};
					const env = getActiveEnvironment();
					if (Object.keys(env.variables).length > 0) {
						const substituted: Record<string, string> = {};
						for (const [k, v] of Object.entries(headers)) {
							substituted[k] = substituteVariables(v, env.variables);
						}
						headers = substituted;
					}

					const curl = generateCurlCommand(info.url, value, getParsedVariables(), headers);
					navigator.clipboard.writeText(curl);
					isCurlCopied = true;
					setTimeout(() => (isCurlCopied = false), 2000);
				}
			}}
		>
			{#if isCurlCopied}
				<i class="bi bi-check"></i> cURL Copied!
			{:else}
				<i class="bi bi-terminal"></i> Copy as cURL
			{/if}
		</button>
		<button
			class="btn btn-xs btn-ghost transition-opacity"
			aria-label="Import cURL"
			title="Import Query from cURL Command"
			onclick={() => (showImportModal = true)}
		>
			<i class="bi bi-box-arrow-in-down"></i> Import cURL
		</button>
		<button
			class="btn btn-xs btn-ghost transition-opacity"
			aria-label="Generate Mock Data"
			title="Generate Mock Response Data"
			onclick={handleGenerateMockData}
		>
			<i class="bi bi-code-slash"></i> Mock Data
		</button>
		<button
			class="btn btn-xs btn-ghost transition-opacity"
			aria-label="Code Snippets"
			title="Generate Code Snippets"
			onclick={() => {
				showSnippetsModal = true;
				Logger.info('Opened code snippets modal');
			}}
		>
			<i class="bi bi-code-square"></i> Snippets
		</button>
		<button
			class="btn btn-xs btn-ghost transition-opacity"
			aria-label="Export to Postman"
			title="Export as Postman Collection"
			onclick={() => {
				if (mainWraperCtx?.endpointInfo) {
					Logger.info('Exporting to Postman');
					const info = get(mainWraperCtx.endpointInfo);
					let headers = info.headers || {};
					const env = getActiveEnvironment();
					if (Object.keys(env.variables).length > 0) {
						const substituted: Record<string, string> = {};
						for (const [k, v] of Object.entries(headers)) {
							substituted[k] = substituteVariables(v, env.variables);
						}
						headers = substituted;
					}

					const json = generatePostmanCollectionForQuery(
						qmsWraperCtx?.QMSName || 'Query',
						info.url,
						value,
						headers,
						getParsedVariables()
					);
					const blob = new Blob([json], { type: 'application/json' });
					const url = URL.createObjectURL(blob);
					const a = document.createElement('a');
					a.href = url;
					a.download = `${qmsWraperCtx?.QMSName || 'query'}.postman_collection.json`;
					document.body.appendChild(a);
					a.click();
					document.body.removeChild(a);
					URL.revokeObjectURL(url);
				}
			}}
		>
			<i class="bi bi-collection"></i> Postman
		</button>
		<button
			class="btn btn-xs btn-ghost transition-opacity"
			aria-label="Copy as Markdown"
			title="Copy Query as Markdown"
			onclick={() => {
				Logger.info('Copied query as Markdown to clipboard');
				const markdown = `\`\`\`graphql\n${value}\n\`\`\``;
				navigator.clipboard.writeText(markdown);
				isMarkdownCopied = true;
				setTimeout(() => (isMarkdownCopied = false), 2000);
			}}
		>
			{#if isMarkdownCopied}
				<i class="bi bi-check"></i> Copied MD!
			{:else}
				<i class="bi bi-markdown"></i> Copy MD
			{/if}
		</button>
		<button
			class="btn btn-xs btn-ghost transition-opacity"
			aria-label="Share URL"
			title="Share Query via URL"
			onclick={handleShare}
		>
			{#if isShareCopied}
				<i class="bi bi-check"></i> Copied Link!
			{:else}
				<i class="bi bi-share"></i> Share
			{/if}
		</button>
	</div>
	<div class="max-h-[50vh] overflow-y-auto">
		{#if showExecutionResult}
			<div class="p-2">
				<div class="flex flex-wrap justify-between items-center mb-2 gap-2">
					<div class="flex items-center gap-2">
						<h3 class="font-bold text-success">
							<i class="bi bi-play-circle"></i> Execution Result
						</h3>
						{#if executionTime > 0}
							<div class="badge badge-secondary badge-outline gap-1" title="Execution Time">
								<i class="bi bi-stopwatch"></i>
								{executionTime}ms
							</div>
						{/if}
						{#if responseSize > 0}
							<div class="badge badge-info badge-outline gap-1" title="Response Size">
								<i class="bi bi-hdd-network"></i>
								{formatBytes(responseSize)}
							</div>
						{/if}
						{#if exportRowsInfo}
							<div
								class="badge badge-outline gap-1"
								title={`Export source: ${exportRowsInfo.path}`}
							>
								<i class="bi bi-table"></i>
								{exportRowsInfo.rows.length} rows
							</div>
						{/if}
					</div>
					<div class="flex gap-2">
						<button
							class="btn btn-xs btn-ghost"
							onclick={() => {
								navigator.clipboard.writeText(executionResult);
								toast.success('Result copied to clipboard');
							}}
						>
							<i class="bi bi-clipboard"></i> Copy
						</button>
						<button
							class="btn btn-xs btn-ghost"
							disabled={!executionPayload}
							title={executionPayload ? 'Download result as JSON' : 'No execution data to download'}
							onclick={handleDownloadExecutionJSON}
						>
							<i class="bi bi-filetype-json"></i> Download JSON
						</button>
						<button
							class="btn btn-xs btn-ghost"
							disabled={!hasExportRows}
							title={hasExportRows
								? `Download CSV from ${exportRowsInfo?.path}`
								: 'No tabular data found for CSV export'}
							onclick={handleDownloadExecutionCSV}
						>
							<i class="bi bi-filetype-csv"></i> Download CSV
						</button>
						<button
							class="btn btn-xs btn-ghost"
							disabled={!hasExportRows}
							title={hasExportRows
								? `Copy CSV from ${exportRowsInfo?.path}`
								: 'No tabular data found for CSV copy'}
							onclick={handleCopyExecutionCSV}
						>
							{#if isCsvCopied}
								<i class="bi bi-check"></i> Copied CSV!
							{:else}
								<i class="bi bi-clipboard-plus"></i> Copy CSV
							{/if}
						</button>
						<button
							class="btn btn-xs btn-ghost"
							disabled={!executionResult || executionResult === 'Loading...'}
							title="Copy result as Markdown"
							onclick={handleCopyExecutionMarkdown}
						>
							{#if isResultMarkdownCopied}
								<i class="bi bi-check"></i> Copied MD!
							{:else}
								<i class="bi bi-markdown"></i> Copy Result MD
							{/if}
						</button>
						<button
							class="btn btn-xs btn-ghost"
							disabled={!executionResult || executionResult === 'Loading...'}
							title="Download result as Markdown"
							onclick={handleDownloadExecutionMarkdown}
						>
							<i class="bi bi-filetype-md"></i> Download Result MD
						</button>
						<button
							class="btn btn-xs btn-ghost"
							disabled={!executionResult || executionResult === 'Loading...'}
							title="Download result as text"
							onclick={handleDownloadExecutionText}
						>
							<i class="bi bi-filetype-txt"></i> Download Result TXT
						</button>
						<button
							class="btn btn-xs btn-ghost"
							disabled={!hasExportRows}
							title={hasExportRows
								? `Download JSONL from ${exportRowsInfo?.path}`
								: 'No tabular data found for JSONL export'}
							onclick={handleDownloadExecutionJsonl}
						>
							<i class="bi bi-filetype-json"></i> Download JSONL
						</button>
						<button class="btn btn-xs btn-ghost" onclick={() => (showExecutionResult = false)}
							>✕ Close</button
						>
					</div>
				</div>
				<CodeEditor rawValue={executionResult} language="json" readOnly={true} />
			</div>
		{:else if showMockData}
			<div class="p-2">
				<div class="flex justify-between items-center mb-2">
					<h3 class="font-bold">Mock Data Result</h3>
					<button class="btn btn-xs btn-ghost" onclick={() => (showMockData = false)}
						>✕ Close</button
					>
				</div>
				<CodeEditor rawValue={mockDataResult} language="json" readOnly={true} />
			</div>
		{:else if showNonPrettifiedQMSBody}
			<code class="px-10">{value}</code>
			<div class="mt-4">
				<code class="px-10">{astAsString}</code>
			</div>
		{:else}
			<code class="language-graphql">{value}</code>
			<div class="mx-4 mt-2">
				<CodeEditor
					bind:this={codeEditorInstance}
					rawValue={value}
					language="graphql"
					onChanged={(detail) => {
						valueModifiedManually = detail.chd_rawValue;
						value = detail.chd_rawValue;
					}}
				/>
			</div>
			{#if showVariables}
				<div class="border-t border-base-200 mt-2 pt-2 mx-4">
					<div class="flex justify-between items-center mb-1">
						<span class="text-xs font-bold text-gray-500 uppercase">Query Variables (JSON)</span>
						<button
							class="btn btn-xs btn-ghost text-xs"
							onclick={() => {
								try {
									const parsed = JSON.parse(variablesString || '{}');
									variablesString = JSON.stringify(parsed, null, 2);
								} catch (e) {
									toast.error('Invalid JSON');
								}
							}}
						>
							Prettify
						</button>
					</div>
					<CodeEditor
						rawValue={variablesString}
						language="json"
						onChanged={(detail) => {
							variablesString = detail.chd_rawValue;
						}}
					/>
				</div>
			{/if}
			{#if astPrinted}
				<div class="mx-4 mt-2">
					<!-- <CodeEditor rawValue={astPrinted as string} language="graphql" /> -->
				</div>
			{/if}
		{/if}
	</div>
	<button
		class="btn btn-xs btn-accent mx-atuo absolute top-3 right-4 normal-case"
		onclick={() => {
			showNonPrettifiedQMSBody = !showNonPrettifiedQMSBody;
		}}
	>
		{showNonPrettifiedQMSBody ? ' show prettified ' : ' show non-prettified '}</button
	>
</div>

{#if showHistory}
	<QueryHistory
		onRestore={restoreQuery}
		onClose={() => (showHistory = false)}
		onCompare={handleCompare}
	/>
{/if}

{#if showDiffViewer}
	<DiffViewer original={diffOriginal} modified={value} onClose={() => (showDiffViewer = false)} />
{/if}

{#if showImportModal}
	<Modal
		modalIdetifier="import-curl-modal"
		onCancel={() => (showImportModal = false)}
		onApply={handleImportCurl}
	>
		<div class="p-4">
			<h3 class="text-lg font-bold mb-2">Import cURL</h3>
			<p class="mb-4 text-sm text-gray-500">
				Paste a cURL command below to import the GraphQL query and headers.
			</p>
			<textarea
				class="textarea textarea-bordered w-full h-64 font-mono text-sm"
				placeholder="curl 'https://...'"
				bind:value={importCurlValue}
			></textarea>
		</div>
	</Modal>
{/if}

{#if showSnippetsModal}
	<Modal
		modalIdetifier="code-snippets-modal"
		showApplyBtn={false}
		onCancel={() => (showSnippetsModal = false)}
	>
		<div class="p-4">
			<h3 class="text-lg font-bold mb-4">Generate Code Snippets</h3>

			<div class="form-control w-full max-w-xs mb-4">
				<label class="label" for="snippet-language-select">
					<span class="label-text">Select Language/Client</span>
				</label>
				<select
					id="snippet-language-select"
					class="select select-bordered"
					bind:value={selectedSnippetLanguage}
				>
					{#each SUPPORTED_LANGUAGES as lang}
						<option value={lang.value}>{lang.label}</option>
					{/each}
				</select>
			</div>

			<div class="relative">
				<CodeEditor rawValue={generatedSnippet} language={snippetEditorLanguage} readOnly={true} />
				<button
					class="btn btn-xs btn-outline absolute top-2 right-2"
					onclick={() => {
						navigator.clipboard.writeText(generatedSnippet);
						toast.success('Snippet copied to clipboard');
						Logger.info('Copied code snippet', { language: selectedSnippetLanguage });
					}}
				>
					<i class="bi bi-clipboard"></i> Copy
				</button>
			</div>
		</div>
	</Modal>
{/if}
