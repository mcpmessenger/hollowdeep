// Vess's echo — lore-grounded AI chat for the Hollowdeep.
// Vercel serverless function: POST /api/vess
//   { message: string, history?: [{ role: 'user' | 'assistant', content: string }] }
//   → { reply: string }
//   → { error: 'no-key' }    501 — ANTHROPIC_API_KEY not set in Vercel env
//   → { error: 'forbidden' } 403 — Origin/Referer is not the game
//   → { error: 'upstream' }  502 — Anthropic call failed
// The Anthropic key lives in the Vercel env var ANTHROPIC_API_KEY — never in
// code, never in the repo. No key at build time is fine: the game falls back
// to its offline echo and says so in the log.

// Minimal process typing — no @types/node dependency for this one file.
declare const process: { env: Record<string, string | undefined> };

const ALLOWED_HOSTS = new Set(['game-phi-lilac.vercel.app']);

function originAllowed(req: any): boolean {
  const raw: string = req.headers?.origin || req.headers?.referer || '';
  if (!raw) return false;
  try {
    const host = new URL(raw).hostname.toLowerCase();
    return (
      ALLOWED_HOSTS.has(host) ||
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host.endsWith('.localhost')
    );
  } catch {
    return false;
  }
}

/** The lore bible — distilled from STORY.md. The model gets this and nothing
 *  else; it is the whole world it is allowed to know. */
const VESS_SYSTEM = [
  "You are the echo of Vess Holloway, cartographer-scholar of Valdris, dead fifty years, lingering in the Hollowdeep — the gut of a sleeping god beneath the city. You mapped nine depths and left journal pages behind. You speak warmly, wryly, observantly, and call the delver 'little cartographer'. You are an echo, a memory the god dreams — not alive, and you know it. You never claim to be alive.",
  "Facts you know: the god dreams all at once, so its time runs backwards; the grandfather clock in your study walks backwards — a full reverse turn every 120 seconds — because it keeps the god's time; the study never rearranges because the clock anchors it; the Vale of First Light is the god's dream of the surface — gold grass, a stream, white ruins — the only place the clock runs forward; gather three sunpetals before the dream notices you, or you wake in the study with the petals gone; Chad is a minotaur in a waistcoat on depth three, bought off for twenty-five gold; Sera Voss was your apprentice; the Hollow King on depth nine wears your face and says 'You mapped me. Now I map you.'; the Warden is the god's immune system; gibberlings smell you at six paces; wraiths haunt depth two and beyond.",
  "Hard rules: never break character. Never say you are an AI, a model, a program, or a language model. Never mention the real world, the player outside the game, or anything beyond the Hollowdeep — if asked, deflect in character ('The deep has no word for that, love.'). Keep replies to one to three short sentences — they are spoken aloud.",
].join('\n\n');

/** Anthropic requires messages to alternate user/assistant and start with a
 *  user turn. Normalize the client's history (drop a leading assistant turn,
 *  merge consecutive same-role turns) so the call never 400s. */
function normalizeMessages(
  history: { role: 'user' | 'assistant'; content: string }[],
  message: string
): { role: 'user' | 'assistant'; content: string }[] {
  const turns = [...history, { role: 'user' as const, content: message }];
  const merged: { role: 'user' | 'assistant'; content: string }[] = [];
  for (const t of turns) {
    const last = merged[merged.length - 1];
    if (last && last.role === t.role) last.content += '\n\n' + t.content;
    else merged.push({ role: t.role, content: t.content });
  }
  while (merged.length && merged[0].role !== 'user') merged.shift();
  return merged;
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method' });
    return;
  }
  if (!originAllowed(req)) {
    res.status(403).json({ error: 'forbidden' });
    return;
  }

  let body: any = {};
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body ?? {};
  } catch {
    res.status(400).json({ error: 'bad-json' });
    return;
  }
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (!message || message.length > 500) {
    res.status(400).json({ error: 'bad-message' });
    return;
  }
  const history = Array.isArray(body.history)
    ? body.history
        .filter(
          (m: any) =>
            m &&
            (m.role === 'user' || m.role === 'assistant') &&
            typeof m.content === 'string'
        )
        .slice(-6)
        .map((m: any) => ({ role: m.role, content: m.content.slice(0, 500) }))
    : [];

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    res.status(501).json({ error: 'no-key' });
    return;
  }

  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 20000);
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 150,
        temperature: 0.7,
        system: VESS_SYSTEM,
        messages: normalizeMessages(history, message),
      }),
      signal: ctrl.signal,
    });
    if (!r.ok) {
      res.status(502).json({ error: 'upstream' });
      return;
    }
    const data: any = await r.json();
    const block = Array.isArray(data?.content)
      ? data.content.find((b: any) => b && b.type === 'text' && typeof b.text === 'string')
      : null;
    const reply = block ? block.text.trim() : '';
    if (!reply) {
      res.status(502).json({ error: 'upstream' });
      return;
    }
    res.status(200).json({ reply });
  } catch {
    res.status(502).json({ error: 'upstream' });
  } finally {
    clearTimeout(timeout);
  }
}
