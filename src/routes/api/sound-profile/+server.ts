import { json, redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { user as userTable, userSongDislike, userSongLike, type Song as DbSong } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { createSoundProfile } from '$lib/server/google';
import { marked } from 'marked';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ locals }) => {
	const { user } = locals;
	if (!user) {
		throw redirect(303, '/');
	}

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

	const profileSongs = (songs: (typeof likedSongs | typeof dislikedSongs)) =>
		songs
			.filter((s): s is typeof s & { song: DbSong } => s.song !== null)
			.map((s) => ({ name: s.song.name, artist: s.song.artist, reason: s.reason }));
	const { musicalDna, soundProfile } = await createSoundProfile(
		profileSongs(likedSongs),
		profileSongs(dislikedSongs)
	);

	const musicalDnaHtml = await marked.parse(musicalDna);

	await db
		.update(userTable)
		.set({ soundProfile, musicalDna: musicalDnaHtml })
		.where(eq(userTable.id, user.id));

	return json({ soundProfile, musicalDna: musicalDnaHtml });
};