import { json, redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { type Song as DbSong, user as userTable, userSongDislike, userSongLike } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { createSoundProfile } from '$lib/server/groq';
import { marked } from 'marked';
import type { RequestHandler } from './$types';
import { trace } from '@opentelemetry/api';
import logger from '$lib/server/logger';

const tracer = trace.getTracer('sywl');

export const POST: RequestHandler = async ({ locals }) => {
	return tracer.startActiveSpan('api.sound-profile', async (span) => {
		try {
			logger.info('[SOUND PROFILE API] Creating sound profile');
			const { user } = locals;
			if (!user) {
				logger.debug('[SOUND PROFILE API] No user, redirecting');
				span.end();
				throw redirect(303, '/');
			}

			logger.debug(`[SOUND PROFILE API] User ID: ${user.id}`);
			span.setAttribute('user.id', user.id);

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
			span.setAttribute('profile.liked_count', likedSongs.length);
			span.setAttribute('profile.disliked_count', dislikedSongs.length);

			const profileSongs = (songs: (typeof likedSongs | typeof dislikedSongs)) =>
				songs
					.filter((s): s is typeof s & { song: DbSong } => s.song !== null)
					.map((s) => ({ name: s.song.name, artist: s.song.artist, reason: s.reason }));

			logger.debug('[SOUND PROFILE API] Calling AI to create profile');
			let musicalDna: string, soundProfile: string;
			try {
				const profile = await createSoundProfile(
					profileSongs(likedSongs),
					profileSongs(dislikedSongs)
				);
				musicalDna = profile.musicalDna;
				soundProfile = profile.soundProfile;
			} catch (e: any) {
				logger.error(`[SOUND PROFILE API] Groq API Error: ${e}`);
				span.recordException(e as Error);
				span.end();
				
				// Check for rate limiting error
				if (e?.status === 429 || e?.message?.includes('rate limit')) {
					return json(
						{ message: 'AI service is currently rate limited. Please try again in a few moments.' },
						{ status: 503 }
					);
				}
				
				// Generic AI error
				return json(
					{ message: 'Failed to generate sound profile. Please try again later.' },
					{ status: 500 }
				);
			}

			logger.debug('[SOUND PROFILE API] Profile created, parsing markdown');
			const musicalDnaHtml = await marked.parse(musicalDna);

			logger.debug('[SOUND PROFILE API] Updating database');
			await db
				.update(userTable)
				.set({ soundProfile, musicalDna: musicalDnaHtml })
				.where(eq(userTable.id, user.id));

			logger.info('[SOUND PROFILE API] Success');
			span.end();
			return json({ soundProfile, musicalDna: musicalDnaHtml });
		} catch (e) {
			logger.error(`[SOUND PROFILE API] Error: ${e}`);
			span.recordException(e as Error);
			span.end();
			return json(
				{ message: 'An unexpected error occurred. Please try again.' },
				{ status: 500 }
			);
		}
	});
};
