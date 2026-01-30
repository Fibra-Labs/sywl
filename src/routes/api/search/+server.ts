import { json, redirect } from '@sveltejs/kit';
import { spotifyFetch } from '$lib/server/spotify';
import { trace } from '@opentelemetry/api';
import logger from '$lib/server/logger';
import { setSpanAttributes, setSpanError, getUserContext } from '$lib/server/tracing';

const tracer = trace.getTracer('songs-you-will-love');

export const POST = async ({ request, locals, fetch }) => {
	return tracer.startActiveSpan('api.search', async (span) => {
		const requestStartTime = Date.now();
		
		try {
			logger.debug('[SEARCH API] Processing search request');
			const { user } = locals;
			
			// Set user context attributes
			setSpanAttributes(span, getUserContext(locals));
			
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
				setSpanAttributes(span, {
					'search.query': query || '',
					'search.query_length': query ? String(query).length : 0,
					'search.has_results': false
				});
				span.end();
				return json({ searchResults: [] });
			}

			// Set search attributes
			setSpanAttributes(span, {
				'search.query': query,
				'search.query_length': query.length,
				'search.type': 'track',
				'search.limit': 10
			});

			const searchParams = new URLSearchParams({
				q: query,
				type: 'track',
				limit: '10'
			});

			logger.debug('[SEARCH API] Querying Spotify API');
			const spotifyStartTime = Date.now();
			const response = await spotifyFetch(
				fetch,
				`https://api.spotify.com/v1/search?${searchParams.toString()}`,
				user
			);
			const spotifyDuration = Date.now() - spotifyStartTime;

			if (!response.ok) {
				logger.error(`[SEARCH API] Spotify API error: ${response.status}`);
				const errorJson = await response.json();
				setSpanError(span, new Error(errorJson.error.message), {
					'spotify.api_duration_ms': spotifyDuration,
					'search.has_results': false
				});
				span.end();
				return json({ error: 'Failed to search. Please try again.' }, { status: 500 });
			}
	
			const data = await response.json();
			const resultsCount = data.tracks.items.length;
			logger.debug(`[SEARCH API] Found ${resultsCount} tracks`);
			
			// Set result attributes
			const requestDuration = Date.now() - requestStartTime;
			setSpanAttributes(span, {
				'search.results_count': resultsCount,
				'search.has_results': resultsCount > 0,
				'spotify.api_duration_ms': spotifyDuration,
				'request.duration_ms': requestDuration
			});
			
			span.end();
			return json({ searchResults: data.tracks.items });
		} catch (e) {
			logger.error(`[SEARCH API] Error: ${e}`);
			const requestDuration = Date.now() - requestStartTime;
			setSpanError(span, e as Error, {
				'request.duration_ms': requestDuration,
				'search.has_results': false
			});
			span.end();
			return json({ error: 'Failed to search. Please try again.' }, { status: 500 });
		}
	});
};
