import type { user } from '$lib/server/db/schema';

declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			user: typeof user.$inferSelect | undefined;
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};