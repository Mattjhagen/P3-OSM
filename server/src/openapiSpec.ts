/** OpenAPI 3.0 spec for Developer API (served at GET /docs/openapi.json). */
export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'P3 Lending Developer API',
    description: 'B2B API for reputation scores and related data.',
    version: '1.0.0',
  },
  servers: [
    { url: 'https://api.p3lending.space', description: 'Production' },
    { url: 'http://localhost:5000', description: 'Local' },
  ],
  security: [{ BearerAuth: [] }],
  paths: {
    '/api/v1/reputation/score': {
      get: {
        summary: 'Get reputation score by user ID',
        operationId: 'getScore',
        parameters: [
          { name: 'user_id', in: 'query', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          '200': { description: 'Score result' },
          '400': { description: 'Missing user_id' },
          '401': { description: 'Invalid API key' },
          '403': { description: 'Missing scope score:read' },
          '404': { description: 'User not found' },
          '429': { description: 'Rate limit exceeded' },
        },
      },
    },
    '/api/v1/reputation/score/by-wallet': {
      get: {
        summary: 'Get reputation score by wallet address',
        operationId: 'getScoreByWallet',
        parameters: [
          { name: 'address', in: 'query', required: true, schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'Score result' },
          '400': { description: 'Missing address' },
          '401': { description: 'Invalid API key' },
          '403': { description: 'Missing scope score:read' },
          '404': { description: 'User not found for wallet' },
          '429': { description: 'Rate limit exceeded' },
        },
      },
    },
    '/api/v1/reputation/score/batch': {
      post: {
        summary: 'Get scores for multiple users',
        operationId: 'getScoreBatch',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['user_ids'],
                properties: {
                  user_ids: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 50 },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Array of score results' },
          '400': { description: 'Invalid user_ids' },
          '401': { description: 'Invalid API key' },
          '403': { description: 'Missing scope score:read' },
          '429': { description: 'Rate limit exceeded' },
        },
      },
    },
    '/api/v1/reputation/score/history': {
      get: {
        summary: 'Get score history for a user',
        operationId: 'getScoreHistory',
        parameters: [
          { name: 'user_id', in: 'query', required: true, schema: { type: 'string' } },
          { name: 'from', in: 'query', schema: { type: 'string', format: 'date-time' } },
          { name: 'to', in: 'query', schema: { type: 'string', format: 'date-time' } },
        ],
        responses: {
          '200': { description: 'List of snapshots' },
          '400': { description: 'Missing user_id' },
          '401': { description: 'Invalid API key' },
          '403': { description: 'Missing scope score:history' },
          '429': { description: 'Rate limit exceeded' },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      BearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'API key (p3_live_... or p3_test_...)',
      },
    },
  },
} as const;
