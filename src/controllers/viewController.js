const pool = require('../db/db');
const matter = require('gray-matter');
const { marked } = require('marked');

// GET /dashboard — list all skills
exports.index = async (_req, res) => {
  try {
    const [skills] = await pool.query(
      'SELECT id, name, description, triggers, created_at FROM skills ORDER BY created_at DESC'
    );
    res.render('index', { title: 'Dashboard', skills });
  } catch (err) {
    console.error('viewController.index error:', err);
    res.status(500).send('Internal server error');
  }
};

// GET /dashboard/create — render upload form
exports.createForm = (_req, res) => {
  res.render('create', { title: 'Upload Skill' });
};

// POST /dashboard/create — process form submission
exports.createSkill = async (req, res) => {
  try {
    const { markdown } = req.body;
    if (!markdown || typeof markdown !== 'string') {
      return res.status(400).send('Markdown content is required');
    }

    const { data: frontmatter, content } = matter(markdown);

    const name = frontmatter.name || 'Untitled Skill';
    const description = frontmatter.description || null;
    const triggers = frontmatter.triggers || [];

    const [result] = await pool.query(
      'INSERT INTO skills (user_id, name, description, content, triggers) VALUES (?, ?, ?, ?, ?)',
      [1, name, description, content, JSON.stringify(triggers)]
    );

    // Auto-create a node for the skill tree (1-to-1 with skill)
    await pool.query(
      'INSERT INTO nodes (user_id, skill_id, x_coordinate, y_coordinate) VALUES (?, ?, 0.0, 0.0)',
      [1, result.insertId]
    );

    res.redirect(`/dashboard/skills/${result.insertId}`);
  } catch (err) {
    console.error('viewController.createSkill error:', err);
    res.status(500).send('Internal server error');
  }
};

// GET /dashboard/skills/:id — view skill with rendered markdown
exports.viewSkill = async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM skills WHERE id = ?', [
      req.params.id,
    ]);
    if (rows.length === 0) return res.status(404).send('Skill not found');

    const skill = rows[0];
    const renderedHtml = marked.parse(skill.content);

    res.render('view', { title: skill.name, skill, renderedHtml });
  } catch (err) {
    console.error('viewController.viewSkill error:', err);
    res.status(500).send('Internal server error');
  }
};

// GET /dashboard/skills/:id/edit — render edit form
exports.editForm = async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM skills WHERE id = ?', [
      req.params.id,
    ]);
    if (rows.length === 0) return res.status(404).send('Skill not found');

    const skill = rows[0];
    const triggers =
      typeof skill.triggers === 'string'
        ? JSON.parse(skill.triggers)
        : skill.triggers || [];

    res.render('edit', { title: `Edit — ${skill.name}`, skill, triggers });
  } catch (err) {
    console.error('viewController.editForm error:', err);
    res.status(500).send('Internal server error');
  }
};

// POST /dashboard/skills/:id/edit — process edit
exports.updateSkill = async (req, res) => {
  try {
    const { markdown } = req.body;
    if (!markdown || typeof markdown !== 'string') {
      return res.status(400).send('Markdown content is required');
    }

    const { data: frontmatter, content } = matter(markdown);

    const name = frontmatter.name || 'Untitled Skill';
    const description = frontmatter.description || null;
    const triggers = frontmatter.triggers || [];

    const [result] = await pool.query(
      'UPDATE skills SET name = ?, description = ?, content = ?, triggers = ? WHERE id = ?',
      [name, description, content, JSON.stringify(triggers), req.params.id]
    );

    if (result.affectedRows === 0) return res.status(404).send('Skill not found');
    res.redirect(`/dashboard/skills/${req.params.id}`);
  } catch (err) {
    console.error('viewController.updateSkill error:', err);
    res.status(500).send('Internal server error');
  }
};

// POST /dashboard/skills/:id/delete — delete and redirect
exports.deleteSkill = async (req, res) => {
  try {
    await pool.query('DELETE FROM skills WHERE id = ?', [req.params.id]);
    res.redirect('/dashboard');
  } catch (err) {
    console.error('viewController.deleteSkill error:', err);
    res.status(500).send('Internal server error');
  }
};

// GET /dashboard/tree — render skill tree page with skills list for edge linking
exports.tree = async (_req, res) => {
  try {
    const [skills] = await pool.query('SELECT id, name FROM skills ORDER BY name');
    res.render('tree', { title: 'Skill Tree', skills });
  } catch (err) {
    console.error('viewController.tree error:', err);
    res.status(500).send('Internal server error');
  }
};

// GET /dashboard/logs — agent query history
exports.logs = async (_req, res) => {
  try {
    const [logs] = await pool.query(
      `SELECT al.id, al.skill_id, s.name AS skill_name, al.outcome, al.used_at,
              al.agent_id, al.client_ip, al.query
       FROM agent_logs al
       LEFT JOIN skills s ON al.skill_id = s.id
       ORDER BY al.used_at DESC
       LIMIT 100`
    );
    res.render('logs', { title: 'Agent Logs', logs });
  } catch (err) {
    console.error('viewController.logs error:', err);
    res.status(500).send('Internal server error');
  }
};

// GET /dashboard/help — documentation page
exports.help = (_req, res) => {
  res.render('help', { title: 'Help' });
};

// GET /api/tree-data — JSON payload for vis-network
exports.treeData = async (_req, res) => {
  try {
    const [nodes] = await pool.query(
      `SELECT n.id, n.skill_id, s.name AS label, n.x_coordinate AS x, n.y_coordinate AS y
       FROM nodes n
       JOIN skills s ON n.skill_id = s.id`
    );
    const [edges] = await pool.query(
      'SELECT id, source_node_id AS `from`, target_node_id AS `to` FROM edges'
    );
    res.json({ nodes, edges });
  } catch (err) {
    console.error('viewController.treeData error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};
