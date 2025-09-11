<script lang="ts">
	let { children, data } = $props();
</script>

<div class="bg-black text-white min-h-screen">
	<header class="p-8 flex justify-between items-center">
		<a href="/" class="text-2xl font-bold">Songs You Will Love</a>
		{#if data.user}
			<div class="flex items-center gap-4">
				<span class="text-gray-400">Welcome, {data.user.displayName}</span>
				<a
					href="/logout"
					class="bg-gray-700 text-white font-bold py-2 px-4 rounded-full text-sm hover:bg-gray-600 transition-colors duration-300"
				>
					Log out
				</a>
			</div>
		{/if}
	</header>

	{@render children()}
</div>