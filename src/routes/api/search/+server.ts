import { error, json, redirect } from '@sveltejs/kit';
import { spotifyFetch } from '$lib/server/spotify';

export const POST = async ({ request, locals, fetch }) => {
	const { user } = locals;
	if (!user) {
		throw redirect(303, '/');
	}

	const formData = await request.formData();
	const query = formData.get('query');

	if (!query || typeof query !== 'string' || query.length < 3) {
		return json({ searchResults: [] });
	}

	const searchParams = new URLSearchParams({
		q: query,
		type: 'track',
		limit: '10'
	});

	const response = await spotifyFetch(
		fetch,
		`https://api.spotify.com/v1/search?${searchParams.toString()}`,
		user
	);

	if (!response.ok) {
		const errorJson = await response.json();
		throw error(response.status, errorJson.error.message);
	}

	const data = await response.json();
	return json({ searchResults: data.tracks.items });
};