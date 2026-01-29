import {error, fail, redirect} from '@sveltejs/kit';
import type {Actions, PageServerLoad} from './$types';
import {db} from '$lib/server/db';
import {song as songTable, type Song as DbSong, userSongDislike, userSongLike} from '$lib/server/db/schema';
import {and, desc, eq} from 'drizzle-orm';
import {getMySavedTracks, spotifyFetch} from '$lib/server/spotify';
import logger from '$lib/server/logger';

export const load: PageServerLoad = async ({parent}) => {
    logger.debug('[APP PAGE] Loading app page');
    const {user} = await parent();
    if (!user) {
        logger.debug('[APP PAGE] No user, redirecting');
        throw redirect(303, '/');
    }

    logger.debug(`[APP PAGE] User ID: ${user.id}`);

    try {
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

        logger.info(`[APP PAGE] Loaded ${likedSongs.length} likes, ${dislikedSongs.length} dislikes`);
      
        return {
        	likedSongs,
        	dislikedSongs,
        	soundProfile: user.soundProfile,
        	musicalDna: user.musicalDna
        };
       } catch (e) {
        logger.error(`[APP PAGE] Error loading data: ${e}`);
        // Return default state instead of crashing
        return {
        	likedSongs: [],
        	dislikedSongs: [],
        	soundProfile: null,
        	musicalDna: null
        };
       }
};

export const actions: Actions = {
    search: async ({request, locals, fetch}) => {
        const {user} = locals;
        if (!user) {
            throw redirect(303, '/');
        }

        const formData = await request.formData();
        const query = formData.get('query');

        if (!query || typeof query !== 'string') {
            return {searchResults: []};
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
        	return fail(500, { error: 'Failed to search. Please try again.' });
        }
      
        const data = await response.json();
      
        return {searchResults: data.tracks.items};
    },

    dislikeSong: async ({request, locals}) => {
        const {user} = locals;
        if (!user) {
            throw redirect(303, '/');
        }

        const formData = await request.formData();
        const songData = formData.get('song');
        const reason = formData.get('reason');

        if (!songData || typeof songData !== 'string' || typeof reason !== 'string') {
            return fail(400, {message: 'Invalid input'});
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

        return {success: true};
    },

    likeSong: async ({request, locals, fetch}) => {
        logger.info('[APP PAGE ACTION] likeSong started');
        const {user} = locals;
        if (!user) {
            logger.info('[APP PAGE ACTION] likeSong: no user');
            throw redirect(303, '/');
        }

        try {
            const formData = await request.formData();
            const songData = formData.get('song');
            const reason = formData.get('reason');

            if (!songData || typeof songData !== 'string' || typeof reason !== 'string') {
                logger.info('[APP PAGE ACTION] likeSong: invalid input');
                return fail(400, {message: 'Invalid input'});
            }

            const song: SpotifyApi.TrackObjectFull = JSON.parse(songData);
            logger.info(`[APP PAGE ACTION] likeSong: ${song.id}`);

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

            await db.insert(userSongLike).values({
                userId: user.id,
                songId: song.id,
                reason,
                createdAt: new Date()
            }).onConflictDoNothing();

            logger.info('[APP PAGE ACTION] likeSong: success');
            return {success: true, likedSongId: song.id};
        } catch (e) {
            logger.error(`[APP PAGE ACTION] likeSong error: ${e}`);
            throw e;
        }
    },

    saveLikeReason: async ({request, locals}) => {
        const {user} = locals;
        if (!user) {
            throw redirect(303, '/');
        }

        const formData = await request.formData();
        const songId = formData.get('songId');
        const reason = formData.get('reason');

        if (!songId || typeof songId !== 'string' || typeof reason !== 'string') {
            return fail(400, {message: 'Invalid input'});
        }

        await db
            .update(userSongLike)
            .set({reason})
            .where(and(eq(userSongLike.userId, user.id), eq(userSongLike.songId, songId)));

        return {success: true, songId};
    },

    removeDislike: async ({request, locals}) => {
        const {user} = locals;
        if (!user) {
            throw redirect(303, '/');
        }

        const formData = await request.formData();
        const songId = formData.get('songId');

        if (!songId || typeof songId !== 'string') {
            return fail(400, {message: 'Invalid song ID'});
        }

        await db
            .delete(userSongDislike)
            .where(and(eq(userSongDislike.userId, user.id), eq(userSongDislike.songId, songId)));

        return {success: true, removedSongId: songId};
    },

    removeLike: async ({request, locals, fetch}) => {
        const {user} = locals;
        if (!user) {
            throw redirect(303, '/');
        }

        const formData = await request.formData();
        const songId = formData.get('songId');

        if (!songId || typeof songId !== 'string') {
            return fail(400, {message: 'Invalid song ID'});
        }

        // Remove from Spotify library
        await spotifyFetch(
            fetch,
            `https://api.spotify.com/v1/me/tracks?ids=${songId}`,
            user,
            {
                method: 'DELETE'
            }
        );

        await db
            .delete(userSongLike)
            .where(and(eq(userSongLike.userId, user.id), eq(userSongLike.songId, songId)));

        return {success: true, removedSongId: songId};
    },

    saveDislikeReason: async ({request, locals}) => {
        const {user} = locals;
        if (!user) {
            throw redirect(303, '/');
        }

        const formData = await request.formData();
        const songId = formData.get('songId');
        const reason = formData.get('reason');

        if (!songId || typeof songId !== 'string' || typeof reason !== 'string') {
            return fail(400, {message: 'Invalid input'});
        }

        await db
            .update(userSongDislike)
            .set({reason})
            .where(and(eq(userSongDislike.userId, user.id), eq(userSongDislike.songId, songId)));

        return {success: true, songId};
    },

    resync: async ({locals, fetch}) => {
        const {user} = locals;
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

        return {success: true};
    },

    recommendSongs: async ({locals, fetch}) => {
        logger.info('[APP PAGE ACTION] recommendSongs started');
        const {user} = locals;
        if (!user) {
            logger.info('[APP PAGE ACTION] recommendSongs: no user');
            throw redirect(303, '/');
        }

        try {
            const [likedSongs, dislikedSongs] = await Promise.all([
                db.query.userSongLike.findMany({
                    where: eq(userSongLike.userId, user.id),
                    with: {song: true}
                }),
                db.query.userSongDislike.findMany({
                    where: eq(userSongDislike.userId, user.id),
                    with: {song: true}
                })
            ]);

            logger.info(`[APP PAGE ACTION] recommendSongs: found ${likedSongs.length} likes, ${dislikedSongs.length} dislikes`);

            const profileSongs = (songs: (typeof likedSongs | typeof dislikedSongs)) =>
                songs
                    .filter((s): s is typeof s & { song: DbSong } => s.song !== null)
                    .map((s) => ({name: s.song.name, artist: s.song.artist, reason: s.reason}));

            logger.info('[APP PAGE ACTION] recommendSongs: calling AI');
            const {recommendSongs} = await import('$lib/server/ai');
            const recommendations = await recommendSongs(
                profileSongs(likedSongs),
                profileSongs(dislikedSongs),
                user.musicalDna,
                undefined
            );

            logger.info(`[APP PAGE ACTION] recommendSongs: got ${recommendations.length} recommendations`);

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
                        return {track, explanation: recommendations[i][2]};
                    }
                    // Create a placeholder track if not found on Spotify
                    return {
                        track: {
                            id: `ai-rec-${i}-${Date.now()}`, // Unique ID for Svelte key
                            name: recommendations[i][0],
                            artists: [{name: recommendations[i][1]} as SpotifyApi.ArtistObjectSimplified],
                            album: {images: []},
                            external_urls: {spotify: ''}
                        },
                        explanation: 'This song is not available on Spotify.'
                    };
                });

            logger.info('[APP PAGE ACTION] recommendSongs: success');
            return {recommendedTracks};
        } catch (e) {
            logger.error(`[APP PAGE ACTION] recommendSongs error: ${e}`);
            // Return user-friendly error instead of crashing
            return fail(503, {
                message: 'Unable to generate recommendations at this time. This may be due to API rate limiting. Please try again in a few moments.'
            });
        }
    },

    recommendFromSongs: async ({request, locals, fetch}) => {
        logger.info('[APP PAGE ACTION] recommendFromSongs started');
        const {user} = locals;
        if (!user) {
            logger.info('[APP PAGE ACTION] recommendFromSongs: no user');
            throw redirect(303, '/');
        }

        try {
            const formData = await request.formData();
            const songsData = formData.get('songs');

            if (!songsData || typeof songsData !== 'string') {
                logger.info('[APP PAGE ACTION] recommendFromSongs: invalid input');
                return fail(400, {message: 'Invalid input'});
            }
            const sourceSongs: SpotifyApi.TrackObjectFull[] = JSON.parse(songsData);
            logger.info(`[APP PAGE ACTION] recommendFromSongs: source songs: ${sourceSongs.map(s => `${s.name} - ${s.artists[0]?.name}`)}`);

            const [dislikedSongs] = await Promise.all([
                db.query.userSongDislike.findMany({
                    where: eq(userSongDislike.userId, user.id),
                    with: {song: true}
                })
            ]);

            if (sourceSongs.length === 0) {
                logger.info('[APP PAGE ACTION] recommendFromSongs: no source songs');
                return fail(400, {message: 'No source songs provided.'});
            }

            const profileSongs = (songs: (typeof dislikedSongs)) =>
                songs
                    .filter((s): s is typeof s & { song: DbSong } => s.song !== null)
                    .map((s) => ({name: s.song.name, artist: s.song.artist, reason: s.reason}));

            const sourceSongsForPrompt = sourceSongs.map(s => ({
                name: s.name,
                artist: s.artists.map(a => a.name).join(', '),
                reason: ''
            }));

            logger.info('[APP PAGE ACTION] recommendFromSongs: calling AI');
            const {recommendSongs} = await import('$lib/server/ai');
            const recommendations = await recommendSongs(
                [],
                profileSongs(dislikedSongs),
                user.soundProfile,
                sourceSongsForPrompt
            );

            logger.info(`[APP PAGE ACTION] recommendFromSongs: got ${recommendations.length} recommendations`);
            logger.info(`[APP PAGE ACTION] recommendFromSongs: recommendations: ${recommendations.map(r => `${r[0]} - ${r[1]}`)}`);

            const searchPromises = recommendations.map(([song, artist]) => {
                const query = `track:"${song}" artist:"${artist}"`;
                const searchParams = new URLSearchParams({q: query, type: 'track', limit: '1'});
                return spotifyFetch(fetch, `https://api.spotify.com/v1/search?${searchParams}`, user);
            });

            const searchResults = await Promise.all(searchPromises);
            const searchJson = await Promise.all(searchResults.map((res) => res.json()));

            const recommendedTracks = searchJson.map((j, i) => {
                const track = j.tracks?.items[0];
                if (track) {
                    return {track, explanation: recommendations[i][2]};
                }
                return {
                    track: {
                        id: `ai-rec-${i}-${Date.now()}`,
                        name: recommendations[i][0],
                        artists: [{name: recommendations[i][1]} as SpotifyApi.ArtistObjectSimplified],
                        album: {images: []},
                        external_urls: {spotify: ''}
                    },
                    explanation: 'This song is not available on Spotify.'
                };
            });

            logger.info('[APP PAGE ACTION] recommendFromSongs: success');
            return {recommendedTracks};
        } catch (e) {
            logger.error(`[APP PAGE ACTION] recommendFromSongs error: ${e}`);
            // Return user-friendly error instead of crashing
            return fail(503, {
                message: 'Unable to generate recommendations at this time. This may be due to API rate limiting. Please try again in a few moments.'
            });
        }
    }
};
