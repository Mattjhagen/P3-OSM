import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-06-20',
});

const CORS_HEADERS = {
  'content-type': 'application/json',
  'access-control-allow-origin': '*',
};

export const handler = async (event: {
  httpMethod?: string;
  queryStringParameters?: Record<string, string>;
  headers?: Record<string, string>;
}) => {
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  const plan = event.queryStringParameters?.plan;

  let priceId;
  if (plan === 'launch') priceId = 'price_1T5ykFBhAu0E0SSFa5DhG3Ri';
  else if (plan === 'core') priceId = 'price_1T5yodBhAu0E0SSFgZS6nMCZ';
  else if (plan === 'grow') priceId = 'price_1T5yooBhAu0E0SSFTHwRXhmv';
  else
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Invalid plan' }),
    };

  try {
    const origin = event.headers?.origin || event.headers?.['x-forwarded-host'] || 'https://developers.p3lending.space';
    const baseUrl = origin.startsWith('http') ? origin : `https://${origin}`;

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${baseUrl}/dashboard?success=true`,
      cancel_url: `${baseUrl}/pricing`,
    });

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({ id: session.id }),
    };
  } catch (err) {
    console.error(err);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Failed to create session' }),
    };
  }
};
