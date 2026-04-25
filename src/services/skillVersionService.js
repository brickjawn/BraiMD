const pool = require('../db/db');

async function createSkillWithInitialVersion({
  userId,
  name,
  description,
  triggers,
  content,
  createdByUserId = userId,
  changelog = 'Initial version',
}) {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [skillResult] = await connection.query(
      'INSERT INTO skills (user_id, name, description, triggers) VALUES (?, ?, ?, ?)',
      [userId, name, description, JSON.stringify(triggers)]
    );

    const skillId = skillResult.insertId;
    const [versionResult] = await connection.query(
      `INSERT INTO skill_versions
        (skill_id, version_number, status, content, created_by_user_id, changelog)
       VALUES (?, 1, 'published', ?, ?, ?)`,
      [skillId, content, createdByUserId, changelog]
    );

    await connection.query(
      'UPDATE skills SET active_version_id = ? WHERE id = ?',
      [versionResult.insertId, skillId]
    );

    await connection.query(
      'INSERT INTO nodes (user_id, skill_id, x_coordinate, y_coordinate) VALUES (?, ?, 0.0, 0.0)',
      [userId, skillId]
    );

    await connection.commit();
    return { id: skillId, activeVersionId: versionResult.insertId };
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

async function updateSkillWithNewVersion({
  skillId,
  name,
  description,
  triggers,
  content,
  createdByUserId = 1,
  changelog,
}) {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [updateResult] = await connection.query(
      'UPDATE skills SET name = ?, description = ?, triggers = ? WHERE id = ?',
      [name, description, JSON.stringify(triggers), skillId]
    );

    if (updateResult.affectedRows === 0) {
      await connection.rollback();
      return { found: false };
    }

    const [versionRows] = await connection.query(
      'SELECT COALESCE(MAX(version_number), 0) + 1 AS next_version FROM skill_versions WHERE skill_id = ?',
      [skillId]
    );
    const nextVersion = versionRows[0].next_version;

    const [versionResult] = await connection.query(
      `INSERT INTO skill_versions
        (skill_id, version_number, status, content, created_by_user_id, changelog)
       VALUES (?, ?, 'published', ?, ?, ?)`,
      [skillId, nextVersion, content, createdByUserId, changelog || `Published version ${nextVersion}`]
    );

    await connection.query(
      'UPDATE skills SET active_version_id = ? WHERE id = ?',
      [versionResult.insertId, skillId]
    );

    await connection.commit();
    return {
      found: true,
      activeVersionId: versionResult.insertId,
      versionNumber: nextVersion,
    };
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

async function findSkillWithActiveContentById(skillId) {
  const [rows] = await pool.query(
    `SELECT s.*, sv.content, sv.version_number, sv.status AS version_status
     FROM skills s
     LEFT JOIN skill_versions sv ON sv.id = s.active_version_id
     WHERE s.id = ?`,
    [skillId]
  );
  return rows;
}

module.exports = {
  createSkillWithInitialVersion,
  updateSkillWithNewVersion,
  findSkillWithActiveContentById,
};
