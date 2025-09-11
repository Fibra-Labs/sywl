<script lang="ts">
	let { previewUrl }: { previewUrl: string } = $props();

	let audio: HTMLAudioElement;
	let isPlaying = $state(false);

	function togglePlay() {
		if (isPlaying) {
			audio.pause();
		} else {
			audio.play();
		}
	}

	function onPlay() {
		isPlaying = true;
	}

	function onPause() {
		isPlaying = false;
	}
</script>

<audio bind:this={audio} src={previewUrl} onplay={onPlay} onpause={onPause} />

<button
	type="button"
	onclick={togglePlay}
	class="flex items-center justify-center w-8 h-8 rounded-full bg-gray-700 hover:bg-gray-600 text-white"
>
	{#if isPlaying}
		<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
			<path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v4a1 1 0 11-2 0V8z" clip-rule="evenodd" />
		</svg>
	{:else}
		<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
			<path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clip-rule="evenodd" />
		</svg>
	{/if}
</button>