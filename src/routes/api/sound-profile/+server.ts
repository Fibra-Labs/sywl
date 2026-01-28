import { json, redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { user as userTable, userSongDislike, userSongLike, type Song as DbSong } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { createSoundProfile } from '$lib/server/groq';
import { marked } from 'marked';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ locals }) => {
	console.log('[SOUND PROFILE API] Creating sound profile');
	const { user } = locals;
	if (!user) {
		console.log('[SOUND PROFILE API] No user, redirecting');
		throw redirect(303, '/');
	}

	console.log('[SOUND PROFILE API] User ID:', user.id);

	try {
		const [likedSongs, dislikedSongs] = await Promise.all([
			db.query.userSongLike.findMany({
				where: eq(userSongLike.userId, user.id),
				with: { song: true }
			}),
			db.query.userSongDislike.findMany({
				where: eq(userSongDislike.userId, user.id),
				with: { song: true }
			})
		]);

		console.log('[SOUND PROFILE API] Liked songs:', likedSongs.length, 'Disliked songs:', dislikedSongs.length);

		const profileSongs = (songs: (typeof likedSongs | typeof dislikedSongs)) =>
			songs
				.filter((s): s is typeof s & { song: DbSong } => s.song !== null)
				.map((s) => ({ name: s.song.name, artist: s.song.artist, reason: s.reason }));
		
		console.log('[SOUND PROFILE API] Calling AI to create profile');
		const { musicalDna, soundProfile } = await createSoundProfile(
			profileSongs(likedSongs),
			profileSongs(dislikedSongs)
		);

		console.log('[SOUND PROFILE API] Profile created, parsing markdown');
		const musicalDnaHtml = await marked.parse(musicalDna);

		console.log('[SOUND PROFILE API] Updating database');
		await db
			.update(userTable)
			.set({ soundProfile, musicalDna: musicalDnaHtml })
			.where(eq(userTable.id, user.id));

		console.log('[SOUND PROFILE API] Success');
		return json({ soundProfile, musicalDna: musicalDnaHtml });
	} catch (e) {
		console.error('[SOUND PROFILE API] Error:', e);
		throw e;
	}
};
