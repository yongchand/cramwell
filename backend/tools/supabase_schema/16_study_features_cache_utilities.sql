-- Create a view to see all cached study features for a notebook
CREATE OR REPLACE VIEW "public"."notebook_study_features_cache" AS
SELECT 
    n.id as notebook_id,
    n.name as notebook_name,
    sfc.feature_type,
    sfc.content,
    sfc.created_at,
    sfc.updated_at
FROM "public"."notebooks" n
LEFT JOIN "public"."study_features_cache" sfc ON n.id = sfc.notebook_id
ORDER BY n.name, sfc.feature_type;

-- Create a function to get cache statistics
CREATE OR REPLACE FUNCTION get_cache_stats()
RETURNS TABLE (
    total_cached_features bigint,
    notebooks_with_cache bigint,
    summary_count bigint,
    exam_count bigint,
    flashcards_count bigint
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(*) as total_cached_features,
        COUNT(DISTINCT notebook_id) as notebooks_with_cache,
        COUNT(*) FILTER (WHERE feature_type = 'summary') as summary_count,
        COUNT(*) FILTER (WHERE feature_type = 'exam') as exam_count,
        COUNT(*) FILTER (WHERE feature_type = 'flashcards') as flashcards_count
    FROM "public"."study_features_cache";
END;
$$ LANGUAGE plpgsql;

-- Create a function to clear old cache entries (older than 30 days)
CREATE OR REPLACE FUNCTION clear_old_cache_entries()
RETURNS integer AS $$
DECLARE
    deleted_count integer;
BEGIN
    DELETE FROM "public"."study_features_cache" 
    WHERE updated_at < NOW() - INTERVAL '30 days';
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Create an index on updated_at for efficient cleanup
CREATE INDEX IF NOT EXISTS "study_features_cache_updated_at_idx" 
ON "public"."study_features_cache" ("updated_at");

-- Add a comment to the table for documentation
COMMENT ON TABLE "public"."study_features_cache" IS 'Cache for generated study features (summary, exam, flashcards) to avoid regenerating them repeatedly'; 