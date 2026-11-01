// Dungeon generation — recursive backtracker on an odd grid.
// 1 = wall, 0 = floor, 2 = exit stairs.

export const WALL = 1;
export const FLOOR = 0;
export const EXIT = 2;

export interface Cell {
  x: number;
  y: number;
}

export type CellContent = 'gold' | 'trap' | 'lore' | null;

export interface Dungeon {
  size: number;
  grid: number[][];
  start: Cell;
  exit: Cell;
  /** searchable content per floor cell, keyed "x,y" */
  contents: Map<string, CellContent>;
  searched: Set<string>;
  level: number;
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
    contents.set(key(c.x, c.y), roll < 0.4 ? 'gold' : roll < 0.65 ? 'trap' : 'lore');
  }

  return { size, grid, start, exit, contents, searched: new Set(), level };
}

export function cellKey(x: number, y: number): string {
  return key(x, y);
}

export function isWalkable(d: Dungeon, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= d.size || y >= d.size) return false;
  return d.grid[y][x] !== WALL;
}
