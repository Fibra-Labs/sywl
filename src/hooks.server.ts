import { db } from '$lib/server/db';
import { user } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
	const sessionId = event.cookies.get('session_id') as string;

	if (sessionId) {
		const currentUser = await db.query.user.findFirst({ where: eq(user.id, sessionId) });
		if (currentUser) {
			event.locals.user = currentUser;
		}
	}

	return resolve(event);
};