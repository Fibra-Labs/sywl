<script lang="ts">
	import SpotifyIcon from '$lib/components/SpotifyIcon.svelte';

	let { data } = $props();
</script>

<svelte:head>
	<title>Songs You Will Love</title>
	<meta name="description" content="Discover songs you will love based on your Spotify listening." />
</svelte:head>

<div class="bg-black text-white min-h-screen flex flex-col">
	<header class="p-8">
		<a href="/" class="text-2xl font-bold">Songs You Will Love</a>
	</header>

	<main class="flex-grow flex items-center justify-center text-center px-4">
		<div class="space-y-8 max-w-3xl">
			<h1 class="text-5xl md:text-7xl font-extrabold tracking-tight">
				Find the music that moves you.
			</h1>
			<p class="text-lg md:text-xl text-gray-400">
				Log in with your Spotify account to get personalized song recommendations you're guaranteed
				to love.
			</p>
			<div>
				<a
					href="/login/spotify"
					class="bg-[#1DB954] text-white font-bold py-4 px-8 rounded-full inline-flex items-center gap-3 text-lg hover:bg-[#1ED760] transition-colors duration-300"
				>
					<SpotifyIcon class="w-6 h-6" />
					Log in with Spotify
				</a>
			</div>
		</div>
	</main>

	<footer class="p-8 text-center text-gray-500">
		<p>&copy; {new Date().getFullYear()} Songs You Will Love. All rights reserved.</p>
	</footer>
</div>
