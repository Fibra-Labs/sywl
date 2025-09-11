import { sqliteTable, text, integer, primaryKey } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';

export const user = sqliteTable('user', {
	id: text('id').primaryKey(),
	displayName: text('display_name').notNull(),
	email: text('email').notNull().unique(),
	accessToken: text('access_token').notNull(),
	refreshToken: text('refresh_token').notNull(),
	expiresAt: integer('expires_at').notNull(),
	scope: text('scope').notNull(),
	soundProfile: text('sound_profile'),
	musicalDna: text('musical_dna')
});

export const userRelations = relations(user, ({ many }) => ({
	likes: many(userSongLike),
	dislikes: many(userSongDislike)
}));

export const song = sqliteTable('song', {
	id: text('id').primaryKey(),
	name: text('name').notNull(),
	artist: text('artist').notNull(),
	album: text('album').notNull(),
	imageUrl: text('image_url')
});

export type Song = typeof song.$inferSelect;

export const songRelations = relations(song, ({ many }) => ({
	likes: many(userSongLike),
	dislikes: many(userSongDislike)
}));

export const userSongLike = sqliteTable(
	'user_song_like',
	{
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade', onUpdate: 'no action' }),
		songId: text('song_id')
			.notNull()
			.references(() => song.id, { onDelete: 'cascade', onUpdate: 'no action' }),
		reason: text('reason'),
		createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(new Date())
	},
	(t) => ({
		pk: primaryKey({ columns: [t.userId, t.songId] })
	})
);

export const userSongDislike = sqliteTable(
	'user_song_dislike',
	{
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade', onUpdate: 'no action' }),
		songId: text('song_id')
			.notNull()
			.references(() => song.id, { onDelete: 'cascade', onUpdate: 'no action' }),
		reason: text('reason'),
		createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(new Date())
	},
	(t) => ({
		pk: primaryKey({ columns: [t.userId, t.songId] })
	})
);

export const userSongLikeRelations = relations(userSongLike, ({ one }) => ({
	user: one(user, {
		fields: [userSongLike.userId],
		references: [user.id]
	}),
	song: one(song, {
		fields: [userSongLike.songId],
		references: [song.id]
	})
}));

export const userSongDislikeRelations = relations(userSongDislike, ({ one }) => ({
	user: one(user, {
		fields: [userSongDislike.userId],
		references: [user.id]
	}),
	song: one(song, {
		fields: [userSongDislike.songId],
		references: [song.id]
	})
}));
