import { createClient } from '@supabase/supabase-js';
import { config } from './config';

if (!config.supabase.url || !config.supabase.serviceKey) {
    console.warn('Supabase configuration missing. Ensure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set.');
}

if (!process.env.SUPABASE_ANON_KEY) {
    console.warn('SUPABASE_ANON_KEY not set. Falling back to SUPABASE_SERVICE_ROLE_KEY for RLS client initialization.');
}

export const supabase = createClient(
    config.supabase.url,
    config.supabase.serviceKey
);

export const createRlsClient = (accessToken: string) =>
    createClient(config.supabase.url, config.supabase.anonKey, {
        global: {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        },
    });

export const resolveAuthUser = async (accessToken: string) => {
    const authClient = createRlsClient(accessToken);
    return authClient.auth.getUser(accessToken);
};
