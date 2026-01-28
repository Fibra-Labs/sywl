import { db } from '$lib/server/db';
import { user } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
	const sessionId = event.cookies.get('session_id') as string;
	console.log('[HOOKS] Request:', event.url.pathname, '- Session ID:', sessionId ? 'present' : 'absent');

	if (sessionId) {
		try {
			const currentUser = await db.query.user.findFirst({ where: eq(user.id, sessionId) });
			if (currentUser) {
				console.log('[HOOKS] User authenticated:', currentUser.id);
				event.locals.user = currentUser;
			} else {
				console.log('[HOOKS] Session ID present but user not found');
			}
		} catch (e) {
			console.error('[HOOKS] Error fetching user:', e);
		}
	}

	return resolve(event);
};
