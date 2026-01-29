/**
 * AI Provider Factory
 * Exports unified interface for AI operations
 */

import { env } from '$env/dynamic/private';
import { GeminiProvider } from './providers/gemini';
import { GroqProvider } from './providers/groq';
import type { AIProvider } from './types';

/**
 * Get the AI provider based on environment configuration
 */
function getAIProvider(): AIProvider {
	const provider = env.AI_PROVIDER?.toLowerCase() || 'groq';

	switch (provider) {
		case 'gemini':
			if (!env.GEMINI_API_KEY) {
				throw new Error('GEMINI_API_KEY is not set in environment variables');
			}
			return new GeminiProvider(env.GEMINI_API_KEY);

		case 'groq':
			if (!env.GROQ_API_KEY) {
				throw new Error('GROQ_API_KEY is not set in environment variables');
			}
			return new GroqProvider(env.GROQ_API_KEY);

		default:
			throw new Error(`Unknown AI provider: ${provider}. Valid options are: groq, gemini`);
	}
}

// Create singleton instance
const aiProvider = getAIProvider();

// Export functions that match the original groq.ts interface
export const createSoundProfile = aiProvider.createSoundProfile.bind(aiProvider);
export const recommendSongs = aiProvider.recommendSongs.bind(aiProvider);

// Also export the provider itself for advanced usage
export { aiProvider };

// Re-export types for convenience
export type { ProfileSong, SoundProfileResult } from './types';
