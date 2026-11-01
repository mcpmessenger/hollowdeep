// Monster entities — vertical slice has Gibberlings only.
// Chad, the Warden et al. arrive in milestone 2.

import * as THREE from 'three';
import { Dungeon, isWalkable, Cell } from './dungeon';
import { gibberlingSprite } from './textures';
import { CELL } from './renderer';

export interface Monster {
  id: number;
  kind: 'gibberling';
  name: string;
  hp: number;
  maxHp: number;
  pos: Cell;
  sprite: THREE.Sprite;
  attackCooldown: number;
  alive: boolean;
}

let nextId = 1;
let sharedSpriteTex: THREE.CanvasTexture | null = null;

function spriteTexture(): THREE.CanvasTexture {
  if (!sharedSpriteTex) {
    sharedSpriteTex = new THREE.CanvasTexture(gibberlingSprite());
    sharedSpriteTex.colorSpace = THREE.SRGBColorSpace;
  }
  return sharedSpriteTex;
}

export function spawnGibberlings(
  scene: THREE.Scene,
  d: Dungeon,
  count: number,
  avoid: Cell[]
): Monster[] {
  const out: Monster[] = [];
  const floorCells: Cell[] = [];
  for (let y = 1; y < d.size - 1; y++)
    for (let x = 1; x < d.size - 1; x++) {
      if (d.grid[y][x] !== 1 && !(x === d.start.x && y === d.start.y)) floorCells.push({ x, y });
    }
  for (let i = 0; i < count && floorCells.length; i++) {
    const pos = floorCells.splice((Math.random() * floorCells.length) | 0, 1)[0];
    if (avoid.some((a) => Math.abs(a.x - pos.x) + Math.abs(a.y - pos.y) < 4)) continue;
    const mat = new THREE.SpriteMaterial({ map: spriteTexture(), transparent: true });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(1.6, 1.6, 1);
    sprite.position.set(pos.x * CELL, 1.1, pos.y * CELL);
    scene.add(sprite);
    out.push({
      id: nextId++,
      kind: 'gibberling',
      name: 'Gibberling',
      hp: 3,
      maxHp: 3,
      pos: { ...pos },
      sprite,
      attackCooldown: 0,
      alive: true,
    });
  }
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
    // Adjacent: attack.
    if (m.attackCooldown === 0) {
      m.attackCooldown = 2;
      events.push('hit:1');
    }
    return events;
  }

  let step: Cell | null = null;
  if (dist <= 6) {
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
    m.sprite.position.set(step.x * CELL, 1.1 + Math.random() * 0.15, step.y * CELL);
  }
  return events;
}

export function killMonster(scene: THREE.Scene, m: Monster) {
  m.alive = false;
  scene.remove(m.sprite);
  m.sprite.material.dispose();
}
