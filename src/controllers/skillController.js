const pool = require('../db/db');
const matter = require('gray-matter');
const {
  buildSearchContext,
  resolveSkillSearch,
} = require('../services/skillSearchService');
const {
  createSkillWithInitialVersion,
  updateSkillWithNewVersion,
  findSkillWithActiveContentById,
} = require('../services/skillVersionService');

// Validate that a value is a positive integer
function isPositiveInt(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0;
}

// GET /api/skills
// Without ?trigger → list all skills (dashboard use)
// With ?trigger=keyword → delegated search flow for backwards compatibility
exports.list = async (req, res) => {
  try {
    const { trigger } = req.query;

    if (trigger) {
      return exports.search(req, res);
    }

    const [rows] = await pool.query(
      'SELECT id, name, description, triggers, created_at FROM skills'
    );
    return res.json(rows);
  } catch (err) {
    console.error('skillController.list error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// GET /api/skills/search?trigger=keyword
exports.search = async (req, res) => {
  try {
    const context = buildSearchContext(req);
    const result = await resolveSkillSearch(context);
    return res.status(result.httpStatus).json(result.body);
  } catch (err) {
    console.error('skillController.search error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// GET /api/skills/:id
exports.getById = async (req, res) => {
  try {
    if (!isPositiveInt(req.params.id)) {
      return res.status(400).json({ error: 'Invalid skill ID' });
    }

    const rows = await findSkillWithActiveContentById(req.params.id);
    if (rows.length === 0) return res.status(404).json({ error: 'Skill not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('skillController.getById error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// POST /api/skills — accepts { user_id?, markdown }
exports.create = async (req, res) => {
  try {
    const { user_id, markdown } = req.body;

    // Phase 1 scaffold: allow omitted/null user_id and default to seed user.
    // Phase 2 session auth will replace this with req.session.user.id.
    const effectiveUserId = user_id == null ? 1 : Number(user_id);
    if (!isPositiveInt(effectiveUserId)) {
      return res.status(400).json({ error: 'Valid user_id is required when provided' });
    }
    if (!markdown || typeof markdown !== 'string') {
      return res.status(400).json({ error: 'markdown string is required' });
    }

    const { data: frontmatter, content } = matter(markdown);

    const name = frontmatter.name || 'Untitled Skill';
    const description = frontmatter.description || null;
    const triggers = frontmatter.triggers || [];

    const created = await createSkillWithInitialVersion({
      userId: effectiveUserId,
      name,
      description,
      content,
      triggers,
      changelog: 'Created via API',
    });

    res.status(201).json({ id: created.id, name, triggers });
  } catch (err) {
    console.error('skillController.create error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// PUT /api/skills/:id — accepts { markdown }
exports.update = async (req, res) => {
  try {
    if (!isPositiveInt(req.params.id)) {
      return res.status(400).json({ error: 'Invalid skill ID' });
    }

    const { markdown } = req.body;
    if (!markdown || typeof markdown !== 'string') {
      return res.status(400).json({ error: 'markdown string is required' });
    }

    const { data: frontmatter, content } = matter(markdown);

    const name = frontmatter.name || 'Untitled Skill';
    const description = frontmatter.description || null;
    const triggers = frontmatter.triggers || [];

    const updated = await updateSkillWithNewVersion({
      skillId: Number(req.params.id),
      name,
      description,
      content,
      triggers,
      createdByUserId: 1,
      changelog: 'Updated via API',
    });

    if (!updated.found) return res.status(404).json({ error: 'Skill not found' });
    res.json({ id: Number(req.params.id), name, triggers });
  } catch (err) {
    console.error('skillController.update error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// DELETE /api/skills/:id
exports.remove = async (req, res) => {
  try {
    if (!isPositiveInt(req.params.id)) {
      return res.status(400).json({ error: 'Invalid skill ID' });
    }

    const [result] = await pool.query('DELETE FROM skills WHERE id = ?', [
      req.params.id,
    ]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Skill not found' });
    res.json({ message: 'Skill deleted' });
  } catch (err) {
    console.error('skillController.remove error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};
