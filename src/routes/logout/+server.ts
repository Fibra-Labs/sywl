import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { trace, SpanStatusCode } from '@opentelemetry/api';
import { setSpanAttributes, setSpanError } from '$lib/server/tracing';
import { db } from '$lib/server/db';
import { user as userTable } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

const tracer = trace.getTracer('songs-you-will-love');

export const GET: RequestHandler = async ({ cookies }) => {
	return tracer.startActiveSpan('auth.logout', async (span) => {
		try {
			const sessionId = cookies.get('session_id');
			const hadSession = !!sessionId;

			// Get user ID before clearing session
			let userId: string | undefined;
			if (sessionId) {
				const user = await db.query.user.findFirst({
					where: eq(userTable.id, sessionId)
				});
				userId = user?.id;
			}

			// Set attributes
			setSpanAttributes(span, {
				'user.id': userId || undefined,
				'session.cleared': true
			});

			// Clear the session cookie
			cookies.delete('session_id', { path: '/' });

			span.setStatus({ code: SpanStatusCode.OK });
			span.end();
			throw redirect(303, '/');
		} catch (error) {
			// If it's a redirect, re-throw
			if (error instanceof Response || (error as any).status) {
				throw error;
			}
			
			// For actual errors, record them
			setSpanError(span, error);
			span.end();
			throw error;
		}
	});
};
