-- Speed up admin user-log lookups by user identity and timestamp.

CREATE INDEX IF NOT EXISTS idx_analytics_events_user_id_created_at
  ON public.analytics_events(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_analytics_events_email_created_at
  ON public.analytics_events(email, created_at DESC);

