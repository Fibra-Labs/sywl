<script lang="ts">
	import { enhance } from '$app/forms';
	import Spinner from '$lib/components/Spinner.svelte';

	let { onsongLiked }: { onsongLiked: () => void } = $props();

	let searchQuery = $state('');
	let searchResults = $state<SpotifyApi.TrackObjectFull[]>([]);
	let isSearching = $state(false);
	let isLiking = $state(false);

	$effect(() => {
		const q = searchQuery;
		let active = true;

		const timeoutId = setTimeout(async () => {
			if (q.length < 3) {
				searchResults = [];
				return;
			}

			isSearching = true;
			const formData = new FormData();
			formData.append('query', q);
			const response = await fetch('/api/search', {
				method: 'POST',
				body: formData
			});

			if (!active) return;

			if (response.ok) {
				const data = await response.json();
				searchResults = data.searchResults;
			} else {
				searchResults = [];
			}
			isSearching = false;
		}, 300);

		return () => {
			active = false;
			clearTimeout(timeoutId);
		};
	});
</script>

<div class="relative">
	<input
		type="search"
		placeholder="Search for a song to like..."
		class="w-full p-2 pl-8 border rounded bg-gray-800 border-gray-700 text-sm"
		bind:value={searchQuery}
	/>
	<div class="absolute inset-y-0 left-0 flex items-center pl-2 pointer-events-none">
		{#if isSearching}
			<Spinner class="w-4 h-4 text-gray-400" />
		{:else}
			<svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
				></path>
			</svg>
		{/if}
	</div>
	{#if searchResults.length > 0}
		<div class="absolute z-10 w-full mt-1 bg-gray-800 border border-gray-700 rounded-md shadow-lg">
			{#each searchResults as track (track.id)}
				<div class="p-2 hover:bg-gray-700 flex items-center gap-4">
					<img src={track.album.images[0]?.url} alt={track.album.name} class="w-12 h-12 rounded-sm" />
					<div class="flex-grow overflow-hidden">
						<p class="font-bold truncate">{track.name}</p>
						<p class="text-sm text-gray-400 truncate">{track.artists.map((a) => a.name).join(', ')}</p>
					</div>
					<form method="POST" action="?/likeSong" use:enhance={() => { isLiking = true; return async ({ result }) => { if (result.type === 'success') { onsongLiked(); searchQuery = ''; searchResults = []; } isLiking = false; }; }}>
						<input type="hidden" name="song" value={JSON.stringify(track)} />
						<input type="hidden" name="reason" value="" />
						<button type="submit" class="bg-green-600 hover:bg-green-700 text-white font-bold py-1 px-3 rounded text-sm disabled:opacity-50" disabled={isLiking}>Like</button>
					</form>
				</div>
			{/each}
		</div>
	{/if}
</div>