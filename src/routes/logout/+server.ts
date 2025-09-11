import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ cookies }) => {
	cookies.delete('session_id', { path: '/' });
	throw redirect(303, '/');
};