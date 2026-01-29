import type { user } from '$lib/server/db/schema';
import type { Logger } from 'winston';

declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			user: typeof user.$inferSelect | undefined;
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
		interface User extends ReturnType<typeof user.$inferSelect> {}
	}

	// Global logger instance
	var logger: Logger;
}

export {};
