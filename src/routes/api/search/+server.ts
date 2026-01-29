import { error, json, redirect } from '@sveltejs/kit';
import { spotifyFetch } from '$lib/server/spotify';
import { trace } from '@opentelemetry/api';
import logger from '$lib/server/logger';

const tracer = trace.getTracer('sywl');

export const POST = async ({ request, locals, fetch }) => {
	return tracer.startActiveSpan('api.search', async (span) => {
		try {
			logger.debug('[SEARCH API] Processing search request');
			const { user } = locals;
			if (!user) {
				logger.debug('[SEARCH API] No user, redirecting');
				span.end();
				throw redirect(303, '/');
			}

			const formData = await request.formData();
			const query = formData.get('query');
			logger.debug(`[SEARCH API] Query: ${query}`);

			if (!query || typeof query !== 'string' || query.length < 3) {
				logger.debug('[SEARCH API] Query too short or invalid');
				span.end();
				return json({ searchResults: [] });
			}

			span.setAttribute('search.query', query);
			span.setAttribute('user.id', user.id);

			const searchParams = new URLSearchParams({
				q: query,
				type: 'track',
				limit: '10'
			});

			logger.debug('[SEARCH API] Querying Spotify API');
			const response = await spotifyFetch(
				fetch,
				`https://api.spotify.com/v1/search?${searchParams.toString()}`,
				user
			);

			if (!response.ok) {
				logger.error(`[SEARCH API] Spotify API error: ${response.status}`);
				const errorJson = await response.json();
				span.recordException(new Error(errorJson.error.message));
				span.end();
				return json({ error: 'Failed to search. Please try again.' }, { status: 500 });
			}
	
			const data = await response.json();
			logger.debug(`[SEARCH API] Found ${data.tracks.items.length} tracks`);
			span.setAttribute('search.results_count', data.tracks.items.length);
			span.end();
			return json({ searchResults: data.tracks.items });
		} catch (e) {
			logger.error(`[SEARCH API] Error: ${e}`);
			span.recordException(e as Error);
			span.end();
			return json({ error: 'Failed to search. Please try again.' }, { status: 500 });
		}
	});
};
