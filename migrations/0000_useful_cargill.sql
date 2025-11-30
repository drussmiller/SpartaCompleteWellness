-- Current sql file was generated after introspecting the database
-- If you want to run this migration please uncomment this code before executing migrations
/*
CREATE TABLE "measurements" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"weight" integer,
	"waist" integer,
	"date" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
	"group_id" integer DEFAULT 1 NOT NULL,
	"max_size" integer DEFAULT 50,
	"status" integer DEFAULT 1,
	"team_admin_invite_code" text,
	"team_member_invite_code" text,
	"program_start_date" timestamp,
	CONSTRAINT "teams_team_admin_invite_code_key" UNIQUE("team_admin_invite_code"),
	CONSTRAINT "teams_team_member_invite_code_key" UNIQUE("team_member_invite_code")
);
--> statement-breakpoint
CREATE TABLE "session" (
	"sid" varchar PRIMARY KEY NOT NULL,
	"sess" json NOT NULL,
	"expire" timestamp(6) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "password_reset_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"used" boolean DEFAULT false,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"read" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
	"type" text DEFAULT 'general',
	"sound" text
);
--> statement-breakpoint
CREATE TABLE "videos" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"url" text NOT NULL,
	"thumbnail" text,
	"category" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
	"team_id" integer
);
--> statement-breakpoint
CREATE TABLE "workout_videos" (
	"id" serial PRIMARY KEY NOT NULL,
	"activity_id" integer NOT NULL,
	"url" text NOT NULL,
	"description" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE "activities" (
	"id" serial PRIMARY KEY NOT NULL,
	"week" integer NOT NULL,
	"day" integer NOT NULL,
	"is_complete" boolean DEFAULT false,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
	"content_fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"activity_type_id" integer DEFAULT 1
);
--> statement-breakpoint
CREATE TABLE "reactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"post_id" integer NOT NULL,
	"type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT "reactions_user_id_post_id_type_key" UNIQUE("user_id","post_id","type")
);
--> statement-breakpoint
CREATE TABLE "workout_types" (
	"id" serial PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "workout_types_type_key" UNIQUE("type")
);
--> statement-breakpoint
CREATE TABLE "user_achievements" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"achievement_type_id" integer NOT NULL,
	"earned_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
	"viewed" boolean DEFAULT false,
	CONSTRAINT "user_achievements_user_id_achievement_type_id_key" UNIQUE("user_id","achievement_type_id")
);
--> statement-breakpoint
CREATE TABLE "achievement_types" (
	"id" serial PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"icon_path" text,
	"point_value" integer DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT "achievement_types_type_key" UNIQUE("type")
);
--> statement-breakpoint
CREATE TABLE "groups" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"organization_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"status" integer DEFAULT 1,
	"competitive" boolean DEFAULT false,
	"group_admin_invite_code" text,
	"program_start_date" timestamp,
	"group_member_invite_code" text,
	CONSTRAINT "groups_group_admin_invite_code_key" UNIQUE("group_admin_invite_code"),
	CONSTRAINT "groups_group_member_invite_code_key" UNIQUE("group_member_invite_code")
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now(),
	"status" integer DEFAULT 1
);
--> statement-breakpoint
CREATE TABLE "invite_codes" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"type" text NOT NULL,
	"group_id" integer,
	"team_id" integer,
	"created_by" integer NOT NULL,
	"expires_at" timestamp,
	"max_uses" integer,
	"used_count" integer DEFAULT 0,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "invite_codes_code_key" UNIQUE("code"),
	CONSTRAINT "invite_codes_type_check" CHECK (type = ANY (ARRAY['group_admin'::text, 'team_admin'::text, 'team_member'::text]))
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"sender_id" integer NOT NULL,
	"recipient_id" integer NOT NULL,
	"content" text,
	"image_url" text,
	"is_read" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
	"is_video" boolean DEFAULT false,
	"poster_url" text
);
--> statement-breakpoint
CREATE TABLE "posts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"type" text NOT NULL,
	"content" text,
	"image_url" text,
	"points" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
	"parent_id" integer,
	"depth" integer DEFAULT 0,
	"is_video" boolean DEFAULT false,
	"post_scope" text DEFAULT 'my_team',
	"target_organization_id" integer,
	"target_group_id" integer,
	"target_team_id" integer
);
--> statement-breakpoint
CREATE TABLE "system_state" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"value" text,
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "system_state_key_key" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "verification_codes" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"code" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"attempts" integer DEFAULT 0,
	"verified" boolean DEFAULT false,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"preferred_name" text,
	"email" text NOT NULL,
	"password" text NOT NULL,
	"is_admin" boolean DEFAULT false,
	"team_id" integer,
	"points" integer DEFAULT 0,
	"weight" integer,
	"waist" integer,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
	"image_url" text,
	"team_joined_at" timestamp,
	"is_team_lead" boolean DEFAULT false,
	"current_week" integer DEFAULT 1,
	"current_day" integer DEFAULT 1,
	"notification_time" text DEFAULT '09:00',
	"achievement_notifications_enabled" boolean DEFAULT false,
	"last_prayer_request_view" timestamp,
	"waiver_signed" boolean DEFAULT false,
	"waiver_signed_at" timestamp,
	"waiver_signature" text,
	"preferred_activity_type_id" integer DEFAULT 1,
	"is_group_admin" boolean DEFAULT false,
	"admin_group_id" integer,
	"status" integer DEFAULT 1,
	"program_start_date" timestamp with time zone,
	"timezone_offset" integer,
	"avatar_color" text,
	"phone_number" text,
	"sms_carrier_gateway" text,
	"sms_enabled" boolean DEFAULT false,
	"daily_notifications_enabled" boolean DEFAULT true,
	"confirmation_messages_enabled" boolean DEFAULT true,
	"is_blocked" boolean DEFAULT false,
	CONSTRAINT "users_username_key" UNIQUE("username"),
	CONSTRAINT "users_email_key" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "workout_videos" ADD CONSTRAINT "workout_videos_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reactions" ADD CONSTRAINT "reactions_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_achievements" ADD CONSTRAINT "user_achievements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_achievements" ADD CONSTRAINT "user_achievements_achievement_type_id_fkey" FOREIGN KEY ("achievement_type_id") REFERENCES "public"."achievement_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "IDX_session_expire" ON "session" USING btree ("expire" timestamp_ops);--> statement-breakpoint
CREATE INDEX "idx_posts_parent_id" ON "posts" USING btree ("parent_id" int4_ops);--> statement-breakpoint
CREATE INDEX "idx_posts_type" ON "posts" USING btree ("type" text_ops);
*/