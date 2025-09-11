<script lang="ts">
	let { value, placeholder }: { value: string; placeholder: string } = $props();
</script>

<div class="relative mb-4">
	<input
		type="search"
		bind:value
		{placeholder}
		class="w-full p-2 pl-8 border rounded bg-gray-800 border-gray-700 text-sm"
	/>
	<div class="absolute inset-y-0 left-0 flex items-center pl-2 pointer-events-none">
		<svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"
			><path
				stroke-linecap="round"
				stroke-linejoin="round"
				stroke-width="2"
				d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg
		>
	</div>
</div>