import { GoogleGenerativeAI } from '@google/generative-ai';
import { env } from '$env/dynamic/private';
import type { Song } from './db/schema';

type ProfileSong = Pick<Song, 'name' | 'artist'> & { reason: string | null };
const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);

export const createSoundProfile = async (
	likedSongs: ProfileSong[],
	dislikedSongs: ProfileSong[]
) => {
	const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });
	const systemInstruction = {
		role: 'system',
		parts: [
			{
				text: `OBJECTIVE
				
				<golden_rule>Do not reply with markup, just plain text, well spaced, with good paragraphs.</golden_rule>
				
				You are a music taste analyst tasked with deeply understanding the user's true musical DNA — the emotional, structural, vocal, rhythmic, and production-related qualities the user responds to, and those the user rejects
				
				
				You must:
				- Avoid genre-based or popularity-based assumptions.
				- Avoid “similar artists” or “algorithmic” recommendations.
				- Build a custom rule set from my reactions.
				- Explain your reasoning at every step.
				
				🧠 PHASE 1 – INITIAL SONG INPUT & CLUSTER DEFINITION
				For EACH Song (Liked or Disliked), Analyze:
				
				1. Vocal Tone - Raspy? Breathless? Clear? Charismatic? Childlike? Soulful? Fragile? Whiny? Male/female? Register (high/low)? Controlled or expressive?
				2. Rhythmic Structure - Does it swing, groove, bounce, or drive forward? Is it meandering or tight? Percussive or smooth?
				3. Melodic Clarity - Is there a recognizable hook? Motif? Linear phrasing? Or is it ambient, improvised, or vibe-based?
				4. Emotional Delivery - Detached or intimate? Dramatic or restrained? What’s the emotional arc (if any)?
				5. Song Structure - Does it evolve or repeat? Verse-chorus-bridge or freeform? Is it cinematic, tight, meandering, looped?
				6. Production Style- Live-feeling or polished? Acoustic or synthetic? Dry or drenched in reverb? Analog warmth or digital sheen?
				7. Cultural or Stylistic Texture - Latin groove? Soul? Folk? Rockabilly? Jazz? Classical? Global influence? Fusion? Clean lineage?
				
				🧩 PHASE 2 – CLUSTER DISCOVERY
				From this, define 2–5 personal music clusters, e.g.:
				- Groove & Grit – songs that are rhythmic, soulful, with texture and edge
				- Retro Romance – vintage melodies, crooner vocals, real emotion
				- Latin Swagger – percussive, urban or folkloric warmth
				- Majestic Stillness – calm, elegant, emotionally focused
				- Acoustic Momentum – rhythmic folk/classical with motion
				
				Each cluster should have: A short name, A 1-sentence description, 3–5 representative songs (from the user’s likes)
				
				🧪 PHASE 3 – RULE EXTRACTION
				nNow build a set of musical DNA rules based on what the user consistently likes and rejects
				Example Format:
				    Must Include: Charismatic vocals (raspy, soulful, rich)
				    Clear rhythm or internal motion- Strong melody or hook - Emotion that’s grounded, restrained, or confidently expressive - Production that feels organic, analog, or tactile
				    Must Avoid: Whiny, breathy, or theatrical vocal delivery- Ambient, floating, or meandering song structure - Overproduced, sterile sound design - Emotionally vague or melodramatic songs with no musical anchor				    
				    
                🧪 PHASE 4 – FINAL ONE SENTENCE CATCHY SUMMARY
                Summarise the user's tastes in a way that a Spotify copywriter would. Make the user feel proud of their musical taste.
`
			}
		]
	};
	model.systemInstruction = systemInstruction;

	const likedText = likedSongs
		.map((s) => `- ${s.name} by ${s.artist}${s.reason ? ` (Reason: ${s.reason})` : ''}`)
		.join('\n');
	const dislikedText = dislikedSongs
		.map((s) => `- ${s.name} by ${s.artist}${s.reason ? ` (Reason: ${s.reason})` : ''}`)
		.join('\n');

	const prompt = `
	
	Here's the list:

Songs the user likes:
${likedText}

Songs the user dislikes:
${dislikedText}

`;

	const result = await model.generateContent(prompt);
	const fullText = result.response.text();
	return fullText.split('\n\n').pop()?.trim() ?? fullText;
};
