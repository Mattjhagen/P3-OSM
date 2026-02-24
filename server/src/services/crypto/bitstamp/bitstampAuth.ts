import crypto from 'crypto';

interface AuthHeadersInput {
  apiKey: string;
  apiSecret: string;
  method: string;
  host: string;
  path: string;
  query: string;
  body: string;
  contentType?: string;
  subaccountId?: string;
}

export const createBitstampAuthHeaders = (input: AuthHeadersInput) => {
  const nonce = crypto.randomUUID();
  const timestamp = Date.now().toString();
  const version = 'v2';
  const xAuth = `BITSTAMP ${input.apiKey}`;

  const message =
    xAuth +
    input.method.toUpperCase() +
    input.host +
    input.path +
    input.query +
    (input.contentType || '') +
    nonce +
    timestamp +
    version +
    input.body;

  const signature = crypto.createHmac('sha256', input.apiSecret).update(message).digest('hex');

  const headers: Record<string, string> = {
    'X-Auth': xAuth,
    'X-Auth-Signature': signature,
    'X-Auth-Nonce': nonce,
    'X-Auth-Timestamp': timestamp,
    'X-Auth-Version': version,
  };

  if (input.contentType) {
    headers['Content-Type'] = input.contentType;
  }

  if (input.subaccountId) {
    headers['X-Auth-Subaccount-Id'] = input.subaccountId;
  }

  return headers;
};
