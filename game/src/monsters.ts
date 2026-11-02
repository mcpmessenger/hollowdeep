// Monster entities — Gibberlings (all depths), Marrow Wraiths (depth 2+),
// Chad the middle-management minotaur (depth 3+).

import * as THREE from 'three';
import { Dungeon, isWalkable, Cell } from './dungeon';
import { gibberlingSprite, wraithSprite, chadSprite } from './textures';
import { CELL } from './renderer';

export type MonsterKind = 'gibberling' | 'wraith' | 'chad';

export interface Monster {
  id: number;
  kind: MonsterKind;
  name: string;
  hp: number;
  maxHp: number;
  dmg: number; // bite damage
  smell: number; // chase radius (Manhattan cells)
  scale: number; // sprite scale
  baseY: number; // sprite hover height
  pos: Cell;
  sprite: THREE.Sprite;
  attackCooldown: number;
  windup: number; // ticks remaining before a telegraphed bite lands (0 = none)
  alive: boolean;
  // Per-frame animation state (owned by animateMonsters, the single writer
  // of sprite position/scale — nothing else should touch them per-frame).
  phase: number; // idle bob phase
  hitT: number; // 1 → 0 hit-pop decay
  lungeT: number; // 0 → 1 wind-up lunge ramp
  stepT: number; // 1 → 0 hop decay after stepping
  dying: number; // -1 = not dying, else seconds since death
  gone: boolean; // fully removed from the scene
}

let nextId = 1;
const texCache: Partial<Record<MonsterKind, THREE.CanvasTexture>> = {};
// Live materials per kind — when an AI sprite PNG arrives, their maps upgrade.
const spriteMats: Array<{ kind: MonsterKind; mat: THREE.SpriteMaterial }> = [];

function textureFor(kind: MonsterKind): THREE.CanvasTexture {
  if (!texCache[kind]) {
    // Procedural placeholder shows instantly; the AI sprite upgrades it on arrival.
    const t = new THREE.CanvasTexture(
      kind === 'wraith' ? wraithSprite() : kind === 'chad' ? chadSprite() : gibberlingSprite()
    );
    t.colorSpace = THREE.SRGBColorSpace;
    texCache[kind] = t;
  }
  return texCache[kind]!;
}

/** Swap every live material of this kind to the AI sprite. Future spawns use it directly. */
function upgradeKind(kind: MonsterKind, img: HTMLImageElement) {
  const t = new THREE.CanvasTexture(img);
  t.colorSpace = THREE.SRGBColorSpace;
  texCache[kind] = t;
  for (const s of spriteMats) {
    if (s.kind === kind) s.mat.map = t;
  }
}

/** Call when a level is torn down — all its materials are disposed. */
export function resetSpriteRegistry() {
  spriteMats.length = 0;
}

// Preload AI sprites at module load (page boot, before the title is dismissed).
// Procedural placeholders cover the gap; failures keep them permanently.
(['gibberling', 'wraith', 'chad'] as MonsterKind[]).forEach((kind) => {
  const img = new Image();
  img.onload = () => upgradeKind(kind, img);
  img.onerror = () => console.warn(`[sprites] ${kind}.png failed to load — keeping procedural`);
  img.src = new URL(`sprites/${kind}.png`, document.baseURI).toString();
});

interface KindSpec {
  hp: [number, number];
  dmg: number;
  smell: number;
  scale: number;
  y: number;
  name: string;
}

const SPECS: Record<MonsterKind, KindSpec> = {
  gibberling: { hp: [3, 6], dmg: 1, smell: 6, scale: 1.6, y: 1.1, name: 'Gibberling' },
  wraith: { hp: [8, 12], dmg: 2, smell: 9, scale: 2.0, y: 1.3, name: 'Marrow Wraith' },
  chad: { hp: [30, 30], dmg: 3, smell: 10, scale: 2.7, y: 1.5, name: 'Chad' },
};

function spawnKind(
  scene: THREE.Scene,
  d: Dungeon,
  kind: MonsterKind,
  count: number,
  avoid: Cell[],
  minDistFromStart = 0
): Monster[] {
  const spec = SPECS[kind];
  const out: Monster[] = [];
  const floorCells: Cell[] = [];
  for (let y = 1; y < d.size - 1; y++)
    for (let x = 1; x < d.size - 1; x++) {
      if (d.grid[y][x] !== 1 && !(x === d.start.x && y === d.start.y)) floorCells.push({ x, y });
    }
  for (let i = 0; i < count && floorCells.length; i++) {
    let idx = (Math.random() * floorCells.length) | 0;
    if (minDistFromStart > 0) {
      // Chad lurks far from the entrance.
      const far = floorCells.filter(
        (c) => Math.abs(c.x - d.start.x) + Math.abs(c.y - d.start.y) >= minDistFromStart
      );
      if (far.length) idx = floorCells.indexOf(far[(Math.random() * far.length) | 0]);
    }
    const pos = floorCells.splice(idx, 1)[0];
    if (avoid.some((a) => Math.abs(a.x - pos.x) + Math.abs(a.y - pos.y) < 4)) continue;
    const mat = new THREE.SpriteMaterial({
      map: textureFor(kind),
      transparent: true,
      depthWrite: false,
    });
    spriteMats.push({ kind, mat });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(spec.scale, spec.scale, 1);
    sprite.position.set(pos.x * CELL, spec.y, pos.y * CELL);
    scene.add(sprite);
    const mhp = spec.hp[0] + ((Math.random() * (spec.hp[1] - spec.hp[0] + 1)) | 0);
    out.push({
      id: nextId++,
      kind,
      name: spec.name,
      hp: mhp,
      maxHp: mhp,
      dmg: spec.dmg,
      smell: spec.smell,
      scale: spec.scale,
      baseY: spec.y,
      pos: { ...pos },
      sprite,
      attackCooldown: 0,
      windup: 0,
      alive: true,
      phase: Math.random() * 10,
      hitT: 0,
      lungeT: 0,
      stepT: 0,
      dying: -1,
      gone: false,
    });
  }
  return out;
}

/** Depth-composed bestiary: gibberlings always, wraiths from depth 2, Chad from depth 3. */
export function spawnMonsters(scene: THREE.Scene, d: Dungeon, avoid: Cell[]): Monster[] {
  const out: Monster[] = [];
  out.push(...spawnKind(scene, d, 'gibberling', 5 + d.level * 2, avoid));
  if (d.level >= 2) out.push(...spawnKind(scene, d, 'wraith', (d.level - 1) * 2, avoid));
  if (d.level >= 3) out.push(...spawnKind(scene, d, 'chad', 1, avoid, 12));
  return out;
}

const DIRS = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
];

/**
 * One AI tick per monster. Returns events for the log.
 * Greedy chase within smell range, random shamble otherwise.
 */
export function monsterTick(m: Monster, d: Dungeon, player: Cell, occupied: Set<string>): string[] {
  const events: string[] = [];
  if (!m.alive) return events;
  m.attackCooldown = Math.max(0, m.attackCooldown - 1);

  const dist = Math.abs(m.pos.x - player.x) + Math.abs(m.pos.y - player.y);

  if (dist === 1) {
    // Adjacent: telegraphed bite. Wind up one tick (eyes flare, growl),
    // then bite on the next tick if the player is still there.
    if (m.windup > 0) {
      m.windup = 0;
      if (m.attackCooldown === 0) {
        m.attackCooldown = 3; // ~1.65s between bites
        events.push(`hit:${m.dmg}`);
      }
      return events;
    }
    if (m.attackCooldown === 0) {
      m.windup = 1;
      events.push('windup');
    }
    return events;
  }
  // Lost the player mid-windup — it fizzles.
  m.windup = 0;

  let step: Cell | null = null;
  if (dist <= m.smell) {
    // Chase: pick neighbor minimizing distance.
    let best = dist;
    for (const dir of DIRS) {
      const nx = m.pos.x + dir.x;
      const ny = m.pos.y + dir.y;
      const k = `${nx},${ny}`;
      if (!isWalkable(d, nx, ny) || occupied.has(k) || (nx === player.x && ny === player.y)) continue;
      const nd = Math.abs(nx - player.x) + Math.abs(ny - player.y);
      if (nd < best) {
        best = nd;
        step = { x: nx, y: ny };
      }
    }
  } else if (Math.random() < 0.4) {
    // Shamble.
    const dir = DIRS[(Math.random() * 4) | 0];
    const nx = m.pos.x + dir.x;
    const ny = m.pos.y + dir.y;
    const k = `${nx},${ny}`;
    if (isWalkable(d, nx, ny) && !occupied.has(k) && !(nx === player.x && ny === player.y)) {
      step = { x: nx, y: ny };
    }
  }

  if (step) {
    occupied.delete(`${m.pos.x},${m.pos.y}`);
    m.pos = step;
    occupied.add(`${step.x},${step.y}`);
    m.stepT = 1; // hop — the per-frame animator turns it into motion
  }
  return events;
}

/** Start the death animation: sink + fade over ~0.55s, then removed. */
export function killMonster(_scene: THREE.Scene, m: Monster) {
  if (!m.alive || m.dying >= 0 || m.gone) return;
  m.alive = false;
  m.dying = 0;
  m.windup = 0;
  m.hitT = 0;
  m.lungeT = 0;
}

/** Instant removal for level teardown — no death animation. */
export function destroyMonsters(scene: THREE.Scene, monsters: Monster[]) {
  for (const m of monsters) {
    if (m.gone) continue;
    scene.remove(m.sprite);
    (m.sprite.material as THREE.SpriteMaterial).dispose();
    m.gone = true;
  }
  resetSpriteRegistry();
}

/** Idle motion character per kind: skittish, floaty, heavy. */
const ANIM: Record<MonsterKind, { amp: number; speed: number }> = {
  gibberling: { amp: 0.09, speed: 5.5 },
  wraith: { amp: 0.16, speed: 1.6 },
  chad: { amp: 0.06, speed: 2.2 },
};

/**
 * Per-frame monster animation — the single writer of sprite position/scale.
 * Idle bob + breathing, hop on step, lunge on wind-up, sink + fade on death.
 */
export function animateMonsters(
  monsters: Monster[],
  dt: number,
  time: number,
  player: Cell,
  scene: THREE.Scene
) {
  for (const m of monsters) {
    if (m.gone) continue;
    const mat = m.sprite.material as THREE.SpriteMaterial;
    if (m.dying >= 0) {
      m.dying += dt;
      const t = Math.min(1, m.dying / 0.55);
      m.sprite.position.y -= dt * 2.2;
      mat.opacity = 1 - t;
      if (t >= 1) {
        scene.remove(m.sprite);
        mat.dispose();
        m.gone = true;
      }
      continue;
    }
    if (!m.alive) continue;
    const cfg = ANIM[m.kind];
    m.hitT = Math.max(0, m.hitT - dt * 5);
    m.stepT = Math.max(0, m.stepT - dt * 2.5);
    const lungeTarget = m.windup > 0 ? 1 : 0;
    const dl = lungeTarget - m.lungeT;
    m.lungeT += Math.sign(dl) * Math.min(Math.abs(dl), dt * 3);
    const le = m.lungeT * m.lungeT;
    // Bob (+ hop while stepping), lunge toward the player on wind-up.
    const bob = Math.sin(time * cfg.speed + m.phase) * cfg.amp * (1 + m.stepT * 1.5);
    const dx = player.x - m.pos.x;
    const dy = player.y - m.pos.y;
    const len = Math.hypot(dx, dy) || 1;
    const lx = (dx / len) * CELL * 0.28 * le;
    const lz = (dy / len) * CELL * 0.28 * le;
    m.sprite.position.set(m.pos.x * CELL + lx, m.baseY + bob, m.pos.y * CELL + lz);
    const s =
      m.scale *
      (1 + 0.03 * Math.sin(time * 2.2 + m.phase)) *
      (1 + 0.28 * m.hitT) *
      (1 + 0.16 * le);
    m.sprite.scale.set(s, s, 1);
  }
}
