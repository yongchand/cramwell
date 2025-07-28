-- Create Summary table
CREATE TABLE IF NOT EXISTS "public"."summary" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "notebook_id" uuid NOT NULL,
    "average_gpa" numeric(3,2),
    "average_hours" numeric(5,2),
    "prof_ratings" numeric(3,2),
    "course_ratings" numeric(3,2),
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Add primary key
ALTER TABLE "public"."summary" ADD CONSTRAINT "summary_pkey" PRIMARY KEY ("id");

-- Add foreign key constraint
ALTER TABLE "public"."summary" ADD CONSTRAINT "summary_notebook_id_fkey" 
    FOREIGN KEY ("notebook_id") REFERENCES "public"."notebooks"("id") ON DELETE CASCADE;

-- Add RLS policies
ALTER TABLE "public"."summary" ENABLE ROW LEVEL SECURITY;

-- Policy for users to view summaries for notebooks they own
CREATE POLICY "Users can view summaries for their notebooks" ON "public"."summary"
    FOR SELECT USING (
        auth.uid() IN (
            SELECT user_id FROM notebooks WHERE id = summary.notebook_id
        )
    );

-- Policy for users to insert summaries for their notebooks
CREATE POLICY "Users can insert summaries for their notebooks" ON "public"."summary"
    FOR INSERT WITH CHECK (
        auth.uid() IN (
            SELECT user_id FROM notebooks WHERE id = summary.notebook_id
        )
    );

-- Policy for users to update summaries for their notebooks
CREATE POLICY "Users can update summaries for their notebooks" ON "public"."summary"
    FOR UPDATE USING (
        auth.uid() IN (
            SELECT user_id FROM notebooks WHERE id = summary.notebook_id
        )
    );

-- Policy for users to delete summaries for their notebooks
CREATE POLICY "Users can delete summaries for their notebooks" ON "public"."summary"
    FOR DELETE USING (
        auth.uid() IN (
            SELECT user_id FROM notebooks WHERE id = summary.notebook_id
        )
    );

-- Create index for better performance
CREATE INDEX IF NOT EXISTS "summary_notebook_id_idx" ON "public"."summary" ("notebook_id"); 