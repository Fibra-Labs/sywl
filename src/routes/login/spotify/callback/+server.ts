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
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const storedState = cookies.get('spotify_auth_state');

    if (state === null || state !== storedState) {
        throw error(400, 'State mismatch');
    }

    cookies.delete('spotify_auth_state', { path: '/' });

    const response = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: `Basic ${Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64')}`
        },
        body: new URLSearchParams({
            grant_type: 'authorization_code',
            code: code as string,
            redirect_uri: SPOTIFY_REDIRECT_URI
        })
    });

    const tokens = await response.json();

    if (tokens.error) {
        throw error(500, tokens.error_description);
    }

    const profileResponse = await fetch('https://api.spotify.com/v1/me', {
        headers: {
            Authorization: `Bearer ${tokens.access_token}`
        }
    });

    const profile = await profileResponse.json();

    const user = {
        id: profile.id,
        displayName: profile.display_name,
        email: profile.email,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt: Date.now() + tokens.expires_in * 1000,
        scope: tokens.scope
    };

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

    const session = await db.query.user.findFirst({
        where: eq(userTable.id, user.id)
    });

    if (session) {
        cookies.set('session_id', session.id, { path: '/', httpOnly: true, maxAge: 60 * 60 * 24 * 7 });
    }

    throw redirect(303, '/');
};
