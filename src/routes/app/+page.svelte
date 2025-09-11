<script lang="ts">
	import { enhance, applyAction } from '$app/forms';
	import SongCard from '$lib/components/SongCard.svelte';
	import DislikeSearch from '$lib/components/DislikeSearch.svelte';
	import { invalidateAll } from '$app/navigation';
	import LikeSearch from '$lib/components/LikeSearch.svelte';
	import Reload from '$lib/components/Reload.svelte';
	import RecommendationCard from '$lib/components/RecommendationCard.svelte';
	import RecommendationSearch from '$lib/components/RecommendationSearch.svelte';

	let { data, form } = $props<{ data: App.PageData; form: any }>();

	let isResyncing = $state(false);
	let isCreatingProfile = $state(false);
	let likedSongsSearch = $state('');
	let isRecommending = $state(false);
	let recommendedTracks = $state<
		{ track: SpotifyApi.TrackObjectFull; explanation: string | null }[]
	>([]);
	let dnaVisible = $state(false);
	let soundProfile = $state(data.soundProfile);
	let musicalDna = $state(data.musicalDna);
	let recommendationMode = $state<'liked' | 'specific'>('liked');
	let specificSongs = $state<SpotifyApi.TrackObjectFull[]>([]);

	const filteredLikedSongs = $derived(
		data.likedSongs.filter(
			(song) =>
				song.name.toLowerCase().includes(likedSongsSearch.toLowerCase()) ||
				song.artist.toLowerCase().includes(likedSongsSearch.toLowerCase())
		)
	);

	$effect(() => {
		if (form?.recommendedTracks) {
			recommendedTracks = form.recommendedTracks;
		}
	});
</script>
<main class="p-8 pt-0">
	<div class="text-center mb-12">
		<h1 class="text-4xl font-bold mb-4">Shape Your Sound Profile</h1>
		<p class="text-gray-400 max-w-2xl mx-auto mb-8">
			Refine your recommendations by telling us which songs you like and dislike. The more feedback
			you provide, the better our suggestions will become.
		</p>
		<div
			class="max-w-2xl mx-auto rounded-lg bg-gradient-to-r from-red-500 via-yellow-500 to-blue-500 p-1"
		>
			<div class="bg-gray-900/95 rounded-md p-4">
				<div class="prose prose-invert max-w-none text-gray-400">
					{@html soundProfile || '<p>Your sound profile will appear here.</p>'}
				</div>
			</div>
		</div>
		{#if musicalDna}
			<div class="max-w-2xl mx-auto mt-4">
				<button onclick={() => (dnaVisible = !dnaVisible)} class="text-sm text-gray-400 hover:text-white mb-2">
					{dnaVisible ? 'Hide' : 'Show'} Musical DNA
				</button>
				{#if dnaVisible}
					<div class="p-4 rounded-lg bg-gray-900/50 border border-gray-700 text-left">
						<div class="prose prose-invert max-w-none text-gray-400">
							{@html musicalDna}
						</div>
					</div>
				{/if}
			</div>
		{/if}
		<div class="mt-6 text-center">
				<button
					type="button"
					class="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2 mx-auto"
					disabled={isCreatingProfile}
					onclick={async () => {
						isCreatingProfile = true;
						const response = await fetch('/api/sound-profile', { method: 'POST' });
						if (response.ok) {
							const result = await response.json();
							soundProfile = result.soundProfile;
							musicalDna = result.musicalDna;
						}
						isCreatingProfile = false;
					}}
				>
					{#if isCreatingProfile} <Reload class="w-5 h-5 animate-spin" /> {/if} {isCreatingProfile ? 'Analyzing...' : 'Update My Sound Profile'}
				</button>
		</div>
	</div>
		<div class="grid grid-cols-1 md:grid-cols-3 gap-8">
			<!-- Column 1: Songs you like -->
			<div class="bg-gray-900/50 p-6 rounded-lg">
				<div class="flex justify-between items-center mb-6">
					<h2 class="text-2xl font-bold">Songs You Like</h2>
					<form
						method="POST"
						action="?/resync"
						use:enhance={() => {
							isResyncing = true;
							return async ({ result }) => {
								if (result.type === 'success') await invalidateAll();
								isResyncing = false;
							};
						}}
					>
						<button
							type="submit"
							class="flex items-center gap-2 text-sm text-gray-400 hover:text-white disabled:opacity-50 cursor-pointer"
							disabled={isResyncing}
						>
							<Reload class="w-4 h-4 {isResyncing ? 'animate-spin' : ''}" />
							{isResyncing ? 'Syncing...' : 'Re-sync'}
						</button>
					</form>
				</div>
				<LikeSearch onsongLiked={invalidateAll} />
				<div class="divide-y divide-gray-700">
					{#if filteredLikedSongs.length > 0}
						{#each filteredLikedSongs as song (song.id)}
							<SongCard {song} type="like" />
						{/each}
					{:else}
						<div class="text-center py-10">
							<p class="text-gray-400 mb-4">No liked songs yet.</p>
							<form
								method="POST"
								action="?/resync"
								use:enhance={() => {
									isResyncing = true;
									return async ({ result }) => {
										if (result.type === 'success') await invalidateAll();
										isResyncing = false;
									};
								}}
							>
								<button type="submit" class="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded disabled:opacity-50" disabled={isResyncing}>
									{isResyncing ? 'Importing...' : 'Import your liked songs to get started'}
								</button>
							</form>
						</div>
					{/if}
				</div>
			</div>

			<!-- Column 2: Songs you like/don't like -->
			<div class="bg-gray-900/50 p-6 rounded-lg">
				<h2 class="text-2xl font-bold mb-6">Songs You Don't Like</h2>
				<DislikeSearch onsongDisliked={invalidateAll} />
				<div class="mt-4 divide-y divide-gray-700">
					{#each data.dislikedSongs ?? [] as song (song.id)}
						<SongCard {song} type="dislike" />
					{/each}
				</div>
			</div>

			<!-- Column 3: Songs we recommend -->
			<div class="bg-gray-900/50 p-6 rounded-lg">
				<h2 class="text-2xl font-bold mb-6">Songs We Recommend</h2>

				<div class="flex gap-2 mb-4">
					<button
						onclick={() => (recommendationMode = 'liked')}
						class="flex-1 py-2 px-4 rounded text-sm font-semibold {recommendationMode === 'liked'
							? 'bg-blue-600 text-white'
							: 'bg-gray-700 hover:bg-gray-600 text-gray-300'}"
					>
						From My Liked Songs
					</button>
					<button
						onclick={() => (recommendationMode = 'specific')}
						class="flex-1 py-2 px-4 rounded text-sm font-semibold {recommendationMode === 'specific'
							? 'bg-blue-600 text-white'
							: 'bg-gray-700 hover:bg-gray-600 text-gray-300'}"
					>
						From specific song(s)
					</button>
				</div>

				{#if recommendationMode === 'specific'}
					<div class="mb-4">
						<RecommendationSearch bind:selectedSongs={specificSongs} />
						{#if specificSongs.length > 0}
							<div class="mt-2 space-y-2">
								{#each specificSongs as song (song.id)}
									<div class="flex items-center gap-2 p-2 bg-gray-800 rounded">
										<img src={song.album.images[0]?.url} alt={song.album.name} class="w-8 h-8 rounded-sm" />
										<div class="flex-grow overflow-hidden">
											<p class="text-sm truncate">{song.name}</p>
											<p class="text-xs text-gray-400 truncate">{song.artists.map(a => a.name).join(', ')}</p>
										</div>
										<button onclick={() => specificSongs = specificSongs.filter(s => s.id !== song.id)} class="text-red-400 hover:text-red-300">&times;</button>
									</div>
								{/each}
							</div>
						{/if}
					</div>
				{/if}

				<form
					class="text-center"
					method="POST"
					action={recommendationMode === 'liked' ? '?/recommendSongs' : '?/recommendFromSongs'}
					use:enhance={() => {
						isRecommending = true;
						return async ({ result }) => {
							await applyAction(result);
							isRecommending = false;
						};
					}}
				>
					{#if recommendationMode === 'specific'} <input type="hidden" name="songs" value={JSON.stringify(specificSongs)} /> {/if}
					<button type="submit" class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg disabled:opacity-50 w-full cursor-pointer flex items-center justify-center gap-2" disabled={isRecommending || (recommendationMode === 'specific' && specificSongs.length === 0)}>
						{#if isRecommending} <Reload class="w-5 h-5 animate-spin" /> {/if} {isRecommending ? 'Finding...' : 'Find Songs You\'ll Love'}
					</button>
				</form>
				<div class="mt-4 divide-y divide-gray-700">
					{#each recommendedTracks as { track, explanation } (track.id)}
						<RecommendationCard {track} {explanation} />
					{/each}
				</div>
			</div>
		</div>
</main>
