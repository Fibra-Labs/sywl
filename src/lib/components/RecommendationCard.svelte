<script lang="ts">
	import { enhance } from '$app/forms';
	import Spinner from '$lib/components/Spinner.svelte';
	import { invalidateAll } from '$app/navigation';

	let {
		track,
		explanation
	}: { track: SpotifyApi.TrackObjectFull; explanation: string | null } = $props();

	let isLiking = $state(false);
	let isDisliking = $state(false);
	let reason = $state('');
</script>

<div class="flex items-start space-x-4 py-4">
	<div class="flex-shrink-0 w-20 text-center">
		{#if track.album.images.length > 0}
			<img src={track.album.images[0].url} alt={track.album.name} class="w-20 h-20 rounded-md" />
		{/if}
		{#if track.external_urls.spotify}
			<a
				href={track.external_urls.spotify}
				target="_blank"
				rel="noopener noreferrer"
				class="mt-2 inline-block text-xs bg-gray-700 hover:bg-gray-600 text-white font-semibold py-1 px-2 rounded"
			>
				Play on Spotify
			</a>
		{/if}
	</div>
	<div class="flex-grow min-w-0">
		<div class="flex justify-between items-start">
			<div class="flex-grow truncate pr-2">
				<p class="font-bold truncate">{track.name}</p>
				<p class="text-sm text-gray-400 truncate">{track.artists.map((a) => a.name).join(', ')}</p>
			</div>
		</div>

		{#if explanation}
			<div class="mt-2 p-2 bg-gray-800/50 rounded-md">
				<p class="text-xs italic text-gray-400">{explanation}</p>
			</div>
		{/if}

		<div class="mt-2">
			<textarea
				bind:value={reason}
				class="w-full p-2 border rounded bg-gray-800 border-gray-700 text-sm"
				placeholder="What did you think of this song?"
				rows="2"
			></textarea>
			<div class="flex items-center gap-2 mt-2">
				<form method="POST" action="?/likeSong" use:enhance={({ formData }) => { formData.set('reason', reason); isLiking = true; return async ({ result }) => { if (result.type === 'success') { await invalidateAll(); } isLiking = false; }; }}>
					<input type="hidden" name="song" value={JSON.stringify(track)} />
					<button
						type="submit"
						class="inline-flex items-center justify-center px-3 py-1 border border-transparent text-xs font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 disabled:opacity-50"
						disabled={isLiking || isDisliking}
					>
						{#if isLiking}
							<Spinner />
						{:else}
							Like
						{/if}
					</button>
				</form>
				<form method="POST" action="?/dislikeSong" use:enhance={() => { isDisliking = true; return async ({ result }) => { if (result.type === 'success') { await invalidateAll(); } isDisliking = false; }; }}>
					<input type="hidden" name="reason" bind:value={reason} />
					<input type="hidden" name="song" value={JSON.stringify(track)} />
					<button
						type="submit"
						class="inline-flex items-center justify-center px-3 py-1 border border-transparent text-xs font-medium rounded-md shadow-sm text-white bg-red-600 hover:bg-red-700 disabled:opacity-50"
						disabled={isLiking || isDisliking}
					>
						{#if isDisliking}
							<Spinner />
						{:else}
							Dislike
						{/if}
					</button>
				</form>
			</div>
		</div>
	</div>
</div>