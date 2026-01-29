/**
 * Gemini AI Provider Implementation using Vercel AI SDK
 */

import { generateText } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
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
import type {GoogleGenerativeAIModelId} from "@ai-sdk/google/internal";

export class GeminiProvider extends BaseAIProvider {
	private google;
	private model: GoogleGenerativeAIModelId = "gemini-3-flash-preview";

	constructor(apiKey: string) {
		super(apiKey);
		this.google = createGoogleGenerativeAI({ apiKey });
	}

	async createSoundProfile(
		likedSongs: ProfileSong[],
		dislikedSongs: ProfileSong[]
	): Promise<SoundProfileResult> {
		const prompt = buildProfileCreationPrompt(likedSongs, dislikedSongs);

		// Generate the main musical DNA profile
		const { text: musicalDna } = await generateText({
			model: this.google(this.model),
			system: SYSTEM_INSTRUCTION,
			prompt,
			temperature: 0.7,
			maxOutputTokens: 8192
		});

		// Generate the summary
		const summaryPrompt = buildSummaryPrompt(musicalDna);
		const { text: soundProfile } = await generateText({
			model: this.google(this.model),
			system: SUMMARY_SYSTEM_INSTRUCTION,
			prompt: summaryPrompt,
			temperature: 0.7,
			maxOutputTokens: 512
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
		const prompt = buildRecommendationPrompt(likedSongs, dislikedSongs, musicalDna, sourceSongs);

		console.log(`[GEMINI] Prompt: ${prompt}`);

		const { text } = await generateText({
			model: this.google(this.model),
			system: SYSTEM_INSTRUCTION,
			prompt,
			temperature: 0.8
		});

		console.log('[SONGS RECOMMENDATIONS] Response', text);

		return parseSongRecommendations(text);
	}
}
