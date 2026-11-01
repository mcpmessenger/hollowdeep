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
}

let nextId = 1;
const texCache: Partial<Record<MonsterKind, THREE.CanvasTexture>> = {};

function textureFor(kind: MonsterKind): THREE.CanvasTexture {
  if (!texCache[kind]) {
    const c =
      kind === 'wraith' ? wraithSprite() : kind === 'chad' ? chadSprite() : gibberlingSprite();
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    texCache[kind] = t;
  }
  return texCache[kind]!;
}

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
    m.sprite.position.set(step.x * CELL, m.baseY + Math.random() * 0.15, step.y * CELL);
  }
  return events;
}

export function killMonster(scene: THREE.Scene, m: Monster) {
  m.alive = false;
  scene.remove(m.sprite);
  m.sprite.material.dispose();
}
