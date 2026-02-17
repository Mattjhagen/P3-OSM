-- Ensure chat history can be read/written in beta anon-key architecture.
-- This normalizes schema drift between environments and avoids silent read failures.

CREATE TABLE IF NOT EXISTS public.chats (
    id TEXT PRIMARY KEY,
    thread_id TEXT,
    sender_id TEXT NOT NULL,
    sender_name TEXT,
    role TEXT NOT NULL DEFAULT 'CUSTOMER',
    message TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'CUSTOMER_SUPPORT',
    data JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.chats ADD COLUMN IF NOT EXISTS thread_id TEXT;
ALTER TABLE public.chats ADD COLUMN IF NOT EXISTS sender_id TEXT;
ALTER TABLE public.chats ADD COLUMN IF NOT EXISTS sender_name TEXT;
ALTER TABLE public.chats ADD COLUMN IF NOT EXISTS role TEXT;
ALTER TABLE public.chats ADD COLUMN IF NOT EXISTS message TEXT;
ALTER TABLE public.chats ADD COLUMN IF NOT EXISTS type TEXT;
ALTER TABLE public.chats ADD COLUMN IF NOT EXISTS data JSONB;
ALTER TABLE public.chats ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

UPDATE public.chats
SET
    role = COALESCE(role, 'CUSTOMER'),
    type = COALESCE(type, 'CUSTOMER_SUPPORT'),
    data = COALESCE(
        data,
        jsonb_build_object(
            'id', id,
            'senderId', sender_id,
            'senderName', COALESCE(sender_name, 'User'),
            'role', COALESCE(role, 'CUSTOMER'),
            'message', message,
            'type', COALESCE(type, 'CUSTOMER_SUPPORT'),
            'threadId', thread_id,
            'timestamp', FLOOR(EXTRACT(EPOCH FROM COALESCE(created_at, NOW())) * 1000)::bigint
        )
    ),
    created_at = COALESCE(created_at, NOW())
WHERE
    role IS NULL
    OR type IS NULL
    OR data IS NULL
    OR created_at IS NULL;

ALTER TABLE public.chats
    ALTER COLUMN role SET DEFAULT 'CUSTOMER',
    ALTER COLUMN type SET DEFAULT 'CUSTOMER_SUPPORT',
    ALTER COLUMN data SET DEFAULT '{}'::jsonb,
    ALTER COLUMN created_at SET DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_chats_created_at ON public.chats(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chats_thread_id ON public.chats(thread_id);
CREATE INDEX IF NOT EXISTS idx_chats_type ON public.chats(type);

-- Beta architecture currently writes/reads chats with anon key.
-- Keep RLS disabled until auth is fully consolidated.
ALTER TABLE public.chats DISABLE ROW LEVEL SECURITY;

