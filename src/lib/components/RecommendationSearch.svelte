<script lang="ts">
    import Spinner from '$lib/components/Spinner.svelte';
    import { enhance } from '$app/forms';
    import { toast } from 'svelte-sonner';

    let {
        selectedSongs
    }: {
        selectedSongs: SpotifyApi.TrackObjectFull[];
    } = $props();

    let searchQuery = $state('');
    let searchResults = $state<SpotifyApi.TrackObjectFull[]>([]);
    let isSearching = $state(false);

    const addSong = (song: SpotifyApi.TrackObjectFull) => {
        if (!selectedSongs.find((s) => s.id === song.id)) {
            selectedSongs.push(song);
        }
        searchQuery = '';
        searchResults = [];
    };

    const removeSong = (songId: string) => {
        selectedSongs = selectedSongs.filter((s) => s.id !== songId);
    };

    $effect(() => {
        const q = searchQuery;
        let active = true;

        const timeoutId = setTimeout(async () => {
            if (q.length < 3) {
                searchResults = [];
                return;
            }

            isSearching = true;
            try {
                const formData = new FormData();
                formData.append('query', q);
                const response = await fetch('/api/search', {
                    method: 'POST',
                    body: formData
                });

                if (!active) return;

                if (response.ok) {
                    const data = await response.json();
                    searchResults = data.searchResults || [];
                } else {
                    const errorData = await response.json().catch(() => ({}));
                    toast.error(errorData.error || 'Failed to search. Please try again.');
                    searchResults = [];
                }
            } catch (e) {
                if (!active) return;
                toast.error('Failed to search. Please try again.');
                searchResults = [];
            } finally {
                if (active) {
                    isSearching = false;
                }
            }
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
            placeholder="Search for a song..."
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
                <button
                        type="button"
                        onclick={() => addSong(track)}
                        class="w-full text-left p-2 hover:bg-gray-700 flex items-center gap-4"
                >
                    <img src={track.album.images[0]?.url} alt={track.album.name} class="w-10 h-10 rounded-sm" />
                    <div class="flex-grow overflow-hidden">
                        <p class="font-bold truncate text-sm">{track.name}</p>
                        <p class="text-xs text-gray-400 truncate">
                            {track.artists.map((a) => a.name).join(', ')}
                        </p>
                    </div>
                </button>
            {/each}
        </div>
    {/if}
</div>
