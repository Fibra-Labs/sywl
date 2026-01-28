import { error, json, redirect } from '@sveltejs/kit';
import { spotifyFetch } from '$lib/server/spotify';

export const POST = async ({ request, locals, fetch }) => {
	console.log('[SEARCH API] Processing search request');
	const { user } = locals;
	if (!user) {
		console.log('[SEARCH API] No user, redirecting');
		throw redirect(303, '/');
	}

	try {
		const formData = await request.formData();
		const query = formData.get('query');
		console.log('[SEARCH API] Query:', query);

		if (!query || typeof query !== 'string' || query.length < 3) {
			console.log('[SEARCH API] Query too short or invalid');
			return json({ searchResults: [] });
		}

		const searchParams = new URLSearchParams({
			q: query,
			type: 'track',
			limit: '10'
		});

		console.log('[SEARCH API] Querying Spotify API');
		const response = await spotifyFetch(
			fetch,
			`https://api.spotify.com/v1/search?${searchParams.toString()}`,
			user
		);

		if (!response.ok) {
			console.error('[SEARCH API] Spotify API error:', response.status);
			const errorJson = await response.json();
			throw error(response.status, errorJson.error.message);
		}

		const data = await response.json();
		console.log('[SEARCH API] Found', data.tracks.items.length, 'tracks');
		return json({ searchResults: data.tracks.items });
	} catch (e) {
		console.error('[SEARCH API] Error:', e);
		throw e;
	}
};
