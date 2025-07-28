-- Create sources table for storing processed documents per notebook
CREATE TABLE IF NOT EXISTS sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    notebook_id UUID NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    full_text TEXT,
    file_size BIGINT,
    file_type TEXT,
    processed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    status TEXT DEFAULT 'processed',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create chat_messages table for storing chat history per notebook
CREATE TABLE IF NOT EXISTS chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    notebook_id UUID NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_sources_notebook_id ON sources(notebook_id);
CREATE INDEX IF NOT EXISTS idx_sources_processed_at ON sources(processed_at);
CREATE INDEX IF NOT EXISTS idx_chat_messages_notebook_id ON chat_messages(notebook_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_timestamp ON chat_messages(timestamp);

-- Add RLS policies for sources table
ALTER TABLE sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view sources for their notebooks" ON sources
    FOR SELECT USING (
        notebook_id IN (
            SELECT id FROM notebooks WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert sources for their notebooks" ON sources
    FOR INSERT WITH CHECK (
        notebook_id IN (
            SELECT id FROM notebooks WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update sources for their notebooks" ON sources
    FOR UPDATE USING (
        notebook_id IN (
            SELECT id FROM notebooks WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete sources for their notebooks" ON sources
    FOR DELETE USING (
        notebook_id IN (
            SELECT id FROM notebooks WHERE user_id = auth.uid()
        )
    );

-- Add RLS policies for chat_messages table
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view chat messages for their notebooks" ON chat_messages
    FOR SELECT USING (
        notebook_id IN (
            SELECT id FROM notebooks WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert chat messages for their notebooks" ON chat_messages
    FOR INSERT WITH CHECK (
        notebook_id IN (
            SELECT id FROM notebooks WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update chat messages for their notebooks" ON chat_messages
    FOR UPDATE USING (
        notebook_id IN (
            SELECT id FROM notebooks WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete chat messages for their notebooks" ON chat_messages
    FOR DELETE USING (
        notebook_id IN (
            SELECT id FROM notebooks WHERE user_id = auth.uid()
        )
    ); 