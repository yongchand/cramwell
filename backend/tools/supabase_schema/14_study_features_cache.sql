-- Create Study Features Cache table
CREATE TABLE IF NOT EXISTS "public"."study_features_cache" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "notebook_id" uuid NOT NULL,
    "feature_type" text NOT NULL CHECK (feature_type IN ('summary', 'exam', 'flashcards')),
    "content" text NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    UNIQUE(notebook_id, feature_type)
);

-- Add primary key
ALTER TABLE "public"."study_features_cache" ADD CONSTRAINT "study_features_cache_pkey" PRIMARY KEY ("id");

-- Add foreign key constraint
ALTER TABLE "public"."study_features_cache" ADD CONSTRAINT "study_features_cache_notebook_id_fkey" 
    FOREIGN KEY ("notebook_id") REFERENCES "public"."notebooks"("id") ON DELETE CASCADE;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS "study_features_cache_notebook_id_idx" ON "public"."study_features_cache" ("notebook_id");
CREATE INDEX IF NOT EXISTS "study_features_cache_feature_type_idx" ON "public"."study_features_cache" ("feature_type");
CREATE INDEX IF NOT EXISTS "study_features_cache_notebook_feature_idx" ON "public"."study_features_cache" ("notebook_id", "feature_type"); 