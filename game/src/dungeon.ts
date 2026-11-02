// Dungeon generation — recursive backtracker on an odd grid.
// 1 = wall, 0 = floor, 2 = exit stairs.

export const WALL = 1;
export const FLOOR = 0;
export const EXIT = 2;

export interface Cell {
  x: number;
  y: number;
}

/** Vess Holloway's study — one anchor cell per depth holding all furniture. */
export interface Lair {
  x: number;
  y: number;
  /** direction the fireplace is built into (0=N,1=E,2=S,3=W); always a wall */
  fireDir: number;
}

export type CellContent = 'gold' | 'trap' | 'lore' | 'bandage' | null;

export interface Dungeon {
  size: number;
  grid: number[][];
  start: Cell;
  exit: Cell;
  /** searchable content per floor cell, keyed "x,y" */
  contents: Map<string, CellContent>;
  searched: Set<string>;
  level: number;
  lair: Lair;
  /** lair loot taken this level: 'shelf' (journal) and/or 'table' (tonic) */
  lairTaken: Set<string>;
}

const key = (x: number, y: number) => `${x},${y}`;

export function generateDungeon(size = 15, level = 1): Dungeon {
  const grid: number[][] = Array.from({ length: size }, () => Array(size).fill(WALL));

  // Carve with recursive backtracker (iterative).
  const stack: Cell[] = [{ x: 1, y: 1 }];
  grid[1][1] = FLOOR;
  const dirs = [
    { x: 0, y: -2 },
    { x: 2, y: 0 },
    { x: 0, y: 2 },
    { x: -2, y: 0 },
  ];
  while (stack.length) {
    const cur = stack[stack.length - 1];
    const options = dirs
      .map((d) => ({ x: cur.x + d.x, y: cur.y + d.y }))
      .filter((n) => n.x > 0 && n.y > 0 && n.x < size - 1 && n.y < size - 1 && grid[n.y][n.x] === WALL);
    if (!options.length) {
      stack.pop();
      continue;
    }
    const next = options[(Math.random() * options.length) | 0];
    grid[(cur.y + next.y) / 2][(cur.x + next.x) / 2] = FLOOR;
    grid[next.y][next.x] = FLOOR;
    stack.push(next);
  }

  // Braid: knock a few extra walls for loops (less linear).
  let knocked = 0;
  for (let y = 1; y < size - 1 && knocked < size; y++) {
    for (let x = 1; x < size - 1 && knocked < size; x++) {
      if (grid[y][x] === WALL && Math.random() < 0.08) {
        const h = grid[y][x - 1] === FLOOR && grid[y][x + 1] === FLOOR;
        const v = grid[y - 1][x] === FLOOR && grid[y + 1][x] === FLOOR;
        if (h !== v) {
          grid[y][x] = FLOOR;
          knocked++;
        }
      }
    }
  }

  const start: Cell = { x: 1, y: 1 };

  // Exit = farthest floor cell from start (BFS).
  const dist: number[][] = Array.from({ length: size }, () => Array(size).fill(-1));
  const q: Cell[] = [start];
  dist[start.y][start.x] = 0;
  let exit: Cell = start;
  while (q.length) {
    const c = q.shift()!;
    exit = c;
    for (const d of [
      { x: 1, y: 0 },
      { x: -1, y: 0 },
      { x: 0, y: 1 },
      { x: 0, y: -1 },
    ]) {
      const nx = c.x + d.x;
      const ny = c.y + d.y;
      if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
      if (grid[ny][nx] === WALL || dist[ny][nx] !== -1) continue;
      dist[ny][nx] = dist[c.y][c.x] + 1;
      q.push({ x: nx, y: ny });
    }
  }
  grid[exit.y][exit.x] = EXIT;

  // Scatter searchable content on floor cells (not start/exit).
  const contents = new Map<string, CellContent>();
  const floorCells: Cell[] = [];
  for (let y = 1; y < size - 1; y++)
    for (let x = 1; x < size - 1; x++)
      if (grid[y][x] === FLOOR && !(x === start.x && y === start.y)) floorCells.push({ x, y });
  const count = Math.min(floorCells.length, 6 + level * 2);
  for (let i = 0; i < count; i++) {
    const c = floorCells.splice((Math.random() * floorCells.length) | 0, 1)[0];
    const roll = Math.random();
    contents.set(key(c.x, c.y), roll < 0.28 ? 'gold' : roll < 0.48 ? 'trap' : roll < 0.68 ? 'lore' : roll < 0.85 ? 'bandage' : null);
  }

  // Guarantee early loot: the two nearest dead-ends to spawn always hold
  // something good, so the first searches teach reward before a trap punishes.
  const isDeadEnd = (x: number, y: number) => {
    if (grid[y][x] !== FLOOR) return false;
    let open = 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]])
      if (grid[y + dy] && grid[y + dy][x + dx] !== WALL) open++;
    return open === 1;
  };
  const nearDeadEnds = floorCells
    .filter((c) => isDeadEnd(c.x, c.y))
    .map((c) => ({ c, d: Math.abs(c.x - start.x) + Math.abs(c.y - start.y) }))
    .sort((a, b) => a.d - b.d);
  if (nearDeadEnds[0]) contents.set(key(nearDeadEnds[0].c.x, nearDeadEnds[0].c.y), 'gold');
  if (nearDeadEnds[1]) contents.set(key(nearDeadEnds[1].c.x, nearDeadEnds[1].c.y), 'bandage');

  // Vess's study: an anchor cell mid-depth (BFS 8–22 from start), never the
  // exit, with at least one adjacent wall for the fireplace. All furniture
  // lives in this one cell, arranged around its walls.
  const DIRS = [
    { x: 0, y: -1 },
    { x: 1, y: 0 },
    { x: 0, y: 1 },
    { x: -1, y: 0 },
  ];
  const hasWallNeighbor = (x: number, y: number) =>
    DIRS.some((d) => grid[y + d.y] && grid[y + d.y][x + d.x] === WALL);
  const candidates: Cell[] = [];
  for (let y = 1; y < size - 1; y++)
    for (let x = 1; x < size - 1; x++) {
      if (grid[y][x] !== FLOOR) continue;
      if (x === exit.x && y === exit.y) continue;
      if (dist[y][x] < 8 || dist[y][x] > 22) continue;
      if (!hasWallNeighbor(x, y)) continue;
      candidates.push({ x, y });
    }
  let anchor: Cell | null = candidates.length
    ? candidates[(Math.random() * candidates.length) | 0]
    : null;
  if (!anchor) {
    // Fallback: farthest non-exit floor cell with a wall neighbor.
    let best = -1;
    for (let y = 1; y < size - 1; y++)
      for (let x = 1; x < size - 1; x++) {
        if (grid[y][x] !== FLOOR || (x === exit.x && y === exit.y)) continue;
        if (!hasWallNeighbor(x, y)) continue;
        if (dist[y][x] > best) {
          best = dist[y][x];
          anchor = { x, y };
        }
      }
  }
  if (!anchor) anchor = { ...start }; // degenerate; never happens on 15x15
  const fireDir = DIRS.findIndex(
    (d) => grid[anchor!.y + d.y] && grid[anchor!.y + d.y][anchor!.x + d.x] === WALL
  );
  const lair: Lair = { x: anchor.x, y: anchor.y, fireDir: fireDir === -1 ? 0 : fireDir };

  return { size, grid, start, exit, contents, searched: new Set(), level, lair, lairTaken: new Set() };
}

export function cellKey(x: number, y: number): string {
  return key(x, y);
}

export function isWalkable(d: Dungeon, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= d.size || y >= d.size) return false;
  return d.grid[y][x] !== WALL;
}
