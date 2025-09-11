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
			orderBy: [desc(userSongDislike.createdAt)],
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
		soundProfile: user.soundProfile,
		musicalDna: user.musicalDna
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
			return { searchResults: [] };
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
		const reason = formData.get('reason');

		if (!songData || typeof songData !== 'string' || typeof reason !== 'string') {
			return fail(400, { message: 'Invalid input' });
		}

		const song: SpotifyApi.TrackObjectFull = JSON.parse(songData);

		await db
			.insert(songTable)
			.values({
				id: song.id,
				name: song.name,
				artist: song.artists?.map((a) => a.name).join(', ') ?? 'Unknown Artist',
				album: song.album?.name ?? 'Single',
				imageUrl: song.album?.images?.[0]?.url ?? null
			})
			.onConflictDoNothing();

		await db
			.insert(userSongDislike)
			.values({
				userId: user.id,
				songId: song.id,
				reason,
				createdAt: new Date()
			})
			.onConflictDoNothing();

		return { success: true };
	},

	likeSong: async ({ request, locals, fetch }) => {
		const { user } = locals;
		if (!user) {
			throw redirect(303, '/');
		}

		const formData = await request.formData();
		const songData = formData.get('song');
		const reason = formData.get('reason');

		if (!songData || typeof songData !== 'string' || typeof reason !== 'string') {
			return fail(400, { message: 'Invalid input' });
		}

		const song: SpotifyApi.TrackObjectFull = JSON.parse(songData);

		await db
			.insert(songTable)
			.values({
				id: song.id,
				name: song.name,
				artist: song.artists.map((a) => a.name).join(', '),
				album: song.album?.name ?? 'Single',
				imageUrl: song.album?.images?.[0]?.url ?? null
			})
			.onConflictDoNothing();

		await spotifyFetch(
			fetch,
			`https://api.spotify.com/v1/me/tracks?ids=${song.id}`,
			user,
			{
				method: 'PUT'
			}
		);

		await db.insert(userSongLike).values({ userId: user.id, songId: song.id, reason, createdAt: new Date() }).onConflictDoNothing();

		return { success: true, likedSongId: song.id };
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
	},

	recommendSongs: async ({ locals, fetch }) => {
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

		const { recommendSongs } = await import('$lib/server/google');
		const recommendations = await recommendSongs(
			profileSongs(likedSongs),
			profileSongs(dislikedSongs),
			user.musicalDna,
			undefined
		);

		const searchPromises = recommendations.map(([song, artist]) => {
			const query = `track:"${song}" artist:"${artist}"`;

			const searchParams = new URLSearchParams({
				q: query,
				type: 'track',
				limit: '1'
			});
			return spotifyFetch(fetch, `https://api.spotify.com/v1/search?${searchParams}`, user);
		});

		const searchResults = await Promise.all(searchPromises);
		const searchJson = await Promise.all(searchResults.map((res) => res.json()));

		const recommendedTracks = searchJson
			.map((j, i) => {
				const track = j.tracks?.items[0];
				if (track) {
					return { track, explanation: recommendations[i][2] };
				}
				// Create a placeholder track if not found on Spotify
				return {
					track: {
						id: `ai-rec-${i}-${Date.now()}`, // Unique ID for Svelte key
						name: recommendations[i][0],
						artists: [{ name: recommendations[i][1] } as SpotifyApi.ArtistObjectSimplified],
						album: { images: [] },
						external_urls: { spotify: '' }
					},
					explanation: 'This song is not available on Spotify.'
				};
			});

		return { recommendedTracks };
	},

	recommendFromSong: async ({ request, locals, fetch }) => {
		const { user } = locals;
		if (!user) {
			throw redirect(303, '/');
		}

		const formData = await request.formData();
		const songId = formData.get('songId');

		if (!songId || typeof songId !== 'string') {
			return fail(400, { message: 'Invalid song ID' });
		}

		const [likedSongs, dislikedSongs, sourceSongLike] = await Promise.all([
			db.query.userSongLike.findMany({
				where: eq(userSongLike.userId, user.id),
				with: { song: true }
			}),
			db.query.userSongDislike.findMany({
				where: eq(userSongDislike.userId, user.id),
				with: { song: true }
			}),
			db.query.userSongLike.findFirst({
				where: and(eq(userSongLike.userId, user.id), eq(userSongLike.songId, songId)),
				with: { song: true }
			})
		]);

		if (!sourceSongLike?.song) {
			return fail(404, { message: 'Source song not found in your liked songs.' });
		}

		const profileSongs = (songs: (typeof likedSongs | typeof dislikedSongs)) =>
			songs
				.filter((s): s is typeof s & { song: DbSong } => s.song !== null)
				.map((s) => ({ name: s.song.name, artist: s.song.artist, reason: s.reason }));

		const { recommendSongs } = await import('$lib/server/google');
		const recommendations = await recommendSongs(
			profileSongs(likedSongs),
			profileSongs(dislikedSongs),
			user.musicalDna,
			{ name: sourceSongLike.song.name, artist: sourceSongLike.song.artist, reason: sourceSongLike.reason }
		);

		const searchPromises = recommendations.map(([song, artist]) => {
			const query = `track:"${song}" artist:"${artist}"`;
			const searchParams = new URLSearchParams({ q: query, type: 'track', limit: '1' });
			return spotifyFetch(fetch, `https://api.spotify.com/v1/search?${searchParams}`, user);
		});

		const searchResults = await Promise.all(searchPromises);
		const searchJson = await Promise.all(searchResults.map((res) => res.json()));

		const recommendedTracks = searchJson.map((j, i) => {
			const track = j.tracks?.items[0];
			if (track) {
				return { track, explanation: recommendations[i][2] };
			}
			return {
				track: {
					id: `ai-rec-${i}-${Date.now()}`,
					name: recommendations[i][0],
					artists: [{ name: recommendations[i][1] } as SpotifyApi.ArtistObjectSimplified],
					album: { images: [] },
					external_urls: { spotify: '' }
				},
				explanation: 'This song is not available on Spotify.'
			};
		});

		return { recommendedTracks };
	}
};
