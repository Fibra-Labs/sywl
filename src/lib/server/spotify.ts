import { redirect, type RequestEvent } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { db } from './db';
import { user } from './db/schema';
import { eq } from 'drizzle-orm';

const SPOTIFY_CLIENT_ID = env.SPOTIFY_CLIENT_ID;
const SPOTIFY_CLIENT_SECRET = env.SPOTIFY_CLIENT_SECRET;
const SPOTIFY_REDIRECT_URI = 'https://127.0.0.1:5173/login/spotify/callback';

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
	const state = generateRandomString(16);
	const scope = 'user-read-email user-library-read user-library-modify';

	event.cookies.set('spotify_auth_state', state, { path: '/' });

	const searchParams = new URLSearchParams({
		response_type: 'code',
		client_id: SPOTIFY_CLIENT_ID,
		scope,
		redirect_uri: SPOTIFY_REDIRECT_URI,
		state
	});

	throw redirect(303, `https://accounts.spotify.com/authorize?${searchParams.toString()}`);
};

const refreshAccessToken = async (refreshToken: string) => {
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

	const tokens = await response.json();

	if (!response.ok) {
		throw new Error(tokens.error_description);
	}

	await db
		.update(user)
		.set({
			accessToken: tokens.access_token,
			expiresAt: Date.now() + tokens.expires_in * 1000,
			scope: tokens.scope
		})
		.where(eq(user.refreshToken, refreshToken));

	return tokens.access_token;
};

export const spotifyFetch = async (
	fetcher: typeof fetch,
	url: string,
	user: App.User,
	options: RequestInit = {}
): Promise<Response> => {
	let { accessToken, expiresAt, refreshToken } = user;

	if (Date.now() > expiresAt) {
		accessToken = await refreshAccessToken(refreshToken);
	}

	const response = await fetcher(url, {
		...options,
		headers: {
			...options.headers,
			Authorization: `Bearer ${accessToken}`
		}
	});

	return response;
};

export const getMySavedTracks = async (
	fetcher: typeof fetch,
	user: App.User
): Promise<Song[]> => {
	const response = await spotifyFetch(fetcher, 'https://api.spotify.com/v1/me/tracks?limit=50', user);
	if (!response.ok) {
		return [];
	}

	const data: SpotifyApi.UsersSavedTracksResponse = await response.json();

	return data.items.map(({ track }) => ({
		id: track.id,
		name: track.name,
		artist: track.artists.map((a) => a.name).join(', '),
		album: track.album.name,
		imageUrl: track.album.images.length > 0 ? track.album.images[0].url : null
	}));
};
