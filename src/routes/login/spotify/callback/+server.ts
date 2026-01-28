import { error, redirect } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { db } from '$lib/server/db';
import { user as userTable } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';

const SPOTIFY_CLIENT_ID = env.SPOTIFY_CLIENT_ID;
const SPOTIFY_CLIENT_SECRET = env.SPOTIFY_CLIENT_SECRET;
const SPOTIFY_REDIRECT_URI = env.SPOTIFY_REDIRECT_URI;

export const GET: RequestHandler = async ({ url, cookies }) => {
    console.log('[SPOTIFY CALLBACK] Starting OAuth callback');
    console.log('[SPOTIFY CALLBACK] SPOTIFY_REDIRECT_URI:', SPOTIFY_REDIRECT_URI);
    
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const storedState = cookies.get('spotify_auth_state');

    console.log('[SPOTIFY CALLBACK] Code present:', !!code);
    console.log('[SPOTIFY CALLBACK] State:', state);
    console.log('[SPOTIFY CALLBACK] Stored state:', storedState);

    if (state === null || state !== storedState) {
        console.error('[SPOTIFY CALLBACK] State mismatch error');
        throw error(400, 'State mismatch');
    }

    cookies.delete('spotify_auth_state', { path: '/' });

    console.log('[SPOTIFY CALLBACK] Requesting token from Spotify');
    const tokenRequestBody = {
        grant_type: 'authorization_code',
        code: code as string,
        redirect_uri: SPOTIFY_REDIRECT_URI
    };
    console.log('[SPOTIFY CALLBACK] Token request body:', JSON.stringify(tokenRequestBody));

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
        console.log('[SPOTIFY CALLBACK] Token response status:', response.status);
    } catch (e) {
        console.error('[SPOTIFY CALLBACK] Error fetching token:', e);
        throw error(500, 'Failed to fetch token from Spotify');
    }

    const tokens = await response.json();
    console.log('[SPOTIFY CALLBACK] Token response:', JSON.stringify(tokens));

    if (tokens.error) {
        console.error('[SPOTIFY CALLBACK] Token error:', tokens.error, tokens.error_description);
        throw error(500, tokens.error_description);
    }

    console.log('[SPOTIFY CALLBACK] Fetching user profile');
    let profileResponse;
    try {
        profileResponse = await fetch('https://api.spotify.com/v1/me', {
            headers: {
                Authorization: `Bearer ${tokens.access_token}`
            }
        });
        console.log('[SPOTIFY CALLBACK] Profile response status:', profileResponse.status);
    } catch (e) {
        console.error('[SPOTIFY CALLBACK] Error fetching profile:', e);
        throw error(500, 'Failed to fetch profile from Spotify');
    }

    if (!profileResponse.ok) {
        console.error('[SPOTIFY CALLBACK] Profile fetch failed with status:', profileResponse.status);
        throw error(500, 'Failed to fetch profile from Spotify');
    }

    const profile = await profileResponse.json();
    console.log('[SPOTIFY CALLBACK] Profile ID:', profile.id);

    const user = {
        id: profile.id,
        displayName: profile.display_name,
        email: profile.email,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt: Date.now() + tokens.expires_in * 1000,
        scope: tokens.scope
    };

    console.log('[SPOTIFY CALLBACK] Saving user to database');
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
        console.log('[SPOTIFY CALLBACK] User saved successfully');
    } catch (e) {
        console.error('[SPOTIFY CALLBACK] Database error:', e);
        throw error(500, 'Failed to save user to database');
    }

    console.log('[SPOTIFY CALLBACK] Fetching session');
    const session = await db.query.user.findFirst({
        where: eq(userTable.id, user.id)
    });

    if (session) {
        console.log('[SPOTIFY CALLBACK] Setting session cookie');
        cookies.set('session_id', session.id, { path: '/', httpOnly: true, maxAge: 60 * 60 * 24 * 7 });
    } else {
        console.error('[SPOTIFY CALLBACK] No session found after insert');
    }

    console.log('[SPOTIFY CALLBACK] Redirecting to home');
    throw redirect(303, '/');
};
