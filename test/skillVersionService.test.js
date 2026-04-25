const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

function loadServiceWithMockPool(mockPool) {
  const dbModulePath = path.resolve(__dirname, '../src/db/db.js');
  const serviceModulePath = path.resolve(__dirname, '../src/services/skillVersionService.js');

  delete require.cache[dbModulePath];
  delete require.cache[serviceModulePath];

  require.cache[dbModulePath] = {
    id: dbModulePath,
    filename: dbModulePath,
    loaded: true,
    exports: mockPool,
  };

  return require(serviceModulePath);
}

function createMockConnection(handler) {
  const calls = [];
  return {
    calls,
    connection: {
      async beginTransaction() {
        calls.push({ method: 'beginTransaction' });
      },
      async query(sql, params) {
        calls.push({ method: 'query', sql, params });
        return handler(sql, params);
      },
      async commit() {
        calls.push({ method: 'commit' });
      },
      async rollback() {
        calls.push({ method: 'rollback' });
      },
      release() {
        calls.push({ method: 'release' });
      },
    },
  };
}

test('createSkillWithInitialVersion inserts skill, v1, active pointer, and node in one transaction', async () => {
  const { calls, connection } = createMockConnection(async (sql) => {
    if (sql.includes('INSERT INTO skills')) {
      return [{ insertId: 42 }];
    }
    if (sql.includes('INSERT INTO skill_versions')) {
      return [{ insertId: 101 }];
    }
    return [{ affectedRows: 1 }];
  });
  const { createSkillWithInitialVersion } = loadServiceWithMockPool({
    getConnection: async () => connection,
  });

  const result = await createSkillWithInitialVersion({
    userId: 1,
    name: 'Skill',
    description: 'Desc',
    triggers: ['move'],
    content: 'Body',
    createdByUserId: 1,
    changelog: 'Created',
  });

  assert.deepEqual(result, { id: 42, activeVersionId: 101 });
  assert.deepEqual(
    calls.map((call) => call.method),
    ['beginTransaction', 'query', 'query', 'query', 'query', 'commit', 'release']
  );
  assert.ok(calls[1].sql.includes('INSERT INTO skills'));
  assert.ok(calls[2].sql.includes('INSERT INTO skill_versions'));
  assert.ok(calls[3].sql.includes('UPDATE skills SET active_version_id'));
  assert.ok(calls[4].sql.includes('INSERT INTO nodes'));
});

test('updateSkillWithNewVersion creates next published version and advances active pointer', async () => {
  const { calls, connection } = createMockConnection(async (sql) => {
    if (sql.includes('UPDATE skills SET name')) {
      return [{ affectedRows: 1 }];
    }
    if (sql.includes('MAX(version_number)')) {
      return [[{ next_version: 3 }]];
    }
    if (sql.includes('INSERT INTO skill_versions')) {
      return [{ insertId: 303 }];
    }
    return [{ affectedRows: 1 }];
  });
  const { updateSkillWithNewVersion } = loadServiceWithMockPool({
    getConnection: async () => connection,
  });

  const result = await updateSkillWithNewVersion({
    skillId: 7,
    name: 'Updated',
    description: 'Desc',
    triggers: ['attack'],
    content: 'New body',
    createdByUserId: 1,
    changelog: 'Updated',
  });

  assert.deepEqual(result, {
    found: true,
    activeVersionId: 303,
    versionNumber: 3,
  });
  assert.ok(calls.find((call) => call.sql && call.sql.includes('SELECT COALESCE(MAX(version_number)')));
  assert.ok(calls.find((call) => call.sql && call.sql.includes('INSERT INTO skill_versions')));
  assert.ok(calls.find((call) => call.sql && call.sql.includes('UPDATE skills SET active_version_id')));
  assert.equal(calls.some((call) => call.method === 'rollback'), false);
});

test('updateSkillWithNewVersion rolls back and reports not found when skill update misses', async () => {
  const { calls, connection } = createMockConnection(async (sql) => {
    if (sql.includes('UPDATE skills SET name')) {
      return [{ affectedRows: 0 }];
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  });
  const { updateSkillWithNewVersion } = loadServiceWithMockPool({
    getConnection: async () => connection,
  });

  const result = await updateSkillWithNewVersion({
    skillId: 404,
    name: 'Missing',
    description: null,
    triggers: [],
    content: 'Body',
    createdByUserId: 1,
  });

  assert.deepEqual(result, { found: false });
  assert.ok(calls.find((call) => call.method === 'rollback'));
  assert.equal(calls.some((call) => call.method === 'commit'), false);
});
