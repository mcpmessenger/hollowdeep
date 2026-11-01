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
