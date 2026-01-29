import { error, redirect } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { db } from '$lib/server/db';
import { user as userTable } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { trace } from '@opentelemetry/api';
import logger from '$lib/server/logger';

const tracer = trace.getTracer('sywl');

const SPOTIFY_CLIENT_ID = env.SPOTIFY_CLIENT_ID;
const SPOTIFY_CLIENT_SECRET = env.SPOTIFY_CLIENT_SECRET;
const SPOTIFY_REDIRECT_URI = env.SPOTIFY_REDIRECT_URI;

export const GET: RequestHandler = async ({ url, cookies }) => {
	return tracer.startActiveSpan('auth.spotify-callback', async (span) => {
		try {
			logger.debug('[SPOTIFY CALLBACK] Starting OAuth callback');
			logger.debug(`[SPOTIFY CALLBACK] SPOTIFY_REDIRECT_URI: ${SPOTIFY_REDIRECT_URI}`);

			const code = url.searchParams.get('code');
			const state = url.searchParams.get('state');
			const storedState = cookies.get('spotify_auth_state');

			logger.debug(`[SPOTIFY CALLBACK] Code present: ${!!code}`);
			logger.debug(`[SPOTIFY CALLBACK] State: ${state}`);
			logger.debug(`[SPOTIFY CALLBACK] Stored state: ${storedState}`);

			if (state === null || state !== storedState) {
				logger.error('[SPOTIFY CALLBACK] State mismatch error');
				span.recordException(new Error('State mismatch'));
				span.end();
				throw error(400, 'State mismatch');
			}

			cookies.delete('spotify_auth_state', { path: '/' });

			logger.debug('[SPOTIFY CALLBACK] Requesting token from Spotify');
			const tokenRequestBody = {
				grant_type: 'authorization_code',
				code: code as string,
				redirect_uri: SPOTIFY_REDIRECT_URI
			};
			logger.debug(`[SPOTIFY CALLBACK] Token request body: ${JSON.stringify(tokenRequestBody)}`);

			let response;
			try {
				response = await fetch('https://accounts.spotify.com/api/token', {
					method: 'POST',
					headers: {
						'Content-Type': 'application/x-www-form-urlencoded',
						Authorization: `Basic ${Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64')}`
					},
					body: new URLSearchParams(tokenRequestBody)
				});
				logger.debug(`[SPOTIFY CALLBACK] Token response status: ${response.status}`);
			} catch (e) {
				logger.error(`[SPOTIFY CALLBACK] Error fetching token: ${e}`);
				span.recordException(e as Error);
				span.end();
				throw error(500, 'Failed to fetch token from Spotify');
			}

			const tokens = await response.json();
			logger.info(`[SPOTIFY CALLBACK] Token response: ${JSON.stringify(tokens)}`);

			if (tokens.error) {
				logger.error(`[SPOTIFY CALLBACK] Token error: ${tokens.error} ${tokens.error_description}`);
				span.recordException(new Error(tokens.error_description));
				span.end();
				throw error(500, tokens.error_description);
			}

			logger.info('[SPOTIFY CALLBACK] Fetching user profile');
			let profileResponse;
			try {
				profileResponse = await fetch('https://api.spotify.com/v1/me', {
					headers: {
						Authorization: `Bearer ${tokens.access_token}`
					}
				});
				logger.info(`[SPOTIFY CALLBACK] Profile response status: ${profileResponse.status}`);
			} catch (e) {
				logger.error(`[SPOTIFY CALLBACK] Error fetching profile: ${e}`);
				span.recordException(e as Error);
				span.end();
				throw error(500, 'Failed to fetch profile from Spotify');
			}

			if (!profileResponse.ok) {
				logger.error(`[SPOTIFY CALLBACK] Profile fetch failed with status: ${profileResponse.status}`);
				span.recordException(new Error(`Profile fetch failed with status: ${profileResponse.status}`));
				span.end();
				throw error(500, 'Failed to fetch profile from Spotify');
			}

			const profile = await profileResponse.json();
			logger.info(`[SPOTIFY CALLBACK] Profile ID: ${profile.id}`);
			span.setAttribute('user.id', profile.id);
			span.setAttribute('user.email', profile.email);

			const user = {
				id: profile.id,
				displayName: profile.display_name,
				email: profile.email,
				accessToken: tokens.access_token,
				refreshToken: tokens.refresh_token,
				expiresAt: Date.now() + tokens.expires_in * 1000,
				scope: tokens.scope
			};

			logger.info('[SPOTIFY CALLBACK] Saving user to database');
			try {
				await db
					.insert(userTable)
					.values(user)
					.onConflictDoUpdate({
						target: userTable.id,
						set: {
							displayName: user.displayName,
							email: user.email,
							accessToken: user.accessToken,
							refreshToken: user.refreshToken,
							expiresAt: user.expiresAt,
							scope: user.scope
						}
					});
				logger.info('[SPOTIFY CALLBACK] User saved successfully');
			} catch (e) {
				logger.error(`[SPOTIFY CALLBACK] Database error: ${e}`);
				span.recordException(e as Error);
				span.end();
				throw error(500, 'Failed to save user to database');
			}

			logger.info('[SPOTIFY CALLBACK] Fetching session');
			const session = await db.query.user.findFirst({
				where: eq(userTable.id, user.id)
			});

			if (session) {
				logger.info('[SPOTIFY CALLBACK] Setting session cookie');
				cookies.set('session_id', session.id, { path: '/', httpOnly: true, maxAge: 60 * 60 * 24 * 7 });
			} else {
				logger.error('[SPOTIFY CALLBACK] No session found after insert');
			}

			logger.info('[SPOTIFY CALLBACK] Redirecting to home');
			span.end();
			throw redirect(303, '/');
		} catch (e) {
			// If error is already thrown (like redirect), just re-throw
			if (e instanceof Response || (e as any).status) {
				throw e;
			}
			logger.error(`[SPOTIFY CALLBACK] Unexpected error: ${e}`);
			span.recordException(e as Error);
			span.end();
			throw e;
		}
	});
};
