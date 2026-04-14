const pool = require('../db/db');

// Validate that a value is a positive integer (matches skillController pattern)
function isPositiveInt(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0;
}

// BFS walk: returns true if adding from→to would create a cycle.
// A cycle exists when "to" is already an ancestor of "from".
async function wouldCreateCycle(fromNodeId, toNodeId) {
  const visited = new Set();
  const queue = [fromNodeId];

  while (queue.length > 0) {
    const current = queue.shift();
    if (current === toNodeId) return true;
    if (visited.has(current)) continue;
    visited.add(current);

    const [parents] = await pool.query(
      'SELECT source_node_id FROM edges WHERE target_node_id = ?',
      [current]
    );
    for (const row of parents) {
      if (!visited.has(row.source_node_id)) {
        queue.push(row.source_node_id);
      }
    }
  }
  return false;
}

// POST /api/edges — { from_skill_id, to_skill_id }
// Creates a directed prerequisite link: from_skill_id is the prerequisite,
// to_skill_id is the dependent. Resolves skill IDs to node IDs internally.
exports.create = async (req, res) => {
  try {
    const { from_skill_id, to_skill_id } = req.body;

    if (!from_skill_id || !to_skill_id) {
      return res.status(400).json({ error: 'from_skill_id and to_skill_id are required' });
    }
    if (!isPositiveInt(from_skill_id) || !isPositiveInt(to_skill_id)) {
      return res.status(400).json({ error: 'Skill IDs must be positive integers' });
    }
    if (Number(from_skill_id) === Number(to_skill_id)) {
      return res.status(400).json({ error: 'A skill cannot be its own prerequisite' });
    }

    // Look up node IDs from skill IDs
    const [fromNodes] = await pool.query(
      'SELECT id FROM nodes WHERE skill_id = ?', [from_skill_id]
    );
    const [toNodes] = await pool.query(
      'SELECT id FROM nodes WHERE skill_id = ?', [to_skill_id]
    );

    if (fromNodes.length === 0 || toNodes.length === 0) {
      return res.status(404).json({ error: 'One or both skills do not have nodes' });
    }

    // Check if this edge already exists
    const [existing] = await pool.query(
      'SELECT id FROM edges WHERE source_node_id = ? AND target_node_id = ?',
      [fromNodes[0].id, toNodes[0].id]
    );
    if (existing.length > 0) {
      return res.status(409).json({ error: 'This prerequisite link already exists' });
    }

    // Cycle detection: ensure "to" is not already an ancestor of "from"
    if (await wouldCreateCycle(fromNodes[0].id, toNodes[0].id)) {
      return res.status(409).json({ error: 'This edge would create a circular dependency' });
    }

    const [result] = await pool.query(
      'INSERT INTO edges (user_id, source_node_id, target_node_id) VALUES (?, ?, ?)',
      [1, fromNodes[0].id, toNodes[0].id]
    );

    res.status(201).json({ id: result.insertId, source_node_id: fromNodes[0].id, target_node_id: toNodes[0].id });
  } catch (err) {
    console.error('edgeController.create error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// DELETE /api/edges/:id
// Removes a prerequisite link. Called from the vis-network tree page toolbar.
exports.remove = async (req, res) => {
  try {
    if (!isPositiveInt(req.params.id)) {
      return res.status(400).json({ error: 'Invalid edge ID' });
    }

    const [result] = await pool.query('DELETE FROM edges WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Edge not found' });
    res.json({ message: 'Edge deleted' });
  } catch (err) {
    console.error('edgeController.remove error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};
