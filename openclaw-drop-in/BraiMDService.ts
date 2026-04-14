/**
 * BraiMDService — Thin HTTP client for the BraiMD skill vault.
 *
 * OpenClaw is a "thin client" orchestrator. All trigger matching and
 * prerequisite logic lives in BraiMD. This service simply fetches
 * context and returns markdown for the system prompt.
 *
 * Drop into: src/services/BraiMDService.ts (OpenClaw repo on pavlaptop)
 *
 * Required env vars:
 *   BRAIMD_URL       — e.g. http://10.0.0.2:3000
 *   BRAIMD_API_KEY   — shared secret matching BraiMD's API_KEY_HASH
 */

const BRAIMD_URL = process.env.BRAIMD_URL || 'http://10.0.0.2:3000';
const BRAIMD_API_KEY = process.env.BRAIMD_API_KEY || '';
const TIMEOUT_MS = 2000;

interface InterceptedBy {
  skill_id: number;
  name: string;
  content: string;
  reason: string;
}

interface BraiMDSuccessResponse {
  status: 'success';
  data: {
    skill_id: number;
    name: string;
    content: string;
    prerequisites_cleared: true;
  };
}

interface BraiMDInterceptResponse {
  status: 'intercept';
  data: {
    requested_trigger: string;
    intercepted_by: InterceptedBy;
    prerequisites_cleared: false;
  };
}

type BraiMDSearchResponse =
  | BraiMDSuccessResponse
  | BraiMDInterceptResponse
  | { status: 'not_found'; message: string }
  | { status: 'ambiguous'; trigger: string; message: string; candidates: unknown[] };

/**
 * Query BraiMD for skill context matching a trigger word.
 *
 * Circuit breaker: if the request fails or exceeds 2s, logs a warning
 * and returns an empty string so OpenClaw proceeds with base knowledge.
 */
export async function fetchSkillContext(
  triggerWord: string,
  sessionId: string,
  platform: string,
): Promise<string> {
  const url = new URL('/api/skills/search', BRAIMD_URL);
  url.searchParams.set('trigger', triggerWord);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'x-api-key': BRAIMD_API_KEY,
        'X-Agent-ID': 'openclaw-gateway',
        'X-Session-ID': sessionId,
        'X-Platform-Source': platform,
      },
      signal: controller.signal,
    });

    if (!res.ok) {
      console.warn(`[BraiMDService] HTTP ${res.status} from BraiMD`);
      return '';
    }

    const body: BraiMDSearchResponse = await res.json();

    if (body.status === 'success') {
      return body.data.content;
    }

    if (body.status === 'intercept') {
      const prereq = body.data.intercepted_by;
      return (
        `⚠️ PREREQUISITE NOT MET: ${prereq.reason}\n` +
        `--- Prerequisite Skill: ${prereq.name} ---\n\n` +
        prereq.content
      );
    }

    // not_found or ambiguous — no context to inject
    return '';
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[BraiMDService] Circuit breaker tripped: ${message}`);
    return '';
  } finally {
    clearTimeout(timer);
  }
}
