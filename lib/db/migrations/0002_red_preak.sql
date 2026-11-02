ALTER TABLE "connections" ADD COLUMN "activated_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "connections_user_b" ON "connections" USING btree ("user_b_id");--> statement-breakpoint
CREATE INDEX "invites_inviter" ON "invites" USING btree ("inviter_id");--> statement-breakpoint
CREATE INDEX "lanterns_sender" ON "lanterns" USING btree ("sender_id");