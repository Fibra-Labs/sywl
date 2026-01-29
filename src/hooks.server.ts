import { db } from '$lib/server/db';
import { user } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import type { Handle } from '@sveltejs/kit';
import logger from '$lib/server/logger';

export const handle: Handle = async ({ event, resolve }) => {
	const sessionId = event.cookies.get('session_id') as string;

	// Wrap the request handling in user context
	// This makes user_id (and trace info) automatically available to all logs
	return logger.withUserContext(
		sessionId || 'guest',
		async () => {
			logger.info(`[HOOKS] Request: ${event.url.pathname} - Session ID: ${sessionId ? 'present' : 'absent'}`);

			if (sessionId) {
				try {
					const currentUser = await db.query.user.findFirst({ where: eq(user.id, sessionId) });
					if (currentUser) {
						logger.info(`[HOOKS] User authenticated: ${currentUser.id}`);
						event.locals.user = currentUser;
						
						// Update context with actual user info if authenticated
						return logger.withUserContext(
							currentUser.id,
							() => resolve(event)
						);
					} else {
						logger.warn('[HOOKS] Session ID present but user not found');
					}
				} catch (e) {
					logger.error(`[HOOKS] Error fetching user: ${e}`);
				}
			}

			return resolve(event);
		}
	);
};
