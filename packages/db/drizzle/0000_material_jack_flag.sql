CREATE TABLE "commands" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"command" text NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
