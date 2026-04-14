const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

function loadServiceWithMock(mockQuery) {
  const dbModulePath = path.resolve(__dirname, '../src/db/db.js');
  const serviceModulePath = path.resolve(__dirname, '../src/services/skillSearchService.js');

  delete require.cache[dbModulePath];
  delete require.cache[serviceModulePath];

  require.cache[dbModulePath] = {
    id: dbModulePath,
    filename: dbModulePath,
    loaded: true,
    exports: {
      query: mockQuery,
    },
  };

  return require(serviceModulePath);
}

test('returns found and logs headers to agent_logs', async () => {
  const calls = [];
  const { resolveSkillSearch } = loadServiceWithMock(async (sql, params) => {
    calls.push({ sql, params });
    if (sql.includes('FROM skills')) {
      return [[{
        id: 7,
        name: 'Combat Basics',
        content: 'Use shield',
        created_at: new Date('2026-04-10T10:00:00Z'),
      }]];
    }
    if (sql.includes('FROM edges')) {
      return [[]];
    }
    return [{ affectedRows: 1 }];
  });

  const result = await resolveSkillSearch({
    trigger: 'attack',
    agentId: 'agent-123',
    sessionId: 'session-abc',
    platform: 'OpenClaw',
    clientIp: '127.0.0.1',
  });

  assert.equal(result.body.status, 'success');
  const logCall = calls.find((call) => call.sql.includes('INSERT INTO agent_logs'));
  assert.ok(logCall);
  assert.deepEqual(logCall.params, [
    7,
    'agent-123',
    'session-abc',
    'OpenClaw',
    '127.0.0.1',
    'attack',
    'success',
  ]);
});

test('returns intercept when prerequisite exists', async () => {
  const { resolveSkillSearch } = loadServiceWithMock(async (sql) => {
    if (sql.includes('FROM skills')) {
      return [[{
        id: 9,
        name: 'Advanced Combat',
        content: 'Advanced content',
        created_at: new Date('2026-04-10T10:00:00Z'),
      }]];
    }
    if (sql.includes('FROM edges')) {
      return [[{
        id: 2,
        name: 'Combat Basics',
        content: 'Do basics first',
      }]];
    }
    return [{ affectedRows: 1 }];
  });

  const result = await resolveSkillSearch({
    trigger: 'strike',
    agentId: null,
    sessionId: null,
    platform: null,
    clientIp: '127.0.0.1',
  });

  assert.equal(result.body.status, 'intercept');
  assert.equal(result.body.data.intercepted_by.name, 'Combat Basics');
});

test('returns not_found when no skill matches trigger', async () => {
  const { resolveSkillSearch } = loadServiceWithMock(async (sql) => {
    if (sql.includes('FROM skills')) {
      return [[]];
    }
    return [{ affectedRows: 1 }];
  });

  const result = await resolveSkillSearch({
    trigger: 'unknown',
    agentId: 'agent-1',
    sessionId: 'session-1',
    platform: 'OpenClaw',
    clientIp: '127.0.0.1',
  });

  assert.equal(result.body.status, 'not_found');
});

test('returns ambiguous for tied top ranked skills', async () => {
  const tiedTimestamp = new Date('2026-04-10T10:00:00Z');
  const { resolveSkillSearch } = loadServiceWithMock(async (sql) => {
    if (sql.includes('FROM skills')) {
      return [[
        { id: 1, name: 'Skill One', created_at: tiedTimestamp },
        { id: 2, name: 'Skill Two', created_at: tiedTimestamp },
      ]];
    }
    return [{ affectedRows: 1 }];
  });

  const result = await resolveSkillSearch({
    trigger: 'move',
    agentId: 'agent-1',
    sessionId: 'session-1',
    platform: 'OpenClaw',
    clientIp: '127.0.0.1',
  });

  assert.equal(result.body.status, 'ambiguous');
  assert.equal(result.body.candidates.length, 2);
});
