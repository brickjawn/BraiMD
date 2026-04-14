const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const path = require('path');

function loadAuthMiddleware({ apiKeyHash, apiKeyId }) {
  const middlewarePath = path.resolve(__dirname, '../src/middleware/apiKeyAuth.js');
  process.env.API_KEY_HASH = apiKeyHash;
  process.env.API_KEY_ID = apiKeyId;
  delete require.cache[middlewarePath];
  return require(middlewarePath);
}

function createResponseCapture() {
  const state = {
    statusCode: null,
    body: null,
  };

  return {
    state,
    response: {
      status(code) {
        state.statusCode = code;
        return this;
      },
      json(payload) {
        state.body = payload;
        return this;
      },
    },
  };
}

test('rejects request when API key is missing', () => {
  const middleware = loadAuthMiddleware({
    apiKeyHash: crypto.createHash('sha256').update('secret').digest('hex'),
    apiKeyId: 'gateway',
  });

  const req = { headers: {} };
  const { response, state } = createResponseCapture();
  let nextCalled = false;

  middleware(req, response, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(state.statusCode, 401);
});

test('accepts request with valid API key and sets apiKeyId', () => {
  const middleware = loadAuthMiddleware({
    apiKeyHash: crypto.createHash('sha256').update('secret').digest('hex'),
    apiKeyId: 'gateway',
  });

  const req = { headers: { 'x-api-key': 'secret' } };
  const { response } = createResponseCapture();
  let nextCalled = false;

  middleware(req, response, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(req.apiKeyId, 'gateway');
});
