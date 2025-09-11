<script lang="ts">
	import { enhance, applyAction } from '$app/forms';
	import SongCard from '$lib/components/SongCard.svelte';
	import DislikeSearch from '$lib/components/DislikeSearch.svelte';
	import { invalidateAll } from '$app/navigation';
	import Reload from '$lib/components/Reload.svelte';
	import ListSearch from '$lib/components/ListSearch.svelte';

	let { data, form } = $props<{ data: App.PageData; form: any }>();

	let isResyncing = $state(false);
	let isCreatingProfile = $state(false);
	let likedSongsSearch = $state('');

	const filteredLikedSongs = $derived(
		data.likedSongs.filter(
			(song) =>
				song.name.toLowerCase().includes(likedSongsSearch.toLowerCase()) ||
				song.artist.toLowerCase().includes(likedSongsSearch.toLowerCase())
		)
	);
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
				<p class="text-gray-400">{data.soundProfile ?? 'Your sound profile will appear here.'}</p>
			</div>
		</div>
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
							data.soundProfile = result.soundProfile;
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
				<ListSearch bind:value={likedSongsSearch} placeholder="Search your liked songs..." />
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

			<!-- Column 2: Songs you don't like -->
			<div class="bg-gray-900/50 p-6 rounded-lg">
				<h2 class="text-2xl font-bold mb-6">Songs You Don't Like</h2>
				<DislikeSearch on:songDisliked={invalidateAll} />
				<div class="mt-4 divide-y divide-gray-700">
					{#each data.dislikedSongs ?? [] as song (song.id)}
						<SongCard {song} type="dislike" />
					{/each}
				</div>
			</div>

			<!-- Column 3: Songs we recommend -->
			<div class="bg-gray-900/50 p-6 rounded-lg">
				<h2 class="text-2xl font-bold mb-6">Songs We Recommend</h2>
				<div class="text-center">
					<button type="button" class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg disabled:opacity-50 w-full cursor-pointer">Find Songs You'll Love</button>
				</div>
			</div>
		</div>
</main>
