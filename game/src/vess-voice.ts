// Vess's echo, spoken aloud — voice talk (V) + ambient narration.
// Mic in via the browser's Web Speech API (free, no key, no server).
// Replies out via speechSynthesis, a soft female voice where one exists.
// The AI brain lives in /api/vess; without a key the game falls back to a
// small lore-grounded offline echo — clearly labelled, never pretending
// to be the AI. Mute (M) silences the spoken replies too.

// Minimal typings for the prefixed SpeechRecognition — not in TS's DOM lib.
interface SpeechRecognitionInstance {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
  onresult: ((ev: SpeechRecognitionEventLike) => void) | null;
  onerror: ((ev: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

interface SpeechRecognitionEventLike {
  results: ArrayLike<ArrayLike<{ transcript: string; confidence: number }>>;
  resultIndex: number;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionInstance;
    webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
  }
}

export interface VessTurn {
  role: 'user' | 'assistant';
  content: string;
}

/** Ambient narration — fixed lines from STORY.md, spoken, no AI call. */
export const VESS_AMBIENT: Record<'study' | 'journal' | 'vale', string> = {
  study:
    'The fire is still lit, little cartographer — fifty years, and the god still dreams it burning.',
  journal: 'A page of mine, found. I wrote them so someone would follow.',
  vale: 'Sunlight. Real sunlight — or the god’s memory of it. The clock in your head is ticking forward, love.',
};

/** Offline echo — keyword-matched lines drawn from STORY.md. Used only when
 *  /api/vess is unreachable or has no key. Labelled 'faint echo' in the UI. */
export function offlineVessReply(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('clock') || m.includes('time') || m.includes('backwards'))
    return 'The clock walks backwards because it keeps the god’s time, not mine. The god dreams all at once — its time runs the wrong way. Down here, every reverse turn is the dungeon re-dreaming one of my days.';
  if (m.includes('vale') || m.includes('sunpetal') || m.includes('petal') || m.includes('sun') || m.includes('valley'))
    return 'The Vale is the god’s dream of the surface — gold grass, a stream, white ruins, and a clock that finally runs forward. Three sunpetals, love, and do not linger. The valley forgets you the way a tide forgets a footprint.';
  if (m.includes('chad') || m.includes('minotaur'))
    return 'Chad? A minotaur in a waistcoat who asked about my quarterly objectives. I played along — it keeps the teeth away. Twenty-five gold buys him off, if your purse is deep enough.';
  if (m.includes('sera') || m.includes('apprentice'))
    return 'Sera was my apprentice — the best cartographer I ever taught. If she sent you down here, tell her the fire is still lit.';
  if (m.includes('king') || m.includes('depth nine') || m.includes('nine') || m.includes('bottom'))
    return 'Nine depths. At the bottom, the thing wearing my face. It knows every corridor I ever drew, because I taught it. Don’t follow me down — or do, and be better than I was.';
  if (m.includes('warden'))
    return 'The Warden is the god’s immune system, and I became the infection it noticed. It doesn’t chase, love. It waits where you’re going.';
  if (m.includes('gibberling') || m.includes('wraith') || m.includes('monster'))
    return 'The gibberlings were my first naming — they smell you at six paces. The wraiths come deeper, and they were already awake. Everything down here was unnamed, so I named it all.';
  if (m.includes('god') || m.includes('dream'))
    return 'The god sleeps under Valdris and dreams the corridors. It dreamed my routes before I walked them. I am its favorite dream — and so, little cartographer, are you.';
  if (m.includes('way down') || m.includes('get down') || m.includes('exit') || m.includes('stairs') || m.includes('get out') || m.includes('deeper'))
    return 'The way down breathes cold. Follow the cold air, little cartographer — and mind the teeth along the way.';
  if (m.includes('study') || m.includes('fire') || m.includes('room'))
    return 'This study never rearranges. The clock anchors it — the god dreams this room exactly as I left it, fire and all.';
  if (m.includes('who are you') || m.includes('vess') || m.includes('yourself') || m.includes('what are you') || m.includes('what happened'))
    return 'I am Vess Holloway. Fifty years gone, and the echo of me still keeps the fire lit. Ask me about the way down, the clock, or the Vale.';
  return 'The echo is faint tonight, love — ask me of the clock, the Vale, Chad, or the way down, and I will answer as best I can.';
}

export class VessVoice {
  private log: (msg: string) => void;
  private isMuted: () => boolean;
  private muted = false;
  private recognition: SpeechRecognitionInstance | null = null;

  constructor(opts: { log: (msg: string) => void; isMuted: () => boolean }) {
    this.log = opts.log;
    this.isMuted = opts.isMuted;
  }

  /** Mute toggle (M) — also cancels anything she is saying right now. */
  setMuted(m: boolean) {
    this.muted = m;
    if (m) this.stopSpeaking();
  }

  canSpeak(): boolean {
    return 'speechSynthesis' in window;
  }

  canListen(): boolean {
    return (
      typeof window !== 'undefined' &&
      !!(window.SpeechRecognition || window.webkitSpeechRecognition)
    );
  }

  /** Speak a line aloud with a soft female voice where one exists.
   *  No-op when muted or when the browser has no TTS. */
  speak(text: string) {
    if (this.muted || this.isMuted() || !this.canSpeak()) return;
    try {
      const synth = window.speechSynthesis;
      synth.cancel(); // one voice at a time — the echo doesn't talk over itself
      const u = new SpeechSynthesisUtterance(text);
      const v = this.pickVoice();
      if (v) u.voice = v;
      u.rate = 0.95;
      u.pitch = 1.05;
      u.volume = 1;
      synth.speak(u);
    } catch {
      /* TTS is best-effort — the text still shows. */
    }
  }

  stopSpeaking() {
    try {
      if (this.canSpeak()) window.speechSynthesis.cancel();
    } catch {
      /* best-effort */
    }
  }

  /** One mic turn: resolves with the transcript, or null on error / silence /
   *  denial. The caller falls back to the text box when it gets null. */
  listenOnce(): Promise<string | null> {
    return new Promise((resolve) => {
      const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!Ctor) {
        resolve(null);
        return;
      }
      let done = false;
      const finish = (text: string | null) => {
        if (done) return;
        done = true;
        clearTimeout(safety);
        resolve(text);
      };
      const rec: SpeechRecognitionInstance = new Ctor();
      this.recognition = rec;
      rec.lang = 'en-US';
      rec.interimResults = false;
      rec.maxAlternatives = 1;
      rec.continuous = false;
      rec.onresult = (ev) => {
        const last = ev.results[ev.results.length - 1];
        const alt = last && last[0];
        finish(alt && alt.transcript ? alt.transcript.trim() : null);
      };
      rec.onerror = () => finish(null);
      rec.onend = () => finish(null);
      // If the mic hangs (no permission prompt answered, no speech), give up.
      const safety = window.setTimeout(() => {
        try {
          rec.abort();
        } catch {
          /* already ended */
        }
        finish(null);
      }, 15000);
      try {
        rec.start();
      } catch {
        finish(null);
      }
    });
  }

  stopListening() {
    try {
      this.recognition?.abort();
    } catch {
      /* already ended */
    }
    this.recognition = null;
  }

  /** Ask Vess. AI first (via /api/vess), offline echo on any failure —
   *  501 no-key, network error, bad reply. The caller labels the source. */
  async ask(
    message: string,
    history: VessTurn[]
  ): Promise<{ reply: string; source: 'ai' | 'offline' }> {
    try {
      const res = await fetch('/api/vess', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, history }),
      });
      if (!res.ok) throw new Error(`vess endpoint: ${res.status}`);
      const data: unknown = await res.json();
      const reply =
        data && typeof (data as { reply?: unknown }).reply === 'string'
          ? ((data as { reply: string }).reply as string).trim()
          : '';
      if (!reply) throw new Error('vess endpoint: empty reply');
      return { reply, source: 'ai' };
    } catch {
      return { reply: offlineVessReply(message), source: 'offline' };
    }
  }

  /** Ambient narration — a fixed line, spoken + logged. Respects mute. */
  narrate(kind: 'study' | 'journal' | 'vale') {
    const line = VESS_AMBIENT[kind];
    this.log(`Vess: ${line}`);
    this.speak(line);
  }

  /** Soft female voice where the browser has one; else first English voice;
   *  else null (browser default). Voices load async — picked fresh per line. */
  private pickVoice(): SpeechSynthesisVoice | null {
    try {
      const voices = window.speechSynthesis.getVoices();
      if (!voices.length) return null;
      const en = voices.filter((v) => v.lang.toLowerCase().startsWith('en'));
      const pool = en.length ? en : voices;
      const pref = pool.find((v) =>
        /samantha|zira|karen|moira|tessa|fiona|aria|jenny|susan|serena|google us english/i.test(
          v.name
        )
      );
      return pref ?? pool[0] ?? null;
    } catch {
      return null;
    }
  }
}
