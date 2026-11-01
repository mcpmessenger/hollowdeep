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
    this.hitEl.style.transition = 'opacity 0.18s ease-out';
    this.hitEl.style.opacity = '0';
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
    // monsters on visited cells
    for (const m of monsters) {
      if (!m.alive || !seen.has(`${m.pos.x},${m.pos.y}`)) continue;
      ctx.fillStyle = '#c03030';
      ctx.beginPath();
      ctx.arc((m.pos.x + 0.5) * cell, (m.pos.y + 0.5) * cell, cell * 0.3, 0, 7);
      ctx.fill();
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
