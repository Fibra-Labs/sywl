<script lang="ts">
    import { enhance } from '$app/forms';
    import type { Song } from '$lib/server/spotify';
    import Spinner from '$lib/components/Spinner.svelte';
    import Check from '$lib/components/Check.svelte';

    export let song: Song & { reason: string | null };

    let isSaving = false;
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

<div class="flex items-start space-x-4 p-4 rounded-lg">
    {#if song.imageUrl}
        <img src={song.imageUrl} alt={song.album} class="w-24 h-24 rounded" />
    {/if}
    <div class="flex-grow">
        <div class="font-bold text-lg">{song.name}</div>
        <div class="text-sm text-gray-400">{song.artist}</div>
        <div class="text-xs text-gray-500">{song.album}</div>
        <form
                method="POST"
                action="?/saveLikeReason"
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
                    class="w-full p-2 border rounded bg-gray-800 border-gray-700"
                    placeholder="Why do you like this song?"
                    value={song.reason ?? ''}></textarea>
            <button type="submit" class="btn btn-sm btn-primary mt-2" disabled={isSaving}>
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
