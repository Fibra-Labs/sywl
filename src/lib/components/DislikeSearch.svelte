<script lang="ts">
	import { applyAction, enhance } from '$app/forms';
	import { createEventDispatcher } from 'svelte';

	let searchQuery = $state('');
	let searchResults = $state<SpotifyApi.TrackObjectFull[]>([]);
	let hasFocus = $state(false);
	let isLoading = $state(false);

	const debounce = (fn: (...args: any[]) => void, delay: number) => {
		const dispatch = createEventDispatcher();

		let timeoutId: number;
		return (...args: any[]) => {
			clearTimeout(timeoutId);
			timeoutId = window.setTimeout(() => fn(...args), delay);
		};
	};

	const dispatch = createEventDispatcher();

	const search = async () => {
		if (searchQuery.trim().length < 2) {
			searchResults = [];
			isLoading = false;
			return;
		}
		isLoading = true;

		const formData = new FormData();
		formData.append('query', searchQuery);
		const response = await fetch('?/search', {
			method: 'POST',
			body: formData
		});
		const result = await applyAction(await response.json());
		if (result.data?.searchResults) {
			searchResults = result.data.searchResults;
		} else {
			searchResults = [];
		}
		isLoading = false;
	};

	const debouncedSearch = debounce(search, 300);
</script>

<div class="relative">
	<input
		type="search"
		bind:value={searchQuery}
		name="query"
		placeholder="Search to dislike a song..."
		oninput={debouncedSearch}
		onfocus={() => (hasFocus = true)}
		onblur={() => setTimeout(() => (hasFocus = false), 150)}
		class="w-full bg-gray-800 border-gray-700 rounded-md text-sm p-2 focus:ring-green-500 focus:border-green-500"
	/>

	{#if hasFocus && (searchResults.length > 0 || isLoading)}
		<div class="absolute z-10 w-full bg-gray-800 rounded-md shadow-lg max-h-80 overflow-y-auto">
			<div class="p-2 space-y-2">
				{#if isLoading}
					<div class="p-4 text-center text-gray-400">Searching...</div>
				{:else}
					{#each searchResults as track (track.id)}
						<div class="flex items-center gap-3 p-2 rounded-md hover:bg-gray-700">
							{#if track.album.images.length > 0}
								<img
									src={track.album.images[0].url}
									alt={`Album art for ${track.album.name}`}
									class="w-10 h-10 rounded"
								/>
							{/if}
							<div class="flex-grow">
								<p class="font-bold text-sm">{track.name}</p>
								<p class="text-xs text-gray-400">
									{track.artists.map((a) => a.name).join(', ')}
								</p>
							</div>
							<form
								method="POST"
								action="?/dislikeSong"
								use:enhance={() => {
									return async ({ result }) => {
										if (result.type === 'success') {
											dispatch('songDisliked');
											searchQuery = '';
											searchResults = [];
										}
									};
								}}
							>
								<input type="hidden" name="song" value={JSON.stringify(track)} />
								<button type="submit" class="text-sm text-red-400 hover:text-red-300 cursor-pointer">
									Dislike
								</button>
							</form>
						</div>
					{/each}
				{/if}
			</div>
		</div>
	{/if}
</div>