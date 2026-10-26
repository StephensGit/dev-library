ALTER TABLE "tags" DROP CONSTRAINT "tags_name_unique";--> statement-breakpoint
ALTER TABLE "command_tags" DROP CONSTRAINT "command_tags_command_id_commands_id_fk";
--> statement-breakpoint
ALTER TABLE "command_tags" DROP CONSTRAINT "command_tags_tag_id_tags_id_fk";
--> statement-breakpoint
ALTER TABLE "commands" ADD COLUMN "user_id" text;--> statement-breakpoint
ALTER TABLE "tags" ADD COLUMN "user_id" text;--> statement-breakpoint
ALTER TABLE "command_tags" ADD CONSTRAINT "command_tags_command_id_commands_id_fk" FOREIGN KEY ("command_id") REFERENCES "public"."commands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "command_tags" ADD CONSTRAINT "command_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commands" ADD CONSTRAINT "commands_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "commands_user_id_idx" ON "commands" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tags_user_id_name_unique" ON "tags" USING btree ("user_id",lower("name"));