import { pgTable, serial, integer, timestamp, unique, text, index, varchar, json, boolean, foreignKey, jsonb, check } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"



export const measurements = pgTable("measurements", {
	id: serial().primaryKey().notNull(),
	userId: integer("user_id").notNull(),
	weight: integer(),
	waist: integer(),
	date: timestamp({ mode: 'string' }).defaultNow(),
});

export const teams = pgTable("teams", {
	id: serial().primaryKey().notNull(),
	name: text().notNull(),
	description: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
	groupId: integer("group_id").default(1).notNull(),
	maxSize: integer("max_size").default(50),
	status: integer().default(1),
	teamAdminInviteCode: text("team_admin_invite_code"),
	teamMemberInviteCode: text("team_member_invite_code"),
	programStartDate: timestamp("program_start_date", { mode: 'string' }),
}, (table) => [
	unique("teams_team_admin_invite_code_key").on(table.teamAdminInviteCode),
	unique("teams_team_member_invite_code_key").on(table.teamMemberInviteCode),
]);

export const session = pgTable("session", {
	sid: varchar().primaryKey().notNull(),
	sess: json().notNull(),
	expire: timestamp({ precision: 6, mode: 'string' }).notNull(),
}, (table) => [
	index("IDX_session_expire").using("btree", table.expire.asc().nullsLast().op("timestamp_ops")),
]);

export const passwordResetTokens = pgTable("password_reset_tokens", {
	id: serial().primaryKey().notNull(),
	email: text().notNull(),
	token: text().notNull(),
	expiresAt: timestamp("expires_at", { mode: 'string' }).notNull(),
	used: boolean().default(false),
	createdAt: timestamp("created_at", { mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
});

export const notifications = pgTable("notifications", {
	id: serial().primaryKey().notNull(),
	userId: integer("user_id").notNull(),
	title: text().notNull(),
	message: text().notNull(),
	read: boolean().default(false),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
	type: text().default('general'),
	sound: text(),
});

export const videos = pgTable("videos", {
	id: serial().primaryKey().notNull(),
	title: text().notNull(),
	description: text().notNull(),
	url: text().notNull(),
	thumbnail: text(),
	category: text().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
	teamId: integer("team_id"),
});

export const workoutVideos = pgTable("workout_videos", {
	id: serial().primaryKey().notNull(),
	activityId: integer("activity_id").notNull(),
	url: text().notNull(),
	description: text().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
	foreignKey({
			columns: [table.activityId],
			foreignColumns: [activities.id],
			name: "workout_videos_activity_id_fkey"
		}).onDelete("cascade"),
]);

export const activities = pgTable("activities", {
	id: serial().primaryKey().notNull(),
	week: integer().notNull(),
	day: integer().notNull(),
	isComplete: boolean("is_complete").default(false),
	completedAt: timestamp("completed_at", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
	contentFields: jsonb("content_fields").default([]).notNull(),
	activityTypeId: integer("activity_type_id").default(1),
});

export const reactions = pgTable("reactions", {
	id: serial().primaryKey().notNull(),
	userId: integer("user_id").notNull(),
	postId: integer("post_id").notNull(),
	type: text().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
	foreignKey({
			columns: [table.postId],
			foreignColumns: [posts.id],
			name: "reactions_post_id_fkey"
		}).onDelete("cascade"),
	unique("reactions_user_id_post_id_type_key").on(table.userId, table.postId, table.type),
]);

export const workoutTypes = pgTable("workout_types", {
	id: serial().primaryKey().notNull(),
	type: text().notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	unique("workout_types_type_key").on(table.type),
]);

export const userAchievements = pgTable("user_achievements", {
	id: serial().primaryKey().notNull(),
	userId: integer("user_id").notNull(),
	achievementTypeId: integer("achievement_type_id").notNull(),
	earnedAt: timestamp("earned_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
	viewed: boolean().default(false),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "user_achievements_user_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.achievementTypeId],
			foreignColumns: [achievementTypes.id],
			name: "user_achievements_achievement_type_id_fkey"
		}).onDelete("cascade"),
	unique("user_achievements_user_id_achievement_type_id_key").on(table.userId, table.achievementTypeId),
]);

export const achievementTypes = pgTable("achievement_types", {
	id: serial().primaryKey().notNull(),
	type: text().notNull(),
	name: text().notNull(),
	description: text().notNull(),
	iconPath: text("icon_path"),
	pointValue: integer("point_value").default(0),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
	unique("achievement_types_type_key").on(table.type),
]);

export const groups = pgTable("groups", {
	id: serial().primaryKey().notNull(),
	name: text().notNull(),
	description: text(),
	organizationId: integer("organization_id").notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	status: integer().default(1),
	competitive: boolean().default(false),
	groupAdminInviteCode: text("group_admin_invite_code"),
	programStartDate: timestamp("program_start_date", { mode: 'string' }),
	groupMemberInviteCode: text("group_member_invite_code"),
}, (table) => [
	unique("groups_group_admin_invite_code_key").on(table.groupAdminInviteCode),
	unique("groups_group_member_invite_code_key").on(table.groupMemberInviteCode),
]);

export const organizations = pgTable("organizations", {
	id: serial().primaryKey().notNull(),
	name: text().notNull(),
	description: text(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	status: integer().default(1),
});

export const inviteCodes = pgTable("invite_codes", {
	id: serial().primaryKey().notNull(),
	code: text().notNull(),
	type: text().notNull(),
	groupId: integer("group_id"),
	teamId: integer("team_id"),
	createdBy: integer("created_by").notNull(),
	expiresAt: timestamp("expires_at", { mode: 'string' }),
	maxUses: integer("max_uses"),
	usedCount: integer("used_count").default(0),
	isActive: boolean("is_active").default(true),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	unique("invite_codes_code_key").on(table.code),
	check("invite_codes_type_check", sql`type = ANY (ARRAY['group_admin'::text, 'team_admin'::text, 'team_member'::text])`),
]);

export const messages = pgTable("messages", {
	id: serial().primaryKey().notNull(),
	senderId: integer("sender_id").notNull(),
	recipientId: integer("recipient_id").notNull(),
	content: text(),
	imageUrl: text("image_url"),
	isRead: boolean("is_read").default(false),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
	isVideo: boolean("is_video").default(false),
	posterUrl: text("poster_url"),
}, (table) => [
	foreignKey({
			columns: [table.senderId],
			foreignColumns: [users.id],
			name: "messages_sender_id_fkey"
		}),
	foreignKey({
			columns: [table.recipientId],
			foreignColumns: [users.id],
			name: "messages_recipient_id_fkey"
		}),
]);

export const posts = pgTable("posts", {
	id: serial().primaryKey().notNull(),
	userId: integer("user_id").notNull(),
	type: text().notNull(),
	content: text(),
	imageUrl: text("image_url"),
	points: integer().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
	parentId: integer("parent_id"),
	depth: integer().default(0),
	isVideo: boolean("is_video").default(false),
	postScope: text("post_scope").default('my_team'),
	targetOrganizationId: integer("target_organization_id"),
	targetGroupId: integer("target_group_id"),
	targetTeamId: integer("target_team_id"),
}, (table) => [
	index("idx_posts_parent_id").using("btree", table.parentId.asc().nullsLast().op("int4_ops")),
	index("idx_posts_type").using("btree", table.type.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.parentId],
			foreignColumns: [table.id],
			name: "posts_parent_id_fkey"
		}).onDelete("cascade"),
]);

export const systemState = pgTable("system_state", {
	id: serial().primaryKey().notNull(),
	key: text().notNull(),
	value: text(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	unique("system_state_key_key").on(table.key),
]);

export const verificationCodes = pgTable("verification_codes", {
	id: serial().primaryKey().notNull(),
	email: text().notNull(),
	code: text().notNull(),
	expiresAt: timestamp("expires_at", { mode: 'string' }).notNull(),
	attempts: integer().default(0),
	verified: boolean().default(false),
	createdAt: timestamp("created_at", { mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
});

export const users = pgTable("users", {
	id: serial().primaryKey().notNull(),
	username: text().notNull(),
	preferredName: text("preferred_name"),
	email: text().notNull(),
	password: text().notNull(),
	isAdmin: boolean("is_admin").default(false),
	teamId: integer("team_id"),
	points: integer().default(0),
	weight: integer(),
	waist: integer(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
	imageUrl: text("image_url"),
	teamJoinedAt: timestamp("team_joined_at", { mode: 'string' }),
	isTeamLead: boolean("is_team_lead").default(false),
	currentWeek: integer("current_week").default(1),
	currentDay: integer("current_day").default(1),
	notificationTime: text("notification_time").default('09:00'),
	achievementNotificationsEnabled: boolean("achievement_notifications_enabled").default(false),
	lastPrayerRequestView: timestamp("last_prayer_request_view", { mode: 'string' }),
	waiverSigned: boolean("waiver_signed").default(false),
	waiverSignedAt: timestamp("waiver_signed_at", { mode: 'string' }),
	waiverSignature: text("waiver_signature"),
	preferredActivityTypeId: integer("preferred_activity_type_id").default(1),
	isGroupAdmin: boolean("is_group_admin").default(false),
	adminGroupId: integer("admin_group_id"),
	status: integer().default(1),
	programStartDate: timestamp("program_start_date", { withTimezone: true, mode: 'string' }),
	timezoneOffset: integer("timezone_offset"),
	avatarColor: text("avatar_color"),
	phoneNumber: text("phone_number"),
	smsCarrierGateway: text("sms_carrier_gateway"),
	smsEnabled: boolean("sms_enabled").default(false),
	dailyNotificationsEnabled: boolean("daily_notifications_enabled").default(true),
	confirmationMessagesEnabled: boolean("confirmation_messages_enabled").default(true),
	isBlocked: boolean("is_blocked").default(false),
}, (table) => [
	unique("users_username_key").on(table.username),
	unique("users_email_key").on(table.email),
]);
