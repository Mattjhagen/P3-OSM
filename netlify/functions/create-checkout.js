import dotenv from 'dotenv';
import path from 'path';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

// Load .env for local netlify dev (Netlify doesn't auto-load .env for functions)
const cwd = process.cwd();
dotenv.config({ path: path.join(cwd, '.env') });
dotenv.config({ path: path.join(cwd, '.env.local') });
dotenv.config({ path: path.join(cwd, 'apps/developer-docs/.env') });
dotenv.config({ path: path.join(cwd, '..', '.env') });
dotenv.config({ path: path.join(cwd, '..', '.env.local') });
dotenv.config({ path: path.join(cwd, '..', '..', '.env') });
dotenv.config({ path: path.join(cwd, '..', '..', '.env.local') });

const CORS_HEADERS = {
  'content-type': 'application/json',
  'access-control-allow-origin': '*',
};

export const handler = createCheckoutHandler;

async function createCheckoutHandler(event) {
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  // Require auth – verify Supabase JWT
  const authHeader = event.headers?.authorization || event.headers?.Authorization;
  const token = typeof authHeader === 'string' && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    return {
      statusCode: 401,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Sign in required. Please sign in to upgrade.' }),
    };
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    return {
      statusCode: 503,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Auth not configured. Add SUPABASE_URL and SUPABASE_ANON_KEY.' }),
    };
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey);
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return {
      statusCode: 401,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Invalid or expired session. Please sign in again.' }),
    };
  }

  const plan = event.queryStringParameters?.plan;

  let priceId;
  if (plan === 'launch') priceId = 'price_1T5ykFBhAu0E0SSFa5DhG3Ri';
  else if (plan === 'core') priceId = 'price_1T5yodBhAu0E0SSFgZS6nMCZ';
  else if (plan === 'grow') priceId = 'price_1T5yooBhAu0E0SSFTHwRXhmv';
  else {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Invalid plan' }),
    };
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    return {
      statusCode: 503,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        error: 'STRIPE_SECRET_KEY is not configured. Add it in Netlify site environment variables.',
      }),
    };
  }

  try {
    const stripe = new Stripe(secretKey, { apiVersion: '2024-06-20' });
    const origin =
      event.headers?.origin || event.headers?.['x-forwarded-host'] || 'https://developers.p3lending.space';
    const baseUrl = origin.startsWith('http') ? origin : `https://${origin}`;

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${baseUrl}/?success=true`,
      cancel_url: `${baseUrl}/pricing`,
      metadata: {
        flow: 'developer',
        userId: user.id,
        plan: plan || '',
      },
    });

    const url = session.url;
    if (!url) {
      return {
        statusCode: 502,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Stripe did not return a checkout URL' }),
      };
    }

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({ id: session.id, url }),
    };
  } catch (err) {
    console.error(err);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Failed to create session' }),
    };
  }
}
