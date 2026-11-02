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

  /** Chad dialogue. Toggle with T near him; 1/2/3 pick a choice. */
  isDialogueOpen(): boolean {
    return this.dialogueOpen;
  }

  showChadDialogue(
    greeting: string,
    choices: Array<{ id: string; label: string }>,
    onChoice: (id: string) => void
  ) {
    this.dialogueOnChoice = onChoice;
    const inner = document.createElement('div');
    inner.style.cssText =
      'max-width:560px;width:88vw;background:#14100b;border:1px solid #6b5320;' +
      'padding:28px 32px;color:#d8c690;font-size:15px;line-height:1.7;' +
      'box-shadow:0 0 60px rgba(0,0,0,0.9);';
    const head = document.createElement('div');
    head.style.cssText = 'display:flex;gap:18px;align-items:center;margin-bottom:16px;';
    const img = document.createElement('img');
    img.src = new URL('sprites/chad.png', document.baseURI).toString();
    img.alt = 'Chad';
    img.style.cssText = 'width:96px;height:96px;object-fit:cover;border:1px solid #6b5320;flex-shrink:0;';
    const name = document.createElement('div');
    name.innerHTML = 'CHAD<br><span style="font-size:11px;letter-spacing:3px;color:#8a7648;">MIDDLE MANAGEMENT</span>';
    name.style.cssText = 'letter-spacing:4px;font-size:15px;color:#d8c690;';
    head.appendChild(img);
    head.appendChild(name);
    inner.appendChild(head);
    const line = document.createElement('div');
    line.textContent = greeting;
    line.style.cssText = 'font-style:italic;margin-bottom:20px;';
    inner.appendChild(line);
    choices.forEach((c, i) => {
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
    hint.textContent = '1 / 2 / 3 — CHOOSE · T / ESC — CLOSE';
    hint.style.cssText = 'margin-top:20px;text-align:center;font-size:11px;letter-spacing:3px;color:#8a7648;';
    inner.appendChild(hint);
    this.dialogueEl.replaceChildren(inner);
    this.dialogueEl.style.display = 'flex';
    this.dialogueOpen = true;
  }

  /** Swap the choices for Chad's response line. */
  showChadResponse(response: string) {
    this.dialogueOnChoice = null;
    const inner = document.createElement('div');
    inner.style.cssText =
      'max-width:560px;width:88vw;background:#14100b;border:1px solid #6b5320;' +
      'padding:28px 32px;color:#d8c690;font-size:15px;line-height:1.7;' +
      'box-shadow:0 0 60px rgba(0,0,0,0.9);';
    const name = document.createElement('div');
    name.textContent = 'CHAD';
    name.style.cssText = 'letter-spacing:4px;font-size:13px;color:#8a7648;margin-bottom:16px;';
    inner.appendChild(name);
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

  log(msg: string) {
    const div = document.createElement('div');
    div.textContent = msg;
    for (const child of Array.from(this.logEl.children)) child.classList.add('faded');
    this.logEl.prepend(div);
    while (this.logEl.children.length > 6) this.logEl.lastChild?.remove();
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
        ctx.fillStyle = v === WALL ? '#3a3226' : v === EXIT ? '#2a5a8a' : '#14100c';
        ctx.fillRect(x * cell, y * cell, cell, cell);
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
    if (seen.has(`${d.lair.cx},${d.lair.cy}`)) {
      ctx.fillStyle = '#ff9030';
      ctx.fillRect(
        (d.lair.cx + 0.28) * cell,
        (d.lair.cy + 0.28) * cell,
        cell * 0.44,
        cell * 0.44
      );
    }
    // player arrow
    const cx = (px + 0.5) * cell;
    const cy = (py + 0.5) * cell;
    ctx.fillStyle = '#e8d9a0';
    ctx.save();
    ctx.translate(cx, cy);
    // Canvas up = map north. dir: 0=N,1=E,2=S,3=W.
    ctx.rotate([0, Math.PI / 2, Math.PI, -Math.PI / 2][dir]);
    ctx.beginPath();
    ctx.moveTo(0, -cell * 0.45);
    ctx.lineTo(cell * 0.3, cell * 0.35);
    ctx.lineTo(-cell * 0.3, cell * 0.35);
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
