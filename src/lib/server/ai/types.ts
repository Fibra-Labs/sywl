/**
 * Core types for AI provider abstraction
 */

export interface ProfileSong {
	name: string;
	artist: string;
	reason: string | null;
}

export interface SoundProfileResult {
	musicalDna: string;
	soundProfile: string;
}

/**
 * Abstract AI Provider interface
 * All AI providers must implement these methods
 */
export interface AIProvider {
	/**
	 * Create a sound profile based on user's liked and disliked songs
	 */
	createSoundProfile(
		likedSongs: ProfileSong[],
		dislikedSongs: ProfileSong[]
	): Promise<SoundProfileResult>;

	/**
	 * Recommend songs based on user's musical DNA
	 * @param sourceSongs - Optional list of songs for hyper-relevant recommendations
	 * @returns Array of [songTitle, artistName, explanation] tuples
	 */
	recommendSongs(
		likedSongs: ProfileSong[],
		dislikedSongs: ProfileSong[],
		musicalDna: string | null,
		sourceSongs?: ProfileSong[]
	): Promise<[string, string, string][]>;
}
