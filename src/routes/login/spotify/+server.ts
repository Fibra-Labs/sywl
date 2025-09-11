import { spotifyLogin } from '$lib/server/spotify';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ cookies }) => {
	throw spotifyLogin({ cookies });
};
