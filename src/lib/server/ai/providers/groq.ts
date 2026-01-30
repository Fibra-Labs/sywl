/**
 * Groq AI Provider Implementation using Vercel AI SDK
 */

import { generateText } from 'ai';
import { createGroq } from '@ai-sdk/groq';
import { trace } from '@opentelemetry/api';
import { BaseAIProvider } from './base';
import type { ProfileSong, SoundProfileResult } from '../types';
import {
	SYSTEM_INSTRUCTION,
	SUMMARY_SYSTEM_INSTRUCTION,
	buildProfileCreationPrompt,
	buildSummaryPrompt,
	buildRecommendationPrompt
} from '../prompts';
import { parseSongRecommendations } from '../utils';
import { setSpanAttributes, setSpanError } from '$lib/server/tracing';

const tracer = trace.getTracer('songs-you-will-love');

export class GroqProvider extends BaseAIProvider {
	private groq;
	private model = 'llama-3.3-70b-versatile';

	constructor(apiKey: string) {
		super(apiKey);
		this.groq = createGroq({ apiKey });
	}

	async createSoundProfile(
		likedSongs: ProfileSong[],
		dislikedSongs: ProfileSong[]
	): Promise<SoundProfileResult> {
		const prompt = buildProfileCreationPrompt(likedSongs, dislikedSongs);

		// Generate the main musical DNA profile
		const musicalDna = await tracer.startActiveSpan('ai.provider.groq.generate', async (span) => {
			const temperature = 0.7;
			const maxTokens = 8192;
			const startTime = Date.now();

			try {
				setSpanAttributes(span, {
					'ai.provider': 'groq',
					'ai.model': this.model,
					'ai.prompt_length': prompt.length,
					'ai.temperature': temperature,
					'ai.max_tokens': maxTokens
				});

				const result = await generateText({
					model: this.groq(this.model),
					system: SYSTEM_INSTRUCTION,
					prompt,
					temperature,
					maxOutputTokens: maxTokens
				});

				const durationMs = Date.now() - startTime;
				const responseText = result.text;

				setSpanAttributes(span, {
					'ai.response_length': responseText.length,
					'ai.response_tokens': result.usage?.totalTokens,
					'ai.duration_ms': durationMs,
					'ai.success': true
				});

				return responseText;
			} catch (error) {
				const durationMs = Date.now() - startTime;
				setSpanAttributes(span, {
					'ai.duration_ms': durationMs,
					'ai.success': false
				});
				setSpanError(span, error);
				throw error;
			} finally {
				span.end();
			}
		});

		// Generate the summary
		const summaryPrompt = buildSummaryPrompt(musicalDna);
		const soundProfile = await tracer.startActiveSpan('ai.provider.groq.generate', async (span) => {
			const temperature = 0.7;
			const maxTokens = 512;
			const startTime = Date.now();

			try {
				setSpanAttributes(span, {
					'ai.provider': 'groq',
					'ai.model': this.model,
					'ai.prompt_length': summaryPrompt.length,
					'ai.temperature': temperature,
					'ai.max_tokens': maxTokens
				});

				const result = await generateText({
					model: this.groq(this.model),
					system: SUMMARY_SYSTEM_INSTRUCTION,
					prompt: summaryPrompt,
					temperature,
					maxOutputTokens: maxTokens
				});

				const durationMs = Date.now() - startTime;
				const responseText = result.text;

				setSpanAttributes(span, {
					'ai.response_length': responseText.length,
					'ai.response_tokens': result.usage?.totalTokens,
					'ai.duration_ms': durationMs,
					'ai.success': true
				});

				return responseText;
			} catch (error) {
				const durationMs = Date.now() - startTime;
				setSpanAttributes(span, {
					'ai.duration_ms': durationMs,
					'ai.success': false
				});
				setSpanError(span, error);
				throw error;
			} finally {
				span.end();
			}
		});

		// Fallback if summary is empty
		const finalSoundProfile =
			soundProfile.trim() ||
			'Your musical taste combines diverse influences with a focus on authentic expression and emotional connection.';

		console.log(prompt, musicalDna, finalSoundProfile);

		return {
			musicalDna,
			soundProfile: finalSoundProfile
		};
	}

	async recommendSongs(
		likedSongs: ProfileSong[],
		dislikedSongs: ProfileSong[],
		musicalDna: string | null,
		sourceSongs?: ProfileSong[]
	): Promise<[string, string, string][]> {
		return tracer.startActiveSpan('ai.provider.groq.generate', async (span) => {
			const prompt = buildRecommendationPrompt(likedSongs, dislikedSongs, musicalDna, sourceSongs);
			const temperature = 0.8;
			const maxTokens = undefined; // Not set for this call
			const startTime = Date.now();

			try {
				console.log(`[GROQ] Prompt: ${prompt}`);

				// Set initial span attributes
				setSpanAttributes(span, {
					'ai.provider': 'groq',
					'ai.model': this.model,
					'ai.prompt_length': prompt.length,
					'ai.temperature': temperature,
					'ai.max_tokens': maxTokens
				});

				const result = await generateText({
					model: this.groq(this.model),
					system: SYSTEM_INSTRUCTION,
					prompt,
					temperature
				});

				const durationMs = Date.now() - startTime;
				const responseText = result.text;

				console.log('[SONGS RECOMMENDATIONS] Response', responseText);

				// Set response attributes
				setSpanAttributes(span, {
					'ai.response_length': responseText.length,
					'ai.response_tokens': result.usage?.totalTokens,
					'ai.duration_ms': durationMs,
					'ai.success': true
				});

				return parseSongRecommendations(responseText);
			} catch (error) {
				const durationMs = Date.now() - startTime;
				setSpanAttributes(span, {
					'ai.duration_ms': durationMs,
					'ai.success': false
				});
				setSpanError(span, error);
				throw error;
			} finally {
				span.end();
			}
		});
	}
}
