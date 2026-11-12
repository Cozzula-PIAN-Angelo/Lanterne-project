CREATE FUNCTION enqueue_storage_deletion() RETURNS trigger AS $$
BEGIN
  INSERT INTO storage_deletions (key) VALUES (OLD.media_key) ON CONFLICT DO NOTHING;
  RETURN OLD;
END $$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER lanterns_media_deleted AFTER DELETE ON lanterns
FOR EACH ROW WHEN (OLD.media_key IS NOT NULL)
EXECUTE FUNCTION enqueue_storage_deletion();
