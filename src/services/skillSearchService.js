const pool = require('../db/db');

function buildSearchContext(req) {
  return {
    trigger: req.query.trigger,
    agentId: req.get('X-Agent-ID') || null,
    sessionId: req.get('X-Session-ID') || null,
    platform: req.get('X-Platform-Source') || null,
    clientIp: req.ip,
  };
}

async function findMatchingSkills(trigger) {
  const [rows] = await pool.query(
    `SELECT id, name, description, content, triggers, created_at
     FROM skills
     WHERE JSON_CONTAINS(triggers, ?)
     ORDER BY created_at DESC, id DESC`,
    [JSON.stringify(trigger)]
  );
  return rows;
}

async function findImmediatePrerequisites(skillId) {
  const [rows] = await pool.query(
    `SELECT s.id, s.name, s.content
     FROM edges e
     JOIN nodes child_node ON child_node.id = e.target_node_id
     JOIN nodes parent_node ON parent_node.id = e.source_node_id
     JOIN skills s ON s.id = parent_node.skill_id
     WHERE child_node.skill_id = ?
     ORDER BY s.created_at DESC, s.id DESC`,
    [skillId]
  );
  return rows;
}

async function insertAgentLog(logPayload) {
  await pool.query(
    `INSERT INTO agent_logs
      (skill_id, agent_id, session_id, platform, client_ip, query, outcome)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      logPayload.skillId,
      logPayload.agentId,
      logPayload.sessionId,
      logPayload.platform,
      logPayload.clientIp,
      logPayload.query,
      logPayload.outcome,
    ]
  );
}

async function safeInsertAgentLog(logPayload) {
  try {
    await insertAgentLog(logPayload);
  } catch (_err) {
    // Logging must not block search responses.
  }
}

function normalizeTimestamp(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.getTime();
}

function buildAmbiguousResponse(trigger, skills) {
  const candidates = skills.slice(0, 5).map((skill) => ({
    skill_id: skill.id,
    skill_name: skill.name,
  }));

  return {
    status: 'ambiguous',
    trigger,
    message: 'Multiple skills match this trigger. Provide a narrower trigger.',
    candidates,
  };
}

async function resolveSkillSearch(context) {
  const trigger = typeof context.trigger === 'string' ? context.trigger.trim() : '';

  if (!trigger) {
    return {
      httpStatus: 400,
      body: { error: 'trigger query parameter is required' },
    };
  }

  const skills = await findMatchingSkills(trigger);
  if (skills.length === 0) {
    await safeInsertAgentLog({
      skillId: null,
      agentId: context.agentId,
      sessionId: context.sessionId,
      platform: context.platform,
      clientIp: context.clientIp,
      query: trigger,
      outcome: 'not_found',
    });

    return {
      httpStatus: 200,
      body: { status: 'not_found', message: 'No skill matches that trigger.' },
    };
  }

  const topSkill = skills[0];
  const topCreatedAt = normalizeTimestamp(topSkill.created_at);
  const secondCreatedAt = skills[1] ? normalizeTimestamp(skills[1].created_at) : null;
  const tied = skills[1] && topCreatedAt !== null && secondCreatedAt !== null && topCreatedAt === secondCreatedAt;
  if (tied) {
    const ambiguousBody = buildAmbiguousResponse(trigger, skills);
    await safeInsertAgentLog({
      skillId: topSkill.id,
      agentId: context.agentId,
      sessionId: context.sessionId,
      platform: context.platform,
      clientIp: context.clientIp,
      query: trigger,
      outcome: 'ambiguous',
    });
    return {
      httpStatus: 200,
      body: ambiguousBody,
    };
  }

  const prerequisites = await findImmediatePrerequisites(topSkill.id);
  if (prerequisites.length > 0) {
    const firstPrerequisite = prerequisites[0];
    await safeInsertAgentLog({
      skillId: topSkill.id,
      agentId: context.agentId,
      sessionId: context.sessionId,
      platform: context.platform,
      clientIp: context.clientIp,
      query: trigger,
      outcome: 'intercept',
    });

    return {
      httpStatus: 200,
      body: {
        status: 'intercept',
        skill_name: topSkill.name,
        prerequisite: {
          skill_id: firstPrerequisite.id,
          skill_name: firstPrerequisite.name,
          content: firstPrerequisite.content,
        },
        message: `You must complete "${firstPrerequisite.name}" before "${topSkill.name}".`,
      },
    };
  }

  await safeInsertAgentLog({
    skillId: topSkill.id,
    agentId: context.agentId,
    sessionId: context.sessionId,
    platform: context.platform,
    clientIp: context.clientIp,
    query: trigger,
    outcome: 'found',
  });

  return {
    httpStatus: 200,
    body: {
      status: 'found',
      skill_id: topSkill.id,
      skill_name: topSkill.name,
      content: topSkill.content,
    },
  };
}

module.exports = {
  buildSearchContext,
  resolveSkillSearch,
};
