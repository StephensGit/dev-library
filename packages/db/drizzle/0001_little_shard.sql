CREATE TABLE "command_tags" (
	"command_id" integer NOT NULL,
	"tag_id" integer NOT NULL,
	CONSTRAINT "command_tags_command_id_tag_id_pk" PRIMARY KEY("command_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "tags_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "command_tags" ADD CONSTRAINT "command_tags_command_id_commands_id_fk" FOREIGN KEY ("command_id") REFERENCES "public"."commands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "command_tags" ADD CONSTRAINT "command_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE no action ON UPDATE no action;