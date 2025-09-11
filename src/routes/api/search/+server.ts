import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { user as userTable } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

export const GET: RequestHandler = async ({ url, locals }) => {
	const { user } = locals;
	if (!user) {
		throw error(401, 'Unauthorized');
	}

	const query = url.searchParams.get('q');

	if (!query) {
		return json({ tracks: { items: [] } });
	}

	const searchParams = new URLSearchParams({
		q: query,
		type: 'track',
		limit: '10'
	});

	const response = await fetch(`https://api.spotify.com/v1/search?${searchParams.toString()}`, {
		headers: {
			Authorization: `Bearer ${user.accessToken}`
		}
	});

	if (!response.ok) {
		const errorJson = await response.json();
		throw error(response.status, errorJson.error.message);
	}

	const data = await response.json();
	return json(data);
};