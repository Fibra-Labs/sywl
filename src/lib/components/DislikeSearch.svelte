<script lang="ts">
	import { enhance, applyAction } from '$app/forms';
	import Spinner from '$lib/components/Spinner.svelte';
	import { debounce } from '$lib/utils';

	let { onsongDisliked }: { onsongDisliked: () => void } = $props();

	let query = $state('');
	let searchResults = $state<SpotifyApi.TrackObjectFull[]>([]);
	let isSearching = $state(false);
	let selectedSong = $state<SpotifyApi.TrackObjectFull | null>(null);
	let reason = $state('');
	let isDisliking = $state(false);

	const search = debounce(async (q: string) => {
		if (q.length < 3) {
			searchResults = [];
			return;
		}
		isSearching = true;
		const formData = new FormData();
		formData.append('query', q);
		const result = await applyAction({
			form: { action: '?/search', method: 'POST', request: { formData: () => formData } }
		});
		if (result.type === 'success' && result.data?.searchResults) {
			searchResults = result.data.searchResults;
		}
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
		placeholder="Search for a song to dislike..."
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
	{#if searchResults.length > 0}
		<div class="absolute z-10 w-full mt-1 bg-gray-800 border border-gray-700 rounded-md shadow-lg">
			{#each searchResults as track (track.id)}
				<button type="button" class="w-full text-left p-2 hover:bg-gray-700" on:click={() => { selectedSong = track; searchResults = []; query = track.name; isSearching = false; }}>
					<p class="font-bold truncate">{track.name}</p>
					<p class="text-sm text-gray-400 truncate">{track.artists.map((a) => a.name).join(', ')}</p>
				</button>
			{/each}
		</div>
	{/if}
</div>

{#if selectedSong}
	<form method="POST" action="?/dislikeSong" use:enhance={() => { isDisliking = true; return async ({ result }) => { if (result.type === 'success') { onsongDisliked(); selectedSong = null; query = ''; } isDisliking = false; }; }}>
		<input type="hidden" name="song" value={JSON.stringify(selectedSong)} />
		<input type="hidden" name="reason" value="" />
		<button type="submit" class="mt-2 w-full bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded disabled:opacity-50" disabled={isDisliking}>Dislike "{selectedSong.name}"</button>
	</form>
{/if}