CREATE TABLE `song` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`artist` text NOT NULL,
	`album` text NOT NULL,
	`image_url` text
);
--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`display_name` text NOT NULL,
	`email` text NOT NULL,
	`access_token` text NOT NULL,
	`refresh_token` text NOT NULL,
	`expires_at` integer NOT NULL,
	`scope` text NOT NULL,
	`sound_profile` text,
	`musical_dna` text
);
--> statement-breakpoint
CREATE TABLE `user_song_dislike` (
	`user_id` text NOT NULL,
	`song_id` text NOT NULL,
	`reason` text,
	`created_at` integer DEFAULT '"2026-01-28T19:02:13.059Z"' NOT NULL,
	PRIMARY KEY(`song_id`, `user_id`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`song_id`) REFERENCES `song`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `user_song_like` (
	`user_id` text NOT NULL,
	`song_id` text NOT NULL,
	`reason` text,
	`created_at` integer DEFAULT '"2026-01-28T19:02:13.059Z"' NOT NULL,
	PRIMARY KEY(`song_id`, `user_id`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`song_id`) REFERENCES `song`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);