/**
 * Utility functions for parsing AI responses
 * Extracted from original groq.ts implementation
 */

/**
 * Parse song recommendations from AI response text
 * Expected format: "Song Title | Artist Name | Explanation"
 * 
 * Also handles fallback formats:
 * - "Song Title – Artist Name | Explanation" (en-dash)
 * - "Song Title - Artist Name | Explanation" (regular dash)
 */
export function parseSongRecommendations(text: string): [string, string, string][] {
	return text
		.split('\n')
		.filter((line) => {
			// First check if it's in the correct format with 3 parts
			if (line.split(' | ').length === 3) return true;

			// Fallback: Check if it's using en-dash format (Title – Artist | Description)
			// and try to parse it into 3 parts
			if (line.includes(' | ') && (line.includes(' – ') || line.includes(' - '))) {
				const parts = line.split(' | ');
				if (parts.length === 2) {
					// Could be "Title – Artist | Description" format
					const firstPart = parts[0];
					if (firstPart.includes(' – ') || firstPart.includes(' - ')) {
						return true;
					}
				}
			}

			return false;
		})
		.map((line) => {
			const parts = line.split(' | ');

			// If already in correct format, return as is
			if (parts.length === 3) {
				return parts as [string, string, string];
			}

			// Fallback: Handle "Title – Artist | Description" format
			if (parts.length === 2) {
				const firstPart = parts[0];
				let songTitle: string;
				let artist: string;

				// Try en-dash first
				if (firstPart.includes(' – ')) {
					[songTitle, artist] = firstPart.split(' – ').map((s) => s.trim());
				} else if (firstPart.includes(' - ')) {
					// Fallback to regular dash
					[songTitle, artist] = firstPart.split(' - ').map((s) => s.trim());
				} else {
					// Can't parse, return original
					return parts as unknown as [string, string, string];
				}

				return [songTitle, artist, parts[1]] as [string, string, string];
			}

			return parts as [string, string, string];
		});
}
