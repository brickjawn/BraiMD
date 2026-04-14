#!/usr/bin/env node

/**
 * BraiMD — Fabric Pattern Importer
 *
 * Fetches curated AI prompt patterns from Daniel Miessler's Fabric project
 * (https://github.com/danielmiessler/fabric) and ingests them into the
 * local BraiMD database via the REST API.
 *
 * Usage:
 *   node scripts/import_fabric.js
 *
 * Requirements:
 *   - BraiMD server running at http://localhost:3000
 *   - Node.js 18+ (native fetch)
 */

const API_URL = process.env.BRAIMD_API || 'http://localhost:3000/api/skills';
const USER_ID = 1;

// ============================================================
// Curated list of popular Fabric patterns to import.
// Each entry maps a folder name to a human-readable title and triggers.
// ============================================================
const PATTERNS = [
  {
    folder: 'extract_wisdom',
    name: 'Extract Wisdom',
    description: 'Extract key insights, ideas, quotes, and recommendations from any content.',
    triggers: ['extract_wisdom', 'insights', 'key_takeaways', 'summarize_wisdom'],
  },
  {
    folder: 'analyze_claims',
    name: 'Analyze Claims',
    description: 'Evaluate claims for logical validity, evidence strength, and bias.',
    triggers: ['analyze_claims', 'fact_check', 'critical_thinking', 'evaluate'],
  },
  {
    folder: 'write_essay',
    name: 'Write Essay',
    description: 'Produce a well-structured essay on any given topic.',
    triggers: ['write_essay', 'essay', 'writing', 'compose'],
  },
  {
    folder: 'improve_writing',
    name: 'Improve Writing',
    description: 'Enhance clarity, tone, and structure of existing text.',
    triggers: ['improve_writing', 'edit_text', 'rewrite', 'polish'],
  },
  {
    folder: 'explain_code',
    name: 'Explain Code',
    description: 'Provide a clear, step-by-step explanation of a code snippet.',
    triggers: ['explain_code', 'code_explanation', 'understand_code', 'walkthrough'],
  },
  {
    folder: 'create_quiz',
    name: 'Create Quiz',
    description: 'Generate quiz questions from source material for learning reinforcement.',
    triggers: ['create_quiz', 'quiz', 'questions', 'assessment'],
  },
  {
    folder: 'summarize',
    name: 'Summarize',
    description: 'Produce a concise summary of any content while preserving key details.',
    triggers: ['summarize', 'summary', 'tldr', 'condense'],
  },
  {
    folder: 'rate_content',
    name: 'Rate Content',
    description: 'Rate and review content quality across multiple dimensions.',
    triggers: ['rate_content', 'review', 'quality_score', 'evaluate_content'],
  },
  {
    folder: 'improve_prompt',
    name: 'Improve Prompt',
    description: 'Refine and enhance AI prompts for better outputs.',
    triggers: ['improve_prompt', 'prompt_engineering', 'refine_prompt', 'optimize_prompt'],
  },
  {
    folder: 'create_markmap',
    name: 'Create Mind Map',
    description: 'Generate a structured mind map from content using Markmap syntax.',
    triggers: ['create_markmap', 'mind_map', 'brainstorm', 'visualize'],
  },
];

// ============================================================
// Fetch a single pattern's system.md from GitHub raw content
// ============================================================
async function fetchPattern(folder) {
  const url = `https://raw.githubusercontent.com/danielmiessler/fabric/main/data/patterns/${folder}/system.md`;
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${folder}`);
  }

  return res.text();
}

// ============================================================
// Build YAML frontmatter + content and POST to BraiMD API
// ============================================================
async function ingestSkill(pattern, content) {
  const frontmatter = [
    '---',
    `name: "${pattern.name}"`,
    `description: "${pattern.description}"`,
    `triggers: ${JSON.stringify(pattern.triggers)}`,
    '---',
  ].join('\n');

  const markdown = frontmatter + '\n' + content;

  const headers = { 'Content-Type': 'application/json' };
  if (process.env.BRAIMD_API_KEY) {
    headers['x-api-key'] = process.env.BRAIMD_API_KEY;
  }

  const res = await fetch(API_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({ user_id: USER_ID, markdown }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }

  return res.json();
}

// ============================================================
// Main
// ============================================================
async function main() {
  console.log('\n  BraiMD — Fabric Pattern Importer');
  console.log('  ─────────────────────────────────\n');

  // Verify the BraiMD server is reachable
  try {
    const health = await fetch(API_URL.replace('/api/skills', '/health'));
    if (!health.ok) throw new Error();
    console.log('  [OK] BraiMD server is reachable.\n');
  } catch {
    console.error('  [ERROR] Cannot reach BraiMD at ' + API_URL.replace('/api/skills', ''));
    console.error('         Make sure the server is running (podman-compose up -d).\n');
    process.exit(1);
  }

  let imported = 0;
  let skipped = 0;

  for (const pattern of PATTERNS) {
    process.stdout.write(`  Importing "${pattern.name}" ... `);

    try {
      const content = await fetchPattern(pattern.folder);
      const result = await ingestSkill(pattern, content);
      console.log(`OK (id: ${result.id})`);
      imported++;
    } catch (err) {
      console.log(`SKIPPED (${err.message})`);
      skipped++;
    }

    // Small delay to be kind to GitHub rate limits
    await new Promise(r => setTimeout(r, 300));
  }

  console.log(`\n  Done. ${imported} imported, ${skipped} skipped.`);
  console.log('  View them at http://localhost:3000/dashboard\n');
}

main();
