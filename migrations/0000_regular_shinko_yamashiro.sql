CREATE TABLE "achievement_types" (
	"id" serial PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"icon_path" text NOT NULL,
	"point_value" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "achievement_types_type_unique" UNIQUE("type")
);
--> statement-breakpoint
CREATE TABLE "activities" (
	"id" serial PRIMARY KEY NOT NULL,
	"week" integer NOT NULL,
	"day" integer NOT NULL,
	"content_fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_complete" boolean DEFAULT false,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"activity_type_id" integer DEFAULT 1
);
--> statement-breakpoint
CREATE TABLE "groups" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"organization_id" integer NOT NULL,
	"status" integer DEFAULT 1,
	"competitive" boolean DEFAULT false,
	"group_admin_invite_code" text,
	"program_start_date" timestamp,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "groups_group_admin_invite_code_unique" UNIQUE("group_admin_invite_code")
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
	CONSTRAINT "invite_codes_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "measurements" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"weight" integer,
	"waist" integer,
	"date" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"sender_id" integer NOT NULL,
	"recipient_id" integer NOT NULL,
	"content" text,
	"image_url" text,
	"poster_url" text,
	"is_read" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now(),
	"is_video" boolean DEFAULT false
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"read" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now(),
	"type" text DEFAULT 'general',
	"sound" text
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"status" integer DEFAULT 1,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "password_reset_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"used" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "posts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"type" text NOT NULL,
	"content" text,
	"image_url" text,
	"is_video" boolean DEFAULT false,
	"points" integer NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"parent_id" integer,
	"depth" integer DEFAULT 0,
	"post_scope" text DEFAULT 'my_team',
	"target_organization_id" integer,
	"target_group_id" integer,
	"target_team_id" integer
);
--> statement-breakpoint
CREATE TABLE "reactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"post_id" integer NOT NULL,
	"type" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "system_state" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"value" text,
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "system_state_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"group_id" integer NOT NULL,
	"max_size" integer DEFAULT 6,
	"status" integer DEFAULT 1,
	"team_admin_invite_code" text,
	"team_member_invite_code" text,
	"program_start_date" timestamp,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "teams_team_admin_invite_code_unique" UNIQUE("team_admin_invite_code"),
	CONSTRAINT "teams_team_member_invite_code_unique" UNIQUE("team_member_invite_code")
);
--> statement-breakpoint
CREATE TABLE "user_achievements" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"achievement_type_id" integer NOT NULL,
	"earned_at" timestamp DEFAULT now(),
	"viewed" boolean DEFAULT false
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"preferred_name" text,
	"email" text NOT NULL,
	"password" text NOT NULL,
	"is_admin" boolean DEFAULT false,
	"is_team_lead" boolean DEFAULT false,
	"is_group_admin" boolean DEFAULT false,
	"team_id" integer,
	"admin_group_id" integer,
	"points" integer DEFAULT 0,
	"weight" integer,
	"waist" integer,
	"created_at" timestamp DEFAULT now(),
	"image_url" text,
	"team_joined_at" timestamp,
	"program_start_date" timestamp,
	"current_week" integer DEFAULT 1,
	"current_day" integer DEFAULT 1,
	"notification_time" text DEFAULT '09:00',
	"timezone_offset" integer,
	"daily_notifications_enabled" boolean DEFAULT true,
	"achievement_notifications_enabled" boolean DEFAULT false,
	"confirmation_messages_enabled" boolean DEFAULT true,
	"phone_number" text,
	"sms_carrier_gateway" text,
	"sms_enabled" boolean DEFAULT false,
	"last_prayer_request_view" timestamp,
	"waiver_signed" boolean DEFAULT false,
	"waiver_signed_at" timestamp,
	"waiver_signature" text,
	"preferred_activity_type_id" integer DEFAULT 1,
	"status" integer DEFAULT 1,
	"avatar_color" text,
	CONSTRAINT "users_username_unique" UNIQUE("username"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "videos" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"url" text NOT NULL,
	"thumbnail" text,
	"category" text NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"team_id" integer
);
--> statement-breakpoint
CREATE TABLE "workout_types" (
	"id" serial PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "workout_types_type_unique" UNIQUE("type")
);
--> statement-breakpoint
CREATE TABLE "workout_videos" (
	"id" serial PRIMARY KEY NOT NULL,
	"activity_id" integer NOT NULL,
	"url" text NOT NULL,
	"description" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
