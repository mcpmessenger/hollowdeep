// HUD: HP bar, fog-of-war minimap, message log, center flashes.

import { Dungeon, WALL, EXIT } from './dungeon';
import { Monster } from './monsters';

export class HUD {
  private hpBar = document.getElementById('hpbar')!;
  private logEl = document.getElementById('log')!;
  private centerEl = document.getElementById('center-msg')!;
  private map: HTMLCanvasElement = document.getElementById('minimap') as HTMLCanvasElement;
  private mctx = this.map.getContext('2d')!;
  private centerTimer: number | null = null;
  private dmgEl: HTMLElement;
  private hitEl: HTMLElement;
  private goldEl: HTMLElement;
  private journalEl: HTMLElement;
  private journalOpen = false;
  private dialogueEl: HTMLElement;
  private dialogueOpen = false;
  private dialogueOnChoice: ((id: string) => void) | null = null;
  private voiceEl: HTMLElement;
  private voiceOpen = false;
  private voiceTranscript: HTMLElement | null = null;
  private voiceStatus: HTMLElement | null = null;
  private voiceInput: HTMLInputElement | null = null;
  private voiceOnListen: (() => void) | null = null;
  private voiceOnSubmit: ((text: string) => void) | null = null;
  private voiceOnClose: (() => void) | null = null;
  // The voice-talk transcript lives here, not in the overlay DOM — the
  // overlay is rebuilt on every open, so lines kept only in the DOM would
  // vanish on reopen. Re-rendered into the fresh transcript on open.
  private voiceLines: Array<{ kind: 'you' | 'vess' | 'note'; text: string; faint?: boolean }> = [];
  private muteBtn: HTMLButtonElement;
  private onMuteToggle: (() => void) | null = null;
  private valeEl: HTMLElement;

  constructor() {
    // Directional damage vignette (red edge flash).
    this.dmgEl = document.createElement('div');
    this.dmgEl.style.cssText =
      'position:fixed;inset:0;pointer-events:none;z-index:15;opacity:0;transition:opacity 0.45s ease-out;';
    document.body.appendChild(this.dmgEl);
    // Hit-confirm flash (white, subtle).
    this.hitEl = document.createElement('div');
    this.hitEl.style.cssText =
      'position:fixed;inset:0;pointer-events:none;z-index:15;opacity:0;transition:opacity 0.18s ease-out;background:radial-gradient(ellipse at center, rgba(255,240,210,0.28) 0%, rgba(255,240,210,0) 60%);';
    document.body.appendChild(this.hitEl);
    // Live coin counter.
    this.goldEl = document.createElement('div');
    this.goldEl.style.cssText =
      'position:fixed;top:34px;left:14px;color:#c8a03a;font-size:13px;letter-spacing:2px;z-index:10;opacity:0.9;';
    this.goldEl.textContent = '◈ 0';
    document.body.appendChild(this.goldEl);
    // Mute toggle — top-right, under the HP bar. Click or M.
    this.muteBtn = document.createElement('button');
    this.muteBtn.style.cssText =
      'position:fixed;top:52px;right:14px;z-index:10;background:rgba(20,16,11,0.7);' +
      'border:1px solid #6b5320;color:#d8c690;font-size:16px;width:36px;height:36px;' +
      'cursor:pointer;border-radius:4px;';
    this.muteBtn.textContent = '🔊';
    this.muteBtn.title = 'Mute (M)';
    this.muteBtn.addEventListener('click', () => this.onMuteToggle && this.onMuteToggle());
    document.body.appendChild(this.muteBtn);
    // The Vale: dream-drift timer + sunpetal count, top-center, only out there.
    this.valeEl = document.createElement('div');
    this.valeEl.style.cssText =
      'position:fixed;top:52px;left:50%;transform:translateX(-50%);color:#ffd76a;font-size:13px;' +
      'letter-spacing:2px;z-index:10;opacity:0.95;text-shadow:0 0 8px #000;display:none;';
    document.body.appendChild(this.valeEl);
    // Vess's journal — collected pages, toggled with J.
    this.journalEl = document.createElement('div');
    this.journalEl.style.cssText =
      'position:fixed;inset:0;z-index:30;display:none;align-items:center;justify-content:center;' +
      'background:rgba(0,0,0,0.72);pointer-events:auto;cursor:pointer;';
    this.journalEl.addEventListener('click', () => this.hideJournal());
    document.body.appendChild(this.journalEl);
    // Chad dialogue — press T near him. Same overlay pattern as the journal.
    this.dialogueEl = document.createElement('div');
    this.dialogueEl.style.cssText =
      'position:fixed;inset:0;z-index:30;display:none;align-items:center;justify-content:center;' +
      'background:rgba(0,0,0,0.72);pointer-events:auto;';
    document.body.appendChild(this.dialogueEl);
    // Vess's voice talk — press V in her study. Same overlay pattern, with a
    // live transcript, a status line, and a text box for when the mic fails.
    this.voiceEl = document.createElement('div');
    this.voiceEl.style.cssText =
      'position:fixed;inset:0;z-index:30;display:none;align-items:center;justify-content:center;' +
      'background:rgba(0,0,0,0.72);pointer-events:auto;';
    document.body.appendChild(this.voiceEl);
  }

  /** Vess's collected journal pages. Toggle with J. */
  isJournalOpen(): boolean {
    return this.journalOpen;
  }

  showJournal(pages: string[]) {
    const inner = document.createElement('div');
    inner.style.cssText =
      'max-width:560px;max-height:76vh;overflow-y:auto;background:#14100b;border:1px solid #6b5320;' +
      'padding:28px 32px;color:#d8c690;font-size:15px;line-height:1.7;cursor:default;' +
      'box-shadow:0 0 60px rgba(0,0,0,0.9);';
    inner.addEventListener('click', (e) => e.stopPropagation());
    const title = document.createElement('div');
    title.textContent = "VESS HOLLOWAY'S JOURNAL";
    title.style.cssText = 'letter-spacing:4px;font-size:13px;color:#8a7648;margin-bottom:16px;text-align:center;';
    inner.appendChild(title);
    if (!pages.length) {
      const empty = document.createElement('div');
      empty.textContent = 'No pages yet. Search the bookshelf in her study — the warm room with the fire.';
      empty.style.opacity = '0.7';
      empty.style.fontStyle = 'italic';
      inner.appendChild(empty);
    }
    for (const p of pages) {
      const div = document.createElement('div');
      div.textContent = p;
      div.style.marginBottom = '14px';
      div.style.fontStyle = 'italic';
      inner.appendChild(div);
    }
    const hint = document.createElement('div');
    hint.textContent = 'J / ESC — CLOSE';
    hint.style.cssText = 'margin-top:20px;text-align:center;font-size:11px;letter-spacing:3px;color:#8a7648;font-style:normal;';
    inner.appendChild(hint);
    this.journalEl.replaceChildren(inner);
    this.journalEl.style.display = 'flex';
    this.journalOpen = true;
  }

  hideJournal() {
    this.journalEl.style.display = 'none';
    this.journalOpen = false;
  }

  /** Generic dialogue overlay (Chad, Vess...). Toggle with T; 1/2/3 pick a choice. */
  isDialogueOpen(): boolean {
    return this.dialogueOpen;
  }

  showDialogue(opts: {
    name: string;
    subtitle: string;
    portraitUrl?: string;
    greeting: string;
    choices: Array<{ id: string; label: string }>;
    onChoice: (id: string) => void;
  }) {
    this.dialogueOnChoice = opts.onChoice;
    const inner = document.createElement('div');
    inner.style.cssText =
      'max-width:560px;width:88vw;background:#14100b;border:1px solid #6b5320;' +
      'padding:28px 32px;color:#d8c690;font-size:15px;line-height:1.7;' +
      'box-shadow:0 0 60px rgba(0,0,0,0.9);';
    const head = document.createElement('div');
    head.style.cssText = 'display:flex;gap:18px;align-items:center;margin-bottom:16px;';
    if (opts.portraitUrl) {
      const img = document.createElement('img');
      img.src = opts.portraitUrl;
      img.alt = opts.name;
      img.style.cssText = 'width:96px;height:96px;object-fit:cover;border:1px solid #6b5320;flex-shrink:0;';
      img.addEventListener('error', () => img.remove()); // graceful: no portrait, no box
      head.appendChild(img);
    }
    const name = document.createElement('div');
    name.innerHTML = `${opts.name}<br><span style="font-size:11px;letter-spacing:3px;color:#8a7648;">${opts.subtitle}</span>`;
    name.style.cssText = 'letter-spacing:4px;font-size:15px;color:#d8c690;';
    head.appendChild(name);
    inner.appendChild(head);
    const line = document.createElement('div');
    line.textContent = opts.greeting;
    line.style.cssText = 'font-style:italic;margin-bottom:20px;';
    inner.appendChild(line);
    opts.choices.forEach((c, i) => {
      const btn = document.createElement('button');
      btn.textContent = `${i + 1}. ${c.label}`;
      btn.style.cssText =
        'display:block;width:100%;text-align:left;margin:8px 0;padding:10px 14px;' +
        'background:#1e1810;color:#d8c690;border:1px solid #6b5320;cursor:pointer;' +
        'font-size:14px;font-family:inherit;';
      btn.addEventListener('click', () => this.dialogueOnChoice && this.dialogueOnChoice(c.id));
      btn.addEventListener('mouseenter', () => (btn.style.background = '#2a2114'));
      btn.addEventListener('mouseleave', () => (btn.style.background = '#1e1810'));
      inner.appendChild(btn);
    });
    const hint = document.createElement('div');
    hint.textContent = '1 / 2 / 3 / 4 — CHOOSE · T / ESC — CLOSE';
    hint.style.cssText = 'margin-top:20px;text-align:center;font-size:11px;letter-spacing:3px;color:#8a7648;';
    inner.appendChild(hint);
    this.dialogueEl.replaceChildren(inner);
    this.dialogueEl.style.display = 'flex';
    this.dialogueOpen = true;
  }

  /** Swap the choices for the speaker's response line. */
  showDialogueResponse(name: string, response: string) {
    this.dialogueOnChoice = null;
    const inner = document.createElement('div');
    inner.style.cssText =
      'max-width:560px;width:88vw;background:#14100b;border:1px solid #6b5320;' +
      'padding:28px 32px;color:#d8c690;font-size:15px;line-height:1.7;' +
      'box-shadow:0 0 60px rgba(0,0,0,0.9);';
    const nameEl = document.createElement('div');
    nameEl.textContent = name;
    nameEl.style.cssText = 'letter-spacing:4px;font-size:13px;color:#8a7648;margin-bottom:16px;';
    inner.appendChild(nameEl);
    const line = document.createElement('div');
    line.textContent = response;
    line.style.cssText = 'font-style:italic;margin-bottom:20px;';
    inner.appendChild(line);
    const hint = document.createElement('div');
    hint.textContent = 'T / ESC — CLOSE';
    hint.style.cssText = 'margin-top:20px;text-align:center;font-size:11px;letter-spacing:3px;color:#8a7648;';
    inner.appendChild(hint);
    this.dialogueEl.replaceChildren(inner);
  }

  hideDialogue() {
    this.dialogueEl.style.display = 'none';
    this.dialogueOpen = false;
    this.dialogueOnChoice = null;
  }

  /** Vess's voice talk — press V in her study. Mic (Web Speech) + text
   *  fallback. The overlay owns the transcript; game.ts owns the flow. */
  isVoiceTalkOpen(): boolean {
    return this.voiceOpen;
  }

  showVoiceTalk(opts: {
    onListen: () => void;
    onSubmit: (text: string) => void;
    onClose: () => void;
  }) {
    this.voiceOnListen = opts.onListen;
    this.voiceOnSubmit = opts.onSubmit;
    this.voiceOnClose = opts.onClose;
    const inner = document.createElement('div');
    inner.style.cssText =
      'max-width:560px;width:88vw;background:#14100b;border:1px solid #6b5320;' +
      'padding:28px 32px;color:#d8c690;font-size:15px;line-height:1.7;' +
      'box-shadow:0 0 60px rgba(0,0,0,0.9);';
    const head = document.createElement('div');
    head.textContent = 'VESS HOLLOWAY';
    head.style.cssText = 'letter-spacing:4px;font-size:15px;color:#d8c690;';
    inner.appendChild(head);
    const sub = document.createElement('div');
    sub.textContent = 'THE ECHO ANSWERS · SPEAK, OR TYPE';
    sub.style.cssText =
      'font-size:11px;letter-spacing:3px;color:#8a7648;margin-bottom:16px;';
    inner.appendChild(sub);
    const status = document.createElement('div');
    status.style.cssText = 'font-style:italic;color:#b8a05e;margin-bottom:12px;';
    inner.appendChild(status);
    this.voiceStatus = status;
    const transcript = document.createElement('div');
    transcript.style.cssText =
      'max-height:240px;overflow-y:auto;margin-bottom:16px;padding-right:6px;';
    inner.appendChild(transcript);
    this.voiceTranscript = transcript;
    // The transcript survives reopening: re-render the stored lines into
    // the fresh overlay (the DOM itself is rebuilt on every open).
    for (const line of this.voiceLines) this.renderVoiceLine(line);
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:8px;';
    const input = document.createElement('input');
    input.id = 'vess-voice-input';
    input.type = 'text';
    input.placeholder = 'Ask Vess… (the clock, the Vale, Chad, the way down)';
    input.setAttribute('aria-label', 'Ask Vess');
    input.style.cssText =
      'flex:1;padding:10px 12px;background:#1e1810;color:#d8c690;border:1px solid #6b5320;' +
      'font-size:14px;font-family:inherit;outline:none;';
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const text = input.value.trim();
        if (text) {
          input.value = '';
          this.voiceOnSubmit && this.voiceOnSubmit(text);
        }
      }
    });
    row.appendChild(input);
    this.voiceInput = input;
    const listenBtn = document.createElement('button');
    listenBtn.textContent = '🎙';
    listenBtn.title = 'Listen (microphone)';
    listenBtn.style.cssText =
      'padding:10px 14px;background:#1e1810;color:#d8c690;border:1px solid #6b5320;' +
      'cursor:pointer;font-size:16px;';
    listenBtn.addEventListener('click', () => this.voiceOnListen && this.voiceOnListen());
    row.appendChild(listenBtn);
    const closeBtn = document.createElement('button');
    closeBtn.textContent = 'Close';
    closeBtn.style.cssText =
      'padding:10px 14px;background:#1e1810;color:#d8c690;border:1px solid #6b5320;' +
      'cursor:pointer;font-size:14px;font-family:inherit;';
    closeBtn.addEventListener('click', () => this.voiceOnClose && this.voiceOnClose());
    row.appendChild(closeBtn);
    inner.appendChild(row);
    const hint = document.createElement('div');
    hint.textContent = 'ESC — CLOSE · V — CLOSE · M — MUTE (NOT WHILE TYPING)';
    hint.style.cssText =
      'margin-top:20px;text-align:center;font-size:11px;letter-spacing:3px;color:#8a7648;';
    inner.appendChild(hint);
    this.voiceEl.replaceChildren(inner);
    this.voiceEl.style.display = 'flex';
    this.voiceOpen = true;
    input.focus();
  }

  hideVoiceTalk() {
    // Don't leave focus in a hidden box — it would swallow game keys.
    this.voiceInput?.blur();
    this.voiceEl.style.display = 'none';
    this.voiceOpen = false;
    this.voiceOnListen = null;
    this.voiceOnSubmit = null;
    this.voiceOnClose = null;
    this.voiceTranscript = null;
    this.voiceStatus = null;
    this.voiceInput = null;
  }

  setVoiceStatus(text: string) {
    if (this.voiceStatus) this.voiceStatus.textContent = text;
  }

  /** One transcript line. faint = the offline echo, not the AI — labelled.
   *  Lines are stored, not just rendered: the overlay is rebuilt on every
   *  open, and the transcript must survive reopening. */
  appendVoiceLine(who: 'You' | 'Vess', text: string, faint = false) {
    const line = { kind: (who === 'You' ? 'you' : 'vess') as 'you' | 'vess', text, faint };
    this.voiceLines.push(line);
    this.renderVoiceLine(line);
  }

  /** A dim system line in the transcript (e.g. the offline-echo notice). */
  appendVoiceNote(text: string) {
    const line = { kind: 'note' as const, text };
    this.voiceLines.push(line);
    this.renderVoiceLine(line);
  }

  focusVoiceInput() {
    this.voiceInput?.focus();
  }

  private renderVoiceLine(line: { kind: 'you' | 'vess' | 'note'; text: string; faint?: boolean }) {
    if (!this.voiceTranscript) return;
    const div = document.createElement('div');
    if (line.kind === 'note') {
      div.textContent = line.text;
      div.style.cssText = 'font-style:italic;color:#8a7648;margin-bottom:10px;';
    } else {
      const who = line.kind === 'you' ? 'You' : 'Vess';
      div.textContent = `${who}${line.faint ? ' (faint echo)' : ''}: ${line.text}`;
      div.style.cssText =
        line.kind === 'vess' ? 'font-style:italic;margin-bottom:10px;' : 'margin-bottom:10px;opacity:0.85;';
    }
    this.voiceTranscript.appendChild(div);
    this.voiceTranscript.scrollTop = this.voiceTranscript.scrollHeight;
  }

  /** Mute button wiring. */
  setMuteHandler(fn: () => void) {
    this.onMuteToggle = fn;
  }

  setMuted(muted: boolean) {
    this.muteBtn.textContent = muted ? '🔇' : '🔊';
  }

  /** Vale status line — drift timer + petals. null hides it (back in the dark). */
  setVale(text: string | null, danger = false) {
    if (text === null) {
      this.valeEl.style.display = 'none';
      return;
    }
    this.valeEl.style.display = 'block';
    this.valeEl.textContent = text;
    this.valeEl.style.color = danger ? '#ff6a4a' : '#ffd76a';
  }

  log(msg: string) {
    const div = document.createElement('div');
    div.textContent = msg;
    for (const child of Array.from(this.logEl.children)) child.classList.add('faded');
    this.logEl.prepend(div);
    // 5 messages max, so the panel (280px) never clips a line mid-glyph.
    while (this.logEl.children.length > 5) this.logEl.lastChild?.remove();
  }

  flash(msg: string, ms = 2200) {
    this.centerEl.textContent = msg;
    this.centerEl.style.opacity = '1';
    if (this.centerTimer) clearTimeout(this.centerTimer);
    this.centerTimer = window.setTimeout(() => (this.centerEl.style.opacity = '0'), ms);
  }

  setHp(hp: number, max: number) {
    this.hpBar.style.width = `${Math.max(0, (hp / max) * 100)}%`;
  }

  setGold(n: number) {
    this.goldEl.textContent = `◈ ${n}`;
  }

  /** Red edge flash from the direction damage came from (relative to facing). */
  damageFlash(from: 'front' | 'left' | 'right' | 'back') {
    const edge =
      from === 'front'
        ? 'inset 0 120px 90px -60px'
        : from === 'back'
          ? 'inset 0 -120px 90px -60px'
          : from === 'left'
            ? 'inset 120px 0 60px -60px'
            : 'inset -120px 0 60px -60px';
    this.dmgEl.style.boxShadow = `${edge} rgba(200, 20, 10, 0.85)`;
    this.dmgEl.style.transition = 'none';
    this.dmgEl.style.opacity = '1';
    // force reflow so the fade-out transition applies
    void this.dmgEl.offsetWidth;
    this.dmgEl.style.transition = 'opacity 0.45s ease-out';
    this.dmgEl.style.opacity = '0';
  }

  /** Subtle white flash confirming the player's hit landed. */
  hitFlash() {
    this.hitEl.style.transition = 'none';
    this.hitEl.style.opacity = '1';
    void this.hitEl.offsetWidth;
    this.hitEl.style.transition = 'opacity 0.35s ease-out';
    this.hitEl.style.opacity = '0';
  }

  /** Floating damage number — pops near center-top, drifts up and fades. */
  damageNumber(n: number, color = '#ffd76a') {
    const el = document.createElement('div');
    el.textContent = `${n}`;
    el.style.cssText = `position:fixed;left:50%;top:38%;transform:translate(-50%,0);color:${color};font-size:34px;font-weight:bold;letter-spacing:2px;z-index:16;pointer-events:none;opacity:1;text-shadow:0 0 12px rgba(0,0,0,0.9);transition:transform 0.7s ease-out, opacity 0.7s ease-out;`;
    document.body.appendChild(el);
    requestAnimationFrame(() => {
      el.style.transform = 'translate(-50%,-70px)';
      el.style.opacity = '0';
    });
    setTimeout(() => el.remove(), 750);
  }

  drawMinimap(d: Dungeon, px: number, py: number, dir: number, monsters: Monster[]) {
    const ctx = this.mctx;
    const W = this.map.width;
    const cell = W / d.size;
    const seen = visited(d);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, W);
    for (let y = 0; y < d.size; y++) {
      for (let x = 0; x < d.size; x++) {
        if (!seen.has(`${x},${y}`)) continue;
        const v = d.grid[y][x];
        if (d.theme === 'vale') {
          // Bright meadow on the map too: pale ruins, gold grass.
          ctx.fillStyle = v === WALL ? '#8a8578' : v === EXIT ? '#c8a03a' : '#3a2f14';
        } else {
          ctx.fillStyle = v === WALL ? '#3a3226' : v === EXIT ? '#2a5a8a' : '#14100c';
        }
        ctx.fillRect(x * cell, y * cell, cell, cell);
      }
    }
    // Vale sunpetals — gold dots, ALWAYS shown: the meadow is small and open,
    // and the hunt reads on the map only if you can see where to go. (Was:
    // dots only on visited cells, so they never appeared before you were
    // already standing on the flower.)
    if (d.theme === 'vale') {
      for (const s of d.valeSpots ?? []) {
        if (s.taken) continue;
        const dx = (s.x + 0.5) * cell;
        const dy = (s.y + 0.5) * cell;
        ctx.fillStyle = 'rgba(255,215,106,0.35)';
        ctx.beginPath();
        ctx.arc(dx, dy, cell * 0.85, 0, 7);
        ctx.fill();
        ctx.fillStyle = '#ffd76a';
        ctx.beginPath();
        ctx.arc(dx, dy, cell * 0.55, 0, 7);
        ctx.fill();
      }
    }
    // monsters on visited cells — color by kind
    for (const m of monsters) {
      if (!m.alive || !seen.has(`${m.pos.x},${m.pos.y}`)) continue;
      ctx.fillStyle = m.kind === 'wraith' ? '#9fd4ff' : m.kind === 'chad' ? '#ff8c2a' : '#c03030';
      ctx.beginPath();
      ctx.arc((m.pos.x + 0.5) * cell, (m.pos.y + 0.5) * cell, cell * (m.kind === 'chad' ? 0.45 : 0.3), 0, 7);
      ctx.fill();
    }
    // Vess's study — a warm ember dot once you've seen the room's heart.
    // The Vale has no study, so no ember.
    if (d.lair && seen.has(`${d.lair.cx},${d.lair.cy}`)) {
      ctx.fillStyle = '#ff9030';
      ctx.fillRect(
        (d.lair.cx + 0.28) * cell,
        (d.lair.cy + 0.28) * cell,
        cell * 0.44,
        cell * 0.44
      );
    }
    // player arrow — big enough to read at a glance
    const cx = (px + 0.5) * cell;
    const cy = (py + 0.5) * cell;
    ctx.fillStyle = '#e8d9a0';
    ctx.save();
    ctx.translate(cx, cy);
    // Canvas up = map north. dir: 0=N,1=E,2=S,3=W.
    ctx.rotate([0, Math.PI / 2, Math.PI, -Math.PI / 2][dir]);
    ctx.beginPath();
    ctx.moveTo(0, -cell * 0.6);
    ctx.lineTo(cell * 0.42, cell * 0.45);
    ctx.lineTo(-cell * 0.42, cell * 0.45);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

// Fog-of-war tracking lives on the dungeon object via a WeakMap
// (keeps dungeon.ts serialization-clean).
const visitedMap = new WeakMap<Dungeon, Set<string>>();

export function visited(d: Dungeon): Set<string> {
  let s = visitedMap.get(d);
  if (!s) {
    s = new Set();
    visitedMap.set(d, s);
  }
  // Expose for the minimap reader above.
  (d as unknown as Record<string, unknown>)['visited'] = s;
  return s;
}

export function markVisited(d: Dungeon, x: number, y: number) {
  const s = visited(d);
  s.add(`${x},${y}`);
  // Reveal neighbors too (you can see adjacent cells).
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < d.size && ny < d.size) s.add(`${nx},${ny}`);
    }
}
