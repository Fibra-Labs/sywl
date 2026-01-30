import {error, fail, redirect} from '@sveltejs/kit';
import type {Actions, PageServerLoad} from './$types';
import {db} from '$lib/server/db';
import {song as songTable, type Song as DbSong, userSongDislike, userSongLike} from '$lib/server/db/schema';
import {and, desc, eq} from 'drizzle-orm';
import {getMySavedTracks, spotifyFetch} from '$lib/server/spotify';
import logger from '$lib/server/logger';
import {trace} from '@opentelemetry/api';
import {getUserContext, setSpanAttributes, setSpanError} from '$lib/server/tracing';

const tracer = trace.getTracer('songs-you-will-love');

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
        return tracer.startActiveSpan('action.song.dislike', async (span) => {
            const requestStart = Date.now();
            
            try {
                const {user} = locals;
                if (!user) {
                    span.end();
                    throw redirect(303, '/');
                }

                // Set user context
                setSpanAttributes(span, getUserContext(locals));

                const formData = await request.formData();
                const songData = formData.get('song');
                const reason = formData.get('reason');

                if (!songData || typeof songData !== 'string' || typeof reason !== 'string') {
                    span.setAttribute('action.success', false);
                    span.end();
                    return fail(400, {message: 'Invalid input'});
                }

                const song: SpotifyApi.TrackObjectFull = JSON.parse(songData);

                // Set song attributes
                setSpanAttributes(span, {
                    'song.id': song.id,
                    'song.title': song.name,
                    'song.artist': song.artists?.map((a) => a.name).join(', ') ?? 'Unknown Artist'
                });

                const dbStart = Date.now();
                
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

                const dbDuration = Date.now() - dbStart;

                // Set success attributes
                setSpanAttributes(span, {
                    'action.success': true,
                    'db.operation': 'insert',
                    'db.duration_ms': dbDuration,
                    'request.duration_ms': Date.now() - requestStart
                });

                return {success: true};
            } catch (error) {
                setSpanError(span, error, {
                    'request.duration_ms': Date.now() - requestStart
                });
                throw error;
            } finally {
                span.end();
            }
        });
    },

    likeSong: async ({request, locals, fetch}) => {
        return tracer.startActiveSpan('action.song.like', async (span) => {
            const requestStart = Date.now();
            
            try {
                logger.info('[APP PAGE ACTION] likeSong started');
                const {user} = locals;
                if (!user) {
                    logger.info('[APP PAGE ACTION] likeSong: no user');
                    span.end();
                    throw redirect(303, '/');
                }

                // Set user context
                setSpanAttributes(span, getUserContext(locals));

                const formData = await request.formData();
                const songData = formData.get('song');
                const reason = formData.get('reason');

                if (!songData || typeof songData !== 'string' || typeof reason !== 'string') {
                    logger.info('[APP PAGE ACTION] likeSong: invalid input');
                    span.setAttribute('action.success', false);
                    span.end();
                    return fail(400, {message: 'Invalid input'});
                }

                const song: SpotifyApi.TrackObjectFull = JSON.parse(songData);
                logger.info(`[APP PAGE ACTION] likeSong: ${song.id}`);

                // Set song attributes
                setSpanAttributes(span, {
                    'song.id': song.id,
                    'song.title': song.name,
                    'song.artist': song.artists.map((a) => a.name).join(', ')
                });

                const dbStart = Date.now();

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

                const dbDuration = Date.now() - dbStart;

                // Set success attributes
                setSpanAttributes(span, {
                    'action.success': true,
                    'db.operation': 'insert',
                    'db.duration_ms': dbDuration,
                    'request.duration_ms': Date.now() - requestStart
                });

                logger.info('[APP PAGE ACTION] likeSong: success');
                return {success: true, likedSongId: song.id};
            } catch (e) {
                logger.error(`[APP PAGE ACTION] likeSong error: ${e}`);
                setSpanError(span, e, {
                    'request.duration_ms': Date.now() - requestStart
                });
                throw e;
            } finally {
                span.end();
            }
        });
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
        return tracer.startActiveSpan('action.song.remove', async (span) => {
            const requestStart = Date.now();
            
            try {
                const {user} = locals;
                if (!user) {
                    span.end();
                    throw redirect(303, '/');
                }

                // Set user context
                setSpanAttributes(span, getUserContext(locals));

                const formData = await request.formData();
                const songId = formData.get('songId');

                if (!songId || typeof songId !== 'string') {
                    span.setAttribute('action.success', false);
                    span.end();
                    return fail(400, {message: 'Invalid song ID'});
                }

                // Set song ID attribute
                span.setAttribute('song.id', songId);

                const dbStart = Date.now();

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

                const dbDuration = Date.now() - dbStart;

                // Set success attributes
                setSpanAttributes(span, {
                    'action.success': true,
                    'db.operation': 'delete',
                    'db.duration_ms': dbDuration,
                    'request.duration_ms': Date.now() - requestStart
                });

                return {success: true, removedSongId: songId};
            } catch (error) {
                setSpanError(span, error, {
                    'request.duration_ms': Date.now() - requestStart
                });
                throw error;
            } finally {
                span.end();
            }
        });
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
        return tracer.startActiveSpan('action.sync.spotify_liked_songs', async (span) => {
            const requestStart = Date.now();
            
            try {
                const {user} = locals;
                if (!user) {
                    span.end();
                    throw redirect(303, '/');
                }

                // Set user context
                setSpanAttributes(span, getUserContext(locals));
                span.setAttribute('sync.source', 'spotify_liked_songs');

                const spotifyApiStart = Date.now();
                const spotifyLikedSongs = await getMySavedTracks(fetch, user);
                const spotifyApiDuration = Date.now() - spotifyApiStart;

                span.setAttribute('spotify.api_duration_ms', spotifyApiDuration);
                span.setAttribute('spotify.songs_fetched', spotifyLikedSongs.length);

                let songsInserted = 0;
                let songsUpdated = 0;

                if (spotifyLikedSongs.length > 0) {
                    const dbStart = Date.now();
                    
                    // Insert songs
                    await db.insert(songTable).values(spotifyLikedSongs).onConflictDoNothing();
                    songsInserted = spotifyLikedSongs.length;
                    
                    // Insert like records
                    const likeRecords = spotifyLikedSongs.map((s) => ({
                        userId: user.id,
                        songId: s.id,
                        createdAt: new Date()
                    }));
                    await db.insert(userSongLike).values(likeRecords).onConflictDoNothing();

                    const dbDuration = Date.now() - dbStart;

                    // Set DB attributes
                    setSpanAttributes(span, {
                        'db.songs_inserted': songsInserted,
                        'db.songs_updated': songsUpdated,
                        'db.duration_ms': dbDuration
                    });
                }

                // Set success attributes
                setSpanAttributes(span, {
                    'sync.success': true,
                    'request.duration_ms': Date.now() - requestStart
                });

                return {success: true};
            } catch (error) {
                setSpanError(span, error, {
                    'sync.success': false,
                    'request.duration_ms': Date.now() - requestStart
                });
                throw error;
            } finally {
                span.end();
            }
        });
    },

    recommendSongs: async ({locals, fetch}) => {
        return tracer.startActiveSpan('action.recommendation.get', async (span) => {
            const requestStart = Date.now();
            
            try {
                logger.info('[APP PAGE ACTION] recommendSongs started');
                const {user} = locals;
                if (!user) {
                    logger.info('[APP PAGE ACTION] recommendSongs: no user');
                    span.end();
                    throw redirect(303, '/');
                }

                // Set user context
                setSpanAttributes(span, getUserContext(locals));
                setSpanAttributes(span, {
                    'recommendation.type': 'profile_based',
                    'recommendation.has_musical_dna': !!user.musicalDna
                });

                const dbStart = Date.now();
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
                const dbDuration = Date.now() - dbStart;

                logger.info(`[APP PAGE ACTION] recommendSongs: found ${likedSongs.length} likes, ${dislikedSongs.length} dislikes`);

                setSpanAttributes(span, {
                    'db.duration_ms': dbDuration,
                    'profile.liked_songs': likedSongs.length,
                    'profile.disliked_songs': dislikedSongs.length
                });

                const profileSongs = (songs: (typeof likedSongs | typeof dislikedSongs)) =>
                    songs
                        .filter((s): s is typeof s & { song: DbSong } => s.song !== null)
                        .map((s) => ({name: s.song.name, artist: s.song.artist, reason: s.reason}));

                logger.info('[APP PAGE ACTION] recommendSongs: calling AI');
                const aiStart = Date.now();
                const {recommendSongs} = await import('$lib/server/ai');
                const recommendations = await recommendSongs(
                    profileSongs(likedSongs),
                    profileSongs(dislikedSongs),
                    user.musicalDna,
                    undefined
                );
                const aiDuration = Date.now() - aiStart;

                logger.info(`[APP PAGE ACTION] recommendSongs: got ${recommendations.length} recommendations`);

                setSpanAttributes(span, {
                    'ai.duration_ms': aiDuration,
                    'ai.recommendations_count': recommendations.length
                });

                const spotifyStart = Date.now();
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
                const spotifyDuration = Date.now() - spotifyStart;

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

                const foundCount = recommendedTracks.filter(r => !r.track.id.startsWith('ai-rec-')).length;

                setSpanAttributes(span, {
                    'spotify.api_duration_ms': spotifyDuration,
                    'spotify.tracks_found': foundCount,
                    'spotify.tracks_not_found': recommendations.length - foundCount,
                    'recommendation.success': true,
                    'request.duration_ms': Date.now() - requestStart
                });

                logger.info('[APP PAGE ACTION] recommendSongs: success');
                return {recommendedTracks};
            } catch (e) {
                logger.error(`[APP PAGE ACTION] recommendSongs error: ${e}`);
                setSpanError(span, e, {
                    'recommendation.success': false,
                    'request.duration_ms': Date.now() - requestStart
                });
                // Return user-friendly error instead of crashing
                return fail(503, {
                    message: 'Unable to generate recommendations at this time. This may be due to API rate limiting. Please try again in a few moments.'
                });
            } finally {
                span.end();
            }
        });
    },

    recommendFromSongs: async ({request, locals, fetch}) => {
        return tracer.startActiveSpan('action.recommendation.from_songs', async (span) => {
            const requestStart = Date.now();
            
            try {
                logger.info('[APP PAGE ACTION] recommendFromSongs started');
                const {user} = locals;
                if (!user) {
                    logger.info('[APP PAGE ACTION] recommendFromSongs: no user');
                    span.end();
                    throw redirect(303, '/');
                }

                // Set user context
                setSpanAttributes(span, getUserContext(locals));
                setSpanAttributes(span, {
                    'recommendation.type': 'song_based',
                    'recommendation.has_sound_profile': !!user.soundProfile
                });

                const formData = await request.formData();
                const songsData = formData.get('songs');

                if (!songsData || typeof songsData !== 'string') {
                    logger.info('[APP PAGE ACTION] recommendFromSongs: invalid input');
                    span.setAttribute('recommendation.success', false);
                    span.end();
                    return fail(400, {message: 'Invalid input'});
                }
                
                const sourceSongs: SpotifyApi.TrackObjectFull[] = JSON.parse(songsData);
                logger.info(`[APP PAGE ACTION] recommendFromSongs: source songs: ${sourceSongs.map(s => `${s.name} - ${s.artists[0]?.name}`)}`);

                if (sourceSongs.length === 0) {
                    logger.info('[APP PAGE ACTION] recommendFromSongs: no source songs');
                    span.setAttribute('recommendation.success', false);
                    span.end();
                    return fail(400, {message: 'No source songs provided.'});
                }

                span.setAttribute('recommendation.source_songs_count', sourceSongs.length);

                const dbStart = Date.now();
                const [dislikedSongs] = await Promise.all([
                    db.query.userSongDislike.findMany({
                        where: eq(userSongDislike.userId, user.id),
                        with: {song: true}
                    })
                ]);
                const dbDuration = Date.now() - dbStart;

                setSpanAttributes(span, {
                    'db.duration_ms': dbDuration,
                    'profile.disliked_songs': dislikedSongs.length
                });

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
                const aiStart = Date.now();
                const {recommendSongs} = await import('$lib/server/ai');
                const recommendations = await recommendSongs(
                    [],
                    profileSongs(dislikedSongs),
                    user.soundProfile,
                    sourceSongsForPrompt
                );
                const aiDuration = Date.now() - aiStart;

                logger.info(`[APP PAGE ACTION] recommendFromSongs: got ${recommendations.length} recommendations`);
                logger.info(`[APP PAGE ACTION] recommendFromSongs: recommendations: ${recommendations.map(r => `${r[0]} - ${r[1]}`)}`);

                setSpanAttributes(span, {
                    'ai.duration_ms': aiDuration,
                    'ai.recommendations_count': recommendations.length
                });

                const spotifyStart = Date.now();
                const searchPromises = recommendations.map(([song, artist]) => {
                    const query = `track:"${song}" artist:"${artist}"`;
                    const searchParams = new URLSearchParams({q: query, type: 'track', limit: '1'});
                    return spotifyFetch(fetch, `https://api.spotify.com/v1/search?${searchParams}`, user);
                });

                const searchResults = await Promise.all(searchPromises);
                const searchJson = await Promise.all(searchResults.map((res) => res.json()));
                const spotifyDuration = Date.now() - spotifyStart;

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

                const foundCount = recommendedTracks.filter(r => !r.track.id.startsWith('ai-rec-')).length;

                setSpanAttributes(span, {
                    'spotify.api_duration_ms': spotifyDuration,
                    'spotify.tracks_found': foundCount,
                    'spotify.tracks_not_found': recommendations.length - foundCount,
                    'recommendation.success': true,
                    'request.duration_ms': Date.now() - requestStart
                });

                logger.info('[APP PAGE ACTION] recommendFromSongs: success');
                return {recommendedTracks};
            } catch (e) {
                logger.error(`[APP PAGE ACTION] recommendFromSongs error: ${e}`);
                setSpanError(span, e, {
                    'recommendation.success': false,
                    'request.duration_ms': Date.now() - requestStart
                });
                // Return user-friendly error instead of crashing
                return fail(503, {
                    message: 'Unable to generate recommendations at this time. This may be due to API rate limiting. Please try again in a few moments.'
                });
            } finally {
                span.end();
            }
        });
    }
};
