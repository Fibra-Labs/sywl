<script lang="ts">
	import { debounce } from '$lib/utils';

	type Suggestion = { id: string; name: string; artist: string };

	let {
		placeholder,
		searchFunction,
		onSelect
	}: {
		placeholder: string;
		searchFunction: (query: string) => Promise<Suggestion[]>;
		onSelect: (suggestion: Suggestion) => void;
	} = $props();

	let query = $state('');
	let suggestions = $state<Suggestion[]>([]);
	let isSearching = $state(false);

	const search = debounce(async (q: string) => {
		if (q.length < 2) {
			suggestions = [];
			return;
		}
		isSearching = true;
		suggestions = await searchFunction(q);
		isSearching = false;
	}, 300);

	$effect(() => {
		search(query);
	});
</script>

<div class="relative">
	<input
		type="search"
		bind:value={query}
		{placeholder}
		class="w-full p-2 pl-8 border rounded bg-gray-800 border-gray-700 text-sm"
	/>
	<div class="absolute inset-y-0 left-0 flex items-center pl-2 pointer-events-none">
		<svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"
			><path
				stroke-linecap="round"
				stroke-linejoin="round"
				stroke-width="2"
				d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path
		></svg>
	</div>
	{#if suggestions.length > 0}
		<div class="absolute z-10 w-full mt-1 bg-gray-800 border border-gray-700 rounded-md shadow-lg">
			{#each suggestions as suggestion (suggestion.id)}
				<button type="button" class="w-full text-left p-2 hover:bg-gray-700" on:click={() => { onSelect(suggestion); suggestions = []; query = ''; }}>
					<p class="font-bold truncate">{suggestion.name}</p>
					<p class="text-sm text-gray-400 truncate">{suggestion.artist}</p>
				</button>
			{/each}
		</div>
	{/if}
</div>