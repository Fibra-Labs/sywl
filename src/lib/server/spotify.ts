import {redirect, type RequestEvent} from '@sveltejs/kit';
import {env} from '$env/dynamic/private';
import {db} from './db';
import {user} from './db/schema';
import {eq} from 'drizzle-orm';
import {trace} from '@opentelemetry/api';
import {setSpanAttributes, setSpanError} from '$lib/server/tracing';
import logger from './logger';

const SPOTIFY_CLIENT_ID = env.SPOTIFY_CLIENT_ID;
const SPOTIFY_CLIENT_SECRET = env.SPOTIFY_CLIENT_SECRET;
const SPOTIFY_REDIRECT_URI = env.SPOTIFY_REDIRECT_URI;

const tracer = trace.getTracer('songs-you-will-love');

export interface Song {
    id: string;
    name: string;
    artist: string;
    album: string;
    imageUrl: string | null;
}

const generateRandomString = (length: number) => {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < length; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
};

export const spotifyLogin = (event: RequestEvent) => {
    logger.debug('[SPOTIFY LOGIN] Initiating OAuth flow');
    logger.debug(`[SPOTIFY LOGIN] SPOTIFY_REDIRECT_URI: ${SPOTIFY_REDIRECT_URI}`);

    const state = generateRandomString(16);
    const scope = 'user-read-email user-read-private user-library-read user-library-modify';


    event.cookies.set('spotify_auth_state', state, {path: '/'});

    const searchParams = new URLSearchParams({
        response_type: 'code',
        client_id: SPOTIFY_CLIENT_ID,
        scope,
        redirect_uri: SPOTIFY_REDIRECT_URI,
        state
    });

    const authUrl = `https://accounts.spotify.com/authorize?${searchParams.toString()}`;
    logger.debug(`[SPOTIFY LOGIN] Redirecting to: ${authUrl}`);

    throw redirect(303, authUrl);
};

const refreshAccessToken = async (refreshToken: string, userId?: string) => {
    return tracer.startActiveSpan('spotify.token.refresh', async (span) => {
        const startTime = Date.now();

        try {
            logger.debug('[SPOTIFY] Refreshing token');

            // Set initial span attributes
            if (userId) {
                span.setAttribute('user.id', userId);
            }
            span.setAttribute('token.expired', true);

            // Make token refresh request
            const tokenRequestStart = Date.now();
            const response = await fetch('https://accounts.spotify.com/api/token', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    Authorization: `Basic ${Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64')}`
                },
                body: new URLSearchParams({
                    grant_type: 'refresh_token',
                    refresh_token: refreshToken
                })
            });
            const tokenRequestDuration = Date.now() - tokenRequestStart;

            const tokens = await response.json();

            if (!response.ok) {
                logger.error('[SPOTIFY] There was an error refreshing the token');
                setSpanError(span, new Error(tokens.error_description || 'Token refresh failed'), {
                    'error.code': response.status,
                    'token.refresh_success': false,
                    'token.refresh_duration_ms': tokenRequestDuration
                });
                span.end();
                throw new Error(tokens.error_description);
            }

            // Update database with new token
            await db
                .update(user)
                .set({
                    accessToken: tokens.access_token,
                    expiresAt: Date.now() + tokens.expires_in * 1000,
                    scope: tokens.scope
                })
                .where(eq(user.refreshToken, refreshToken));

            // Set success attributes
            const totalDuration = Date.now() - startTime;
            setSpanAttributes(span, {
                'token.expires_in': tokens.expires_in,
                'token.refresh_duration_ms': totalDuration,
                'token.refresh_success': true
            });

            span.end();
            return tokens.access_token;
        } catch (error) {
            setSpanError(span, error);
            span.end();
            throw error;
        }
    });
};

export const spotifyFetch = async (
    fetcher: typeof fetch,
    url: string,
    user: App.User,
    options: RequestInit = {}
): Promise<Response> => {
    return tracer.startActiveSpan('spotify.api.request', async (span) => {
        const startTime = Date.now();
        let tokenWasRefreshed = false;

        try {
            logger.debug('[SPOTIFY] Fetching from Spotify API');

            // Extract endpoint and method for span attributes
            const urlObj = new URL(url);
            const endpoint = urlObj.pathname;
            const method = (options.method || 'GET').toUpperCase();

            // Set initial span attributes
            setSpanAttributes(span, {
                'user.id': user.id,
                'spotify.endpoint': endpoint,
                'spotify.method': method
            });

            let {accessToken, expiresAt, refreshToken} = user;

            // Check if token needs refresh
            if (Date.now() > expiresAt) {
                tokenWasRefreshed = true;
                accessToken = await refreshAccessToken(refreshToken, user.id);
            }

            // Make the API request
            const requestStart = Date.now();
            const response = await fetcher(url, {
                ...options,
                headers: {
                    ...options.headers,
                    Authorization: `Bearer ${accessToken}`
                }
            });
            const requestDuration = Date.now() - startTime;

            // Set response attributes
            setSpanAttributes(span, {
                'http.status_code': response.status,
                'request.duration_ms': requestDuration,
                'cache.hit': false, // Not cached by default
                'retry.attempt': tokenWasRefreshed ? 1 : 0
            });

            // Handle errors based on status code
            if (!response.ok) {
                const errorMessage = `Spotify API error: ${response.status} ${response.statusText}`;
                setSpanError(span, new Error(errorMessage), {
                    'error.code': response.status
                });
            }

            span.end();
            return response;
        } catch (error) {
            setSpanError(span, error);
            span.end();
            throw error;
        }
    });
};

export const getMySavedTracks = async (
    fetcher: typeof fetch,
    user: App.User
): Promise<Song[]> => {
    logger.debug('[SPOTIFY] Getting saved tracks');
    const response = await spotifyFetch(fetcher, 'https://api.spotify.com/v1/me/tracks?limit=50', user);
    if (!response.ok) {
        return [];
    }

    const data: SpotifyApi.UsersSavedTracksResponse = await response.json();

    return data.items.map(({track}) => ({
        id: track.id,
        name: track.name,
        artist: track.artists.map((a) => a.name).join(', '),
        album: track.album.name,
        imageUrl: track.album.images.length > 0 ? track.album.images[0].url : null
    }));
};
