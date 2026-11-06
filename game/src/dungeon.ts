// Dungeon generation — recursive backtracker on an odd grid.
// 1 = wall, 0 = floor, 2 = exit stairs.

export const WALL = 1;
export const FLOOR = 0;
export const EXIT = 2;

export interface Cell {
  x: number;
  y: number;
}

export interface Doorway {
  x: number;
  y: number;
  /** outward direction from the room (0=N,1=E,2=S,3=W) */
  dir: number;
}

/** Vess's study, carved as a real 5x5 chamber in the maze. */
export interface Lair {
  x0: number;
  y0: number;
  x1: number;
  y1: number; // inclusive rect
  cx: number;
  cy: number; // room center cell
  fireDir: number; // fireplace wall side (fewest doorways)
  doorways: Doorway[];
  /** furniture cells (blocked for movement) */
  hearth: Cell;
  shelf: Cell;
  table: Cell;
  cauldron: Cell;
  clock: Cell; // grandfather clock, corner opposite the cauldron
}

/** One sunpetal spot in the Vale — stream bank, white ruins, or high ridge. */
export interface ValeSpot {
  kind: 'stream' | 'ruins' | 'ridge';
  x: number;
  y: number;
  taken: boolean;
}

/** 'dungeon' = the dark gut; 'vale' = the god's bright dream of the surface. */
export type Theme = 'dungeon' | 'vale';

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
  theme: Theme;
  /** Vess's study — null in the Vale (no study out there, only the dream). */
  lair: Lair | null;
  /** lair loot taken this level: 'shelf' (journal), 'table' (tonic), 'cauldron' (brew) */
  lairTaken: Set<string>;
  /** solid masonry — not walkable (the hearth; shelf/table/cauldron are
   *  walk-around-able so the study never feels cramped) */
  blocked: Set<string>;
  /** Vale-only: sunpetal spots (stream, ruins, ridge). */
  valeSpots?: ValeSpot[];
  /** Vale-only: grid row of the stream (visual band, still walkable). */
  streamRow?: number;
  /** The fissure in the study is sealed once the sunpetal quest is done. */
  valeSealed?: boolean;
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

  // Vess's study: carve a 5x5 chamber into the maze. Opening walls can never
  // disconnect the dungeon, so connectivity is preserved.
  const RW = 5;
  const RH = 5;
  const rx = 2 + ((Math.random() * (size - RW - 4)) | 0);
  const ry = 2 + ((Math.random() * (size - RH - 4)) | 0);
  for (let y = ry; y < ry + RH; y++)
    for (let x = rx; x < rx + RW; x++) grid[y][x] = FLOOR;
  const inRoom = (x: number, y: number) =>
    x >= rx && x < rx + RW && y >= ry && y < ry + RH;

  // Exit = farthest floor cell from start (BFS), never inside the study.
  const dist: number[][] = Array.from({ length: size }, () => Array(size).fill(-1));
  const q: Cell[] = [start];
  dist[start.y][start.x] = 0;
  let exit: Cell = start;
  let exitD = -1;
  while (q.length) {
    const c = q.shift()!;
    if (!inRoom(c.x, c.y) && dist[c.y][c.x] > exitD) {
      exitD = dist[c.y][c.x];
      exit = c;
    }
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

  // Scatter searchable content on floor cells (not start/exit, not the study).
  const contents = new Map<string, CellContent>();
  const floorCells: Cell[] = [];
  for (let y = 1; y < size - 1; y++)
    for (let x = 1; x < size - 1; x++)
      if (grid[y][x] === FLOOR && !(x === start.x && y === start.y) && !inRoom(x, y))
        floorCells.push({ x, y });
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

  // Vess's study: the carved chamber becomes the lair. Doorways are room-edge
  // cells with a corridor beyond; the fireplace takes the side with the
  // fewest doorways. Furniture cells are blocked for movement.
  const DIRS = [
    { x: 0, y: -1 },
    { x: 1, y: 0 },
    { x: 0, y: 1 },
    { x: -1, y: 0 },
  ];
  const doorways: Doorway[] = [];
  for (let x = rx; x < rx + RW; x++) {
    if (grid[ry - 1][x] === FLOOR) doorways.push({ x, y: ry, dir: 0 });
    if (grid[ry + RH][x] === FLOOR) doorways.push({ x, y: ry + RH - 1, dir: 2 });
  }
  for (let y = ry; y < ry + RH; y++) {
    if (grid[y][rx - 1] === FLOOR) doorways.push({ x: rx, y, dir: 3 });
    if (grid[y][rx + RW] === FLOOR) doorways.push({ x: rx + RW - 1, y, dir: 1 });
  }
  const dwCount = [0, 0, 0, 0];
  for (const dw of doorways) dwCount[dw.dir]++;
  let fireDir = 0;
  for (let d = 1; d < 4; d++) if (dwCount[d] < dwCount[fireDir]) fireDir = d;

  const cx = rx + 2;
  const cy = ry + 2;
  const fv = DIRS[fireDir]; // toward the fireplace wall
  const rv = { x: -fv.y, y: fv.x }; // 90° clockwise (bookshelf side)
  const hearth: Cell = { x: cx + fv.x * 2, y: cy + fv.y * 2 };
  const shelf: Cell = { x: cx + rv.x * 2, y: cy + rv.y * 2 };
  const table: Cell = { x: cx - fv.x, y: cy - fv.y };
  const cauldron: Cell = { x: cx + rv.x + fv.x, y: cy + rv.y + fv.y };
  const clock: Cell = { x: cx - rv.x - fv.x, y: cy - rv.y - fv.y }; // opposite corner
  const lair: Lair = {
    x0: rx,
    y0: ry,
    x1: rx + RW - 1,
    y1: ry + RH - 1,
    cx,
    cy,
    fireDir,
    doorways,
    hearth,
    shelf,
    table,
    cauldron,
    clock,
  };
  const blocked = new Set<string>([key(hearth.x, hearth.y), key(clock.x, clock.y)]);

  return { size, grid, start, exit, contents, searched: new Set(), level, theme: 'dungeon', lair, lairTaken: new Set(), blocked, valeSealed: false };
}

/**
 * The Vale of First Light — the god's dream of the surface. A bright open
 * meadow (13x13): gold grass, a stream across the middle, white stone ruins,
 * a high ridge to the north. Three sunpetal spots (stream bank, ruins, high
 * ridge); the fissure back to the study is the exit at the south edge.
 * No monsters, no study, no traps — the only danger is lingering.
 * Spots/start/exit are fixed layout; ruin walls are placed to never block
 * them (verified by BFS in the node test harness).
 */
export function generateVale(size = 13, level = 1): Dungeon {
  const grid: number[][] = Array.from({ length: size }, () => Array(size).fill(FLOOR));
  // Border walls — the dream has edges, even if they're made of light.
  for (let i = 0; i < size; i++) {
    grid[0][i] = WALL;
    grid[size - 1][i] = WALL;
    grid[i][0] = WALL;
    grid[i][size - 1] = WALL;
  }
  // White stone ruins — broken walls, never on a spot, the start, or the ridge path.
  const ruins: Cell[] = [
    { x: 8, y: 3 }, { x: 9, y: 3 }, { x: 10, y: 3 }, { x: 8, y: 4 },
    { x: 3, y: 9 }, { x: 10, y: 9 }, { x: 2, y: 4 },
  ];
  for (const r of ruins) grid[r.y][r.x] = WALL;
  // Standing stones flanking the high ridge.
  grid[1][5] = WALL;
  grid[1][7] = WALL;

  const streamRow = 6;
  const start: Cell = { x: 6, y: 11 }; // the fissure — also the way back
  const exit: Cell = { x: 6, y: 11 };
  grid[exit.y][exit.x] = EXIT;

  const valeSpots: ValeSpot[] = [
    { kind: 'stream', x: 3, y: 7, taken: false }, // just south of the stream
    { kind: 'ruins', x: 9, y: 4, taken: false }, // inside the broken walls
    { kind: 'ridge', x: 6, y: 1, taken: false }, // high ridge, north edge
  ];

  return {
    size,
    grid,
    start,
    exit,
    contents: new Map(),
    searched: new Set(),
    level,
    theme: 'vale',
    lair: null,
    lairTaken: new Set(),
    blocked: new Set(),
    valeSpots,
    streamRow,
    valeSealed: false,
  };
}

export function cellKey(x: number, y: number): string {
  return key(x, y);
}

export function isWalkable(d: Dungeon, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= d.size || y >= d.size) return false;
  if (d.grid[y][x] === WALL) return false;
  if (d.blocked.has(key(x, y))) return false;
  return true;
}

/** True when the cell is inside Vess's study. The Vale has no study. */
export function inLair(d: Dungeon, x: number, y: number): boolean {
  if (!d.lair) return false;
  return x >= d.lair.x0 && x <= d.lair.x1 && y >= d.lair.y0 && y <= d.lair.y1;
}
