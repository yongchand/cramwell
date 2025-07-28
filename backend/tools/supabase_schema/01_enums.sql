do $$ begin
  create type document_type as enum ('general_review', 'syllabus', 'course_files', 'practice_exam', 'handwritten_notes');
exception when duplicate_object then null; end $$;
 
do $$ begin
  create type content_type as enum ('exam', 'flashcards', 'summary');
exception when duplicate_object then null; end $$; 