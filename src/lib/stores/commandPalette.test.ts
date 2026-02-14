import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { commandPaletteStore, rankCommands, type Command } from './commandPalette';

describe('Command Palette Store', () => {
	beforeEach(() => {
		commandPaletteStore.close();
	});

	it('should toggle visibility', () => {
		commandPaletteStore.toggle();
		expect(get(commandPaletteStore).isOpen).toBe(true);
		commandPaletteStore.toggle();
		expect(get(commandPaletteStore).isOpen).toBe(false);
	});

	it('should open and close', () => {
		commandPaletteStore.open();
		expect(get(commandPaletteStore).isOpen).toBe(true);
		commandPaletteStore.close();
		expect(get(commandPaletteStore).isOpen).toBe(false);
	});

	it('should set search query', () => {
		commandPaletteStore.setSearchQuery('test');
		expect(get(commandPaletteStore).searchQuery).toBe('test');
	});

	it('should register and unregister commands', () => {
		const cmd = { id: 'test-cmd', title: 'Test', action: () => {} };
		commandPaletteStore.registerCommand(cmd);
		let commands: any[] = [];
		commandPaletteStore.commands.subscribe((c) => (commands = c))();
		expect(commands.some((c) => c.id === 'test-cmd')).toBe(true);
		commandPaletteStore.unregisterCommand('test-cmd');
		commandPaletteStore.commands.subscribe((c) => (commands = c))();
		expect(commands.some((c) => c.id === 'test-cmd')).toBe(false);
	});
});

describe('rankCommands', () => {
	const commands: Command[] = [
		{
			id: 'open-endpoint',
			title: 'Open Endpoint',
			description: 'Open an endpoint',
			action: () => {}
		},
		{ id: 'open-explorer', title: 'Open Explorer', description: 'Open explorer', action: () => {} },
		{
			id: 'toggle-theme',
			title: 'Toggle Theme',
			description: 'Change visual theme',
			action: () => {}
		}
	];

	it('prefers recently used commands when search query is empty', () => {
		const ranked = rankCommands(commands, '', { 'open-explorer': 2000, 'open-endpoint': 1000 });
		expect(ranked[0].id).toBe('open-explorer');
		expect(ranked[1].id).toBe('open-endpoint');
	});

	it('includes recency weighting in search ranking', () => {
		const ranked = rankCommands(commands, 'open', { 'open-endpoint': 1500 });
		expect(ranked[0].id).toBe('open-endpoint');
	});
});
