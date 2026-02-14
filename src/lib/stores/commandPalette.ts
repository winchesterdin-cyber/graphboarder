import { writable } from 'svelte/store';
import { Logger } from '$lib/utils/logger';
import Fuse from 'fuse.js';

export interface Command {
	id: string;
	title: string;
	category?: string;
	description?: string;
	icon?: string;
	action: () => void;
	shortcut?: string;
}

const RECENCY_SCORE_BOOST = 0.1;

/**
 * Ranks commands by fuzzy match score and recency of usage.
 */
export const rankCommands = (
	commands: Command[],
	searchQuery: string,
	usageTimestamps: Record<string, number>
): Command[] => {
	if (!searchQuery.trim()) {
		return [...commands].sort(
			(a, b) => (usageTimestamps[b.id] || 0) - (usageTimestamps[a.id] || 0)
		);
	}

	const fuse = new Fuse(commands, {
		keys: ['title', 'category', 'description'],
		threshold: 0.4,
		includeScore: true
	});

	return fuse
		.search(searchQuery)
		.sort((left, right) => {
			const leftScore =
				(left.score ?? 1) - (usageTimestamps[left.item.id] ? RECENCY_SCORE_BOOST : 0);
			const rightScore =
				(right.score ?? 1) - (usageTimestamps[right.item.id] ? RECENCY_SCORE_BOOST : 0);
			if (leftScore === rightScore) {
				return (usageTimestamps[right.item.id] || 0) - (usageTimestamps[left.item.id] || 0);
			}
			return leftScore - rightScore;
		})
		.map((result) => result.item);
};

function createCommandPaletteStore() {
	const { subscribe, set, update } = writable({
		isOpen: false,
		searchQuery: ''
	});

	const commands = writable<Command[]>([]);
	const usageTimestamps = writable<Record<string, number>>({});

	return {
		subscribe,
		set,
		update,
		toggle: () => {
			update((state) => {
				const newState = !state.isOpen;
				Logger.debug(`Command Palette toggled: ${newState}`);
				return { ...state, isOpen: newState, searchQuery: '' };
			});
		},
		open: () => {
			update((state) => ({ ...state, isOpen: true, searchQuery: '' }));
			Logger.debug('Command Palette opened');
		},
		close: () => {
			update((state) => ({ ...state, isOpen: false }));
			Logger.debug('Command Palette closed');
		},
		setSearchQuery: (query: string) => {
			update((state) => ({ ...state, searchQuery: query }));
		},
		registerCommand: (command: Command) => {
			commands.update((cmds) => {
				if (cmds.some((c) => c.id === command.id)) {
					return cmds.map((c) => (c.id === command.id ? command : c));
				}
				Logger.debug(`Command registered: ${command.id}`);
				return [...cmds, command];
			});
		},
		unregisterCommand: (id: string) => {
			commands.update((cmds) => {
				const exists = cmds.some((c) => c.id === id);
				if (exists) {
					Logger.debug(`Command unregistered: ${id}`);
				}
				return cmds.filter((c) => c.id !== id);
			});
			usageTimestamps.update((usage) => {
				const { [id]: _deleted, ...rest } = usage;
				return rest;
			});
		},
		markUsed: (id: string) => {
			Logger.debug('Command marked as recently used.', { id });
			usageTimestamps.update((usage) => ({ ...usage, [id]: Date.now() }));
		},
		getRankedCommands: (searchQuery: string): Command[] => {
			let currentCommands: Command[] = [];
			let currentUsage: Record<string, number> = {};
			commands.subscribe((value) => (currentCommands = value))();
			usageTimestamps.subscribe((value) => (currentUsage = value))();
			return rankCommands(currentCommands, searchQuery, currentUsage);
		},
		commands: { subscribe: commands.subscribe }
	};
}

export const commandPaletteStore = createCommandPaletteStore();
