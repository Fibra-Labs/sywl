/**
 * Abstract base class for AI providers
 */

import type { AIProvider, ProfileSong, SoundProfileResult } from '../types';

export abstract class BaseAIProvider implements AIProvider {
	protected apiKey: string;

	constructor(apiKey: string) {
		if (!apiKey) {
			throw new Error(`API key is required for ${this.constructor.name}`);
		}
		this.apiKey = apiKey;
	}

	abstract createSoundProfile(
		likedSongs: ProfileSong[],
		dislikedSongs: ProfileSong[]
	): Promise<SoundProfileResult>;

	abstract recommendSongs(
		likedSongs: ProfileSong[],
		dislikedSongs: ProfileSong[],
		musicalDna: string | null,
		sourceSongs?: ProfileSong[]
	): Promise<[string, string, string][]>;
}
