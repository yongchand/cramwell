-- Add content field to summary table
ALTER TABLE "public"."summary" ADD COLUMN "content" text;

-- Add index for content field for better performance
CREATE INDEX IF NOT EXISTS "summary_content_idx" ON "public"."summary" ("content"); 