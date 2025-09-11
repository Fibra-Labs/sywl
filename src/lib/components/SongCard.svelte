<script lang="ts">
	import { enhance } from '$app/forms';
	import type { Song } from '$lib/server/spotify';
	import Spinner from '$lib/components/Spinner.svelte';
	import Check from '$lib/components/Check.svelte';
	import { invalidateAll } from '$app/navigation';

	export let song: Song & { reason: string | null };
	export let type: 'like' | 'dislike';

	let isSaving = false;
	let isRemoving = false;
    let wasSaved = false;
    let saveTimeout: number;

    function handleSaveSuccess() {
        isSaving = false;
        wasSaved = true;
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(() => {
            wasSaved = false;
        }, 1000);
    }
</script>
<div class="flex items-start space-x-4 py-4">
	{#if song.imageUrl}
		<img src={song.imageUrl} alt={song.album} class="w-20 h-20 rounded-md flex-shrink-0" />
	{/if}
	<div class="flex-grow min-w-0">
		<div class="flex justify-between items-start">
			<div class="flex-grow truncate pr-2">
				<p class="font-bold truncate">{song.name}</p>
				<p class="text-sm text-gray-400 truncate">{song.artist}</p>
			</div>
			{#if type === 'dislike' || type === 'like'}
				<form
					method="POST"
					action={type === 'like' ? '?/removeLike' : '?/removeDislike'}
					use:enhance={({ formElement }) => {
						isRemoving = true;
						return async ({ result }) => {
							if (result.type === 'success') {
								await invalidateAll();
							} else {
								isRemoving = false;
							}
						};
					}}
				>
					<input type="hidden" name="songId" value={song.id} />
					<button type="submit" class="cursor-pointer text-xs text-gray-500 hover:text-gray-300 flex-shrink-0 w-12 text-center" disabled={isRemoving}>
						{#if isRemoving}
							<Spinner class="w-4 h-4 inline-block" />
						{:else}
							Remove
						{/if}
					</button>
				</form>
			{/if}
		</div>

		<form
			method="POST"
			action={type === 'like' ? '?/saveLikeReason' : '?/saveDislikeReason'}
			use:enhance={() => {
				isSaving = true;
				return async ({ update }) => {
					await update({ reset: false });
					handleSaveSuccess();
				};
			}}
			class="mt-2"
		>
			<input type="hidden" name="songId" value={song.id} />
			<textarea
				name="reason"
				class="w-full p-2 border rounded bg-gray-800 border-gray-700 text-sm"
				placeholder={type === 'like' ? 'Why do you like this song?' : 'Why do you dislike this song?'}
				value={song.reason ?? ''}
				rows="2"></textarea>
			<button type="submit" class="mt-2 inline-flex items-center justify-center px-3 py-1 border border-transparent text-xs font-medium rounded-md shadow-sm text-white bg-gray-600 hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 disabled:opacity-50 disabled:cursor-not-allowed" disabled={isSaving}>
				{#if isSaving}
					<Spinner />
				{:else if wasSaved}
					<Check />
				{:else}
					Save
				{/if}
			</button>
		</form>
	</div>
</div>
