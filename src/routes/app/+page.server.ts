import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import {
	song as songTable,
	user as userTable,
	userSongDislike,
	userSongLike,
	type Song as DbSong
} from '$lib/server/db/schema';
import { and, desc, eq } from 'drizzle-orm';
import { getMySavedTracks, spotifyFetch, type Song } from '$lib/server/spotify';

export const load: PageServerLoad = async ({ parent }) => {
	const { user } = await parent();
	if (!user) {
		throw redirect(303, '/');
	}

	const [likedSongsFromDb, dislikedSongsFromDb] = await Promise.all([
		db.query.userSongLike.findMany({
			where: eq(userSongLike.userId, user.id),
			orderBy: [desc(userSongLike.createdAt)],
			with: {
				song: true
			}
		}),
		db.query.userSongDislike.findMany({
			where: eq(userSongDislike.userId, user.id),
			with: {
				song: true
			}
		})
	]);

	const likedSongs = likedSongsFromDb
		.filter((like): like is typeof like & { song: DbSong } => like.song !== null)
		.map((like) => ({
			...like.song,
			reason: like.reason,
			createdAt: like.createdAt
		}));

	const dislikedSongs = dislikedSongsFromDb
		.filter((dislike): dislike is typeof dislike & { song: DbSong } => dislike.song !== null)
		.map((dislike) => ({
			...dislike.song,
			reason: dislike.reason,
			createdAt: dislike.createdAt
		}));

	return {
		likedSongs,
		dislikedSongs,
		soundProfile: user.soundProfile
	};
};

export const actions: Actions = {
	search: async ({ request, locals, fetch }) => {
		const { user } = locals;
		if (!user) {
			throw redirect(303, '/');
		}

		const formData = await request.formData();
		const query = formData.get('query');

		if (!query || typeof query !== 'string') {
			return fail(400, { query, missing: true });
		}

		const searchParams = new URLSearchParams({
			q: query,
			type: 'track',
			limit: '10'
		});

		const response = await spotifyFetch(
			fetch,
			`https://api.spotify.com/v1/search?${searchParams.toString()}`,
			user
		);

		if (!response.ok) {
			const errorJson = await response.json();
			throw error(response.status, errorJson.error.message);
		}

		const data = await response.json();

		return { searchResults: data.tracks.items };
	},

	dislikeSong: async ({ request, locals }) => {
		const { user } = locals;
		if (!user) {
			throw redirect(303, '/');
		}

		const formData = await request.formData();
		const songData = formData.get('song');

		if (!songData || typeof songData !== 'string') {
			return fail(400, { message: 'Invalid song data' });
		}

		const song: SpotifyApi.TrackObjectFull = JSON.parse(songData);

		await db
			.insert(songTable)
			.values({
				id: song.id,
				name: song.name,
				artist: song.artists.map((a) => a.name).join(', '),
				album: song.album.name,
				imageUrl: song.album.images.length > 0 ? song.album.images[0].url : null
			})
			.onConflictDoNothing();

		await db
			.insert(userSongDislike)
			.values({
				userId: user.id,
				songId: song.id,
				createdAt: new Date()
			})
			.onConflictDoNothing();

		return { success: true };
	},

	saveLikeReason: async ({ request, locals }) => {
		const { user } = locals;
		if (!user) {
			throw redirect(303, '/');
		}

		const formData = await request.formData();
		const songId = formData.get('songId');
		const reason = formData.get('reason');

		if (!songId || typeof songId !== 'string' || typeof reason !== 'string') {
			return fail(400, { message: 'Invalid input' });
		}

		await db
			.update(userSongLike)
			.set({ reason })
			.where(and(eq(userSongLike.userId, user.id), eq(userSongLike.songId, songId)));

		return { success: true, songId };
	},

	removeDislike: async ({ request, locals }) => {
		const { user } = locals;
		if (!user) {
			throw redirect(303, '/');
		}

		const formData = await request.formData();
		const songId = formData.get('songId');

		if (!songId || typeof songId !== 'string') {
			return fail(400, { message: 'Invalid song ID' });
		}

		await db
			.delete(userSongDislike)
			.where(and(eq(userSongDislike.userId, user.id), eq(userSongDislike.songId, songId)));

		return { success: true, removedSongId: songId };
	},

	removeLike: async ({ request, locals }) => {
		const { user } = locals;
		if (!user) {
			throw redirect(303, '/');
		}

		const formData = await request.formData();
		const songId = formData.get('songId');

		if (!songId || typeof songId !== 'string') {
			return fail(400, { message: 'Invalid song ID' });
		}

		await db
			.delete(userSongLike)
			.where(and(eq(userSongLike.userId, user.id), eq(userSongLike.songId, songId)));

		return { success: true, removedSongId: songId };
	},

	saveDislikeReason: async ({ request, locals }) => {
		const { user } = locals;
		if (!user) {
			throw redirect(303, '/');
		}

		const formData = await request.formData();
		const songId = formData.get('songId');
		const reason = formData.get('reason');

		if (!songId || typeof songId !== 'string' || typeof reason !== 'string') {
			return fail(400, { message: 'Invalid input' });
		}

		await db
			.update(userSongDislike)
			.set({ reason })
			.where(and(eq(userSongDislike.userId, user.id), eq(userSongDislike.songId, songId)));

		return { success: true, songId };
	},

	resync: async ({ locals, fetch }) => {
		const { user } = locals;
		if (!user) {
			throw redirect(303, '/');
		}

		const spotifyLikedSongs = await getMySavedTracks(fetch, user);

		if (spotifyLikedSongs.length > 0) {
			await db.insert(songTable).values(spotifyLikedSongs).onConflictDoNothing();
			const likeRecords = spotifyLikedSongs.map((s) => ({
				userId: user.id,
				songId: s.id,
				createdAt: new Date()
			}));
			await db.insert(userSongLike).values(likeRecords).onConflictDoNothing();
		}

		return { success: true };
	}
};
