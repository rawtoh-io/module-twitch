CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"instance_id" text,
	"private_key" text,
	"twitch_user_id" text NOT NULL,
	"twitch_login" text NOT NULL,
	"twitch_display_name" text NOT NULL,
	"access_token" text NOT NULL,
	"refresh_token" text,
	"scopes" text DEFAULT '' NOT NULL,
	"expires_in" integer,
	"obtainment_timestamp" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"sid" text PRIMARY KEY NOT NULL,
	"data" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
