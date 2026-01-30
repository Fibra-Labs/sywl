import { json, redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { type Song as DbSong, user as userTable, userSongDislike, userSongLike } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { createSoundProfile, aiProvider } from '$lib/server/ai';
import { marked } from 'marked';
import type { RequestHandler } from './$types';
import { trace } from '@opentelemetry/api';
import logger from '$lib/server/logger';
import { setSpanAttributes, setSpanError, getUserContext } from '$lib/server/tracing';
import { env } from '$env/dynamic/private';

const tracer = trace.getTracer('songs-you-will-love');

export const POST: RequestHandler = async ({ locals }) => {
	return tracer.startActiveSpan('api.sound-profile', async (span) => {
		const requestStartTime = Date.now();
		
		try {
			logger.info('[SOUND PROFILE API] Creating sound profile');
			const { user } = locals;
			
			// Set user context attributes
			setSpanAttributes(span, getUserContext(locals));
			
			if (!user) {
				logger.debug('[SOUND PROFILE API] No user, redirecting');
				span.end();
				throw redirect(303, '/');
			}

			logger.debug(`[SOUND PROFILE API] User ID: ${user.id}`);

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

			logger.debug(`[SOUND PROFILE API] Liked songs: ${likedSongs.length}, Disliked songs: ${dislikedSongs.length}`);
			
			// Set profile data attributes
			setSpanAttributes(span, {
				'profile.liked_songs_count': likedSongs.length,
				'profile.disliked_songs_count': dislikedSongs.length,
				'profile.has_liked': likedSongs.length > 0,
				'profile.has_disliked': dislikedSongs.length > 0
			});

			const profileSongs = (songs: (typeof likedSongs | typeof dislikedSongs)) =>
				songs
					.filter((s): s is typeof s & { song: DbSong } => s.song !== null)
					.map((s) => ({ name: s.song.name, artist: s.song.artist, reason: s.reason }));

			// Get AI provider information
			const aiProviderName = env.AI_PROVIDER?.toLowerCase() || 'groq';
			const aiModel = aiProviderName === 'gemini' ? 'gemini-3-flash-preview' : 'llama-3.3-70b-versatile';
			
			setSpanAttributes(span, {
				'ai.provider': aiProviderName,
				'ai.model': aiModel
			});

			logger.debug('[SOUND PROFILE API] Calling AI to create profile');
			let musicalDna: string, soundProfile: string;
			const aiStartTime = Date.now();
			
			try {
				const profileSongsLiked = profileSongs(likedSongs);
				const profileSongsDisliked = profileSongs(dislikedSongs);
				
				// Build prompt for tracking
				const promptParts = [
					'Musical profile generation for user with',
					`${profileSongsLiked.length} liked songs`,
					`and ${profileSongsDisliked.length} disliked songs`
				];
				const estimatedPromptLength = promptParts.join(' ').length +
					JSON.stringify(profileSongsLiked).length +
					JSON.stringify(profileSongsDisliked).length;
				
				setSpanAttributes(span, {
					'ai.prompt_length': estimatedPromptLength
				});
				
				const profile = await createSoundProfile(profileSongsLiked, profileSongsDisliked);
				musicalDna = profile.musicalDna;
				soundProfile = profile.soundProfile;
				
				const aiDuration = Date.now() - aiStartTime;
				
				// Set AI response attributes
				setSpanAttributes(span, {
					'ai.duration_ms': aiDuration,
					'ai.response_length': musicalDna.length + soundProfile.length,
					'profile.created': true
				});
			} catch (e: any) {
				const aiDuration = Date.now() - aiStartTime;
				logger.error(`[SOUND PROFILE API] AI Error: ${e}`);
				
				// Check for rate limiting error
				if (e?.status === 429 || e?.message?.includes('rate limit')) {
					setSpanError(span, e, {
						'ai.duration_ms': aiDuration,
						'profile.created': false,
						'error.type': 'ai_rate_limited'
					});
					span.end();
					return json(
						{ message: 'AI service is currently rate limited. Please try again in a few moments.' },
						{ status: 503 }
					);
				}
				
				// Generic AI error
				setSpanError(span, e, {
					'ai.duration_ms': aiDuration,
					'profile.created': false,
					'error.type': 'ai_error'
				});
				span.end();
				return json(
					{ message: 'Failed to generate sound profile. Please try again later.' },
					{ status: 500 }
				);
			}

			logger.debug('[SOUND PROFILE API] Profile created, parsing markdown');
			const musicalDnaHtml = await marked.parse(musicalDna);

			logger.debug('[SOUND PROFILE API] Updating database');
			const dbStartTime = Date.now();
			await db
				.update(userTable)
				.set({ soundProfile, musicalDna: musicalDnaHtml })
				.where(eq(userTable.id, user.id));
			const dbDuration = Date.now() - dbStartTime;

			const requestDuration = Date.now() - requestStartTime;
			
			// Set final success attributes
			setSpanAttributes(span, {
				'db.update_duration_ms': dbDuration,
				'request.duration_ms': requestDuration
			});

			logger.info('[SOUND PROFILE API] Success');
			span.end();
			return json({ soundProfile, musicalDna: musicalDnaHtml });
		} catch (e) {
			logger.error(`[SOUND PROFILE API] Error: ${e}`);
			const requestDuration = Date.now() - requestStartTime;
			setSpanError(span, e as Error, {
				'request.duration_ms': requestDuration,
				'profile.created': false
			});
			span.end();
			return json(
				{ message: 'An unexpected error occurred. Please try again.' },
				{ status: 500 }
			);
		}
	});
};
