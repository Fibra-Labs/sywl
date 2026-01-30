import { spotifyLogin } from '$lib/server/spotify';
import type { RequestHandler } from './$types';
import { trace, SpanStatusCode } from '@opentelemetry/api';
import { setSpanAttributes, setSpanError } from '$lib/server/tracing';
import { env } from '$env/dynamic/private';

const tracer = trace.getTracer('songs-you-will-love');

export const GET: RequestHandler = (event) => {
	const { cookies, url } = event;
	
	return tracer.startActiveSpan('auth.spotify.initiate', (span) => {
		try {
			// Set initial attributes
			setSpanAttributes(span, {
				'request.url': url.href,
				'oauth.redirect_uri': env.SPOTIFY_REDIRECT_URI
			});

			// spotifyLogin will throw a redirect
			throw spotifyLogin(event);
		} catch (error) {
			// If it's a redirect, get the state from cookies and add to span
			if (error instanceof Response || (error as any).status) {
				const state = cookies.get('spotify_auth_state');
				if (state) {
					span.setAttribute('oauth.state', state);
				}
				span.setStatus({ code: SpanStatusCode.OK });
				span.end();
				throw error;
			}
			
			// For actual errors, record them
			setSpanError(span, error);
			span.end();
			throw error;
		}
	});
};
