// Game orchestration — input, movement, combat, search, ticks.
// EOB-authentic: grid steps, 90° turns. WASD + arrows BOTH bound
// (the old game's bug was unbound WASD — not repeating that).

import { DungeonRenderer, CELL } from './renderer';
import {
  Dungeon,
  generateDungeon,
  isWalkable,
  cellKey,
  CellContent,
  EXIT,
} from './dungeon';
import { Monster, spawnGibberlings, monsterTick, killMonster } from './monsters';
import { HUD, visited, markVisited } from './hud';

const LORE = [
  'Scratched into the wall: "THE MAPS WERE RIGHT. THE DUNGEON CHEATS." — S.V.',
  'A Guild expedition tag, snapped in half. Dated three years ago.',
  'Someone has been counting. Tally marks cover this wall — 4,112 of them.',
  'A child’s drawing of a sun, impossibly far underground.',
  'Wet footprints lead into the wall and do not come out.',
];

interface Tween {
  t: number;
  dur: number;
  fromX: number;
  fromZ: number;
  toX: number;
  toZ: number;
  fromYaw: number;
  toYaw: number;
  moving: boolean;
  turning: boolean;
}

export class Game {
  private renderer: DungeonRenderer;
  private hud = new HUD();
  private d: Dungeon;
  private px = 1;
  private py = 1;
  private dir = 1; // 0=N,1=E,2=S,3=W — start facing east into the maze
  private hp = 20;
  private maxHp = 20;
  private gold = 0;
  private monsters: Monster[] = [];
  private occupied = new Set<string>();
  private tween: Tween | null = null;
  private keys = new Set<string>();
  private tickTimer = 0;
  private bobPhase = 0;
  private over = false;
  private started = false;

  constructor(container: HTMLElement) {
    this.renderer = new DungeonRenderer(container);
    this.d = generateDungeon(15, 1);
    this.newLevel(this.d, true);

    addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.key.toLowerCase());
      this.handleKey(e.key.toLowerCase());
    });
    addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));

    document.getElementById('title')!.addEventListener('click', () => {
      document.getElementById('title')!.style.display = 'none';
      this.started = true;
      this.hud.log('You descend into the Hollowdeep.');
      this.hud.log('Find the shaft of blue light. Go down.');
    });

    // Autotest hook: #autotest runs a scripted playthrough for headless verification.
    if (location.hash === '#autotest') {
      setTimeout(() => {
        document.getElementById('title')!.style.display = 'none';
        this.started = true;
        this.hud.log('You descend into the Hollowdeep.');
        const seq = ['w', 'w', 'arrowright', 'w', 'f', 'w', 'a', 'w', ' ', 'f'];
        let i = 0;
        const step = () => {
          if (i < seq.length && !this.over) {
            this.handleKey(seq[i]);
            i++;
            setTimeout(step, 600);
          }
        };
        setTimeout(step, 800);
      }, 800);
    }

    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (this.started && !this.over) this.update(dt);
      this.renderer.update(dt);
      this.renderer.render();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  private newLevel(d: Dungeon, first = false) {
    this.d = d;
    this.px = d.start.x;
    this.py = d.start.y;
    this.dir = 1;
    this.tween = null;
    this.occupied.clear();
    for (const m of this.monsters) killMonster(this.renderer.scene, m);
    this.monsters = spawnGibberlings(this.renderer.scene, d, 5 + d.level * 2, [d.start]);
    for (const m of this.monsters) this.occupied.add(`${m.pos.x},${m.pos.y}`);
    this.renderer.build(d);
    markVisited(d, this.px, this.py);
    this.renderer.setView(this.px, this.py, this.dir);
    this.hud.setHp(this.hp, this.maxHp);
    this.hud.drawMinimap(d, this.px, this.py, this.dir, this.monsters);
    if (!first) {
      this.hud.flash(`DEPTH ${d.level}`, 2500);
      this.hud.log(`You descend to depth ${d.level}. The walls feel… aware.`);
    }
  }

  private yawFor(dir: number): number {
    // Camera default looks along -Z (map north). dir: 0=N,1=E,2=S,3=W.
    return [0, -Math.PI / 2, Math.PI, Math.PI / 2][dir];
  }

  private tryStep(dx: number, dy: number) {
    if (this.tween || this.over) return;
    const nx = this.px + dx;
    const ny = this.py + dy;
    if (!isWalkable(this.d, nx, ny)) {
      this.hud.log('A wall. The labyrinth declines.');
      return;
    }
    // Blocked by a monster? Shove = attack instead.
    const bumped = this.monsters.find((m) => m.alive && m.pos.x === nx && m.pos.y === ny);
    if (bumped) {
      this.attack(bumped);
      return;
    }
    const fromX = this.px * CELL;
    const fromZ = this.py * CELL;
    this.px = nx;
    this.py = ny;
    this.tween = {
      t: 0,
      dur: 0.16,
      fromX,
      fromZ,
      toX: nx * CELL,
      toZ: ny * CELL,
      fromYaw: this.yawFor(this.dir),
      toYaw: this.yawFor(this.dir),
      moving: true,
      turning: false,
    };
    markVisited(this.d, nx, ny);
    if (this.d.grid[ny][nx] === EXIT) {
      setTimeout(() => {
        if (!this.over) this.newLevel(generateDungeon(15, this.d.level + 1));
      }, 350);
    }
  }

  private tryTurn(clockwise: boolean) {
    if (this.tween || this.over) return;
    const fromDir = this.dir;
    this.dir = (this.dir + (clockwise ? 1 : 3)) % 4;
    // Shortest-arc yaw tween.
    let fromYaw = this.yawFor(fromDir);
    let toYaw = this.yawFor(this.dir);
    while (toYaw - fromYaw > Math.PI) toYaw -= Math.PI * 2;
    while (toYaw - fromYaw < -Math.PI) toYaw += Math.PI * 2;
    this.tween = {
      t: 0,
      dur: 0.14,
      fromX: this.px * CELL,
      fromZ: this.py * CELL,
      toX: this.px * CELL,
      toZ: this.py * CELL,
      fromYaw,
      toYaw,
      moving: false,
      turning: true,
    };
  }

  private forward(): [number, number] {
    return [
      [0, -1],
      [1, 0],
      [0, 1],
      [-1, 0],
    ][this.dir] as [number, number];
  }

  private handleKey(k: string) {
    if (!this.started || this.over || this.tween) return;
    const [fx, fy] = this.forward();
    switch (k) {
      case 'w':
      case 'arrowup':
        this.tryStep(fx, fy);
        break;
      case 's':
      case 'arrowdown':
        this.tryStep(-fx, -fy);
        break;
      case 'a':
        this.tryStep(fy, -fx); // strafe left
        break;
      case 'd':
        this.tryStep(-fy, fx); // strafe right
        break;
      case 'arrowleft':
        this.tryTurn(false);
        break;
      case 'arrowright':
        this.tryTurn(true);
        break;
      case 'f':
        this.search();
        break;
      case ' ':
        this.attackFacing();
        break;
    }
  }

  private attackFacing() {
    if (this.over) return;
    const [fx, fy] = this.forward();
    const target = this.monsters.find(
      (m) => m.alive && m.pos.x === this.px + fx && m.pos.y === this.py + fy
    );
    if (target) this.attack(target);
    else {
      // Whiff — small lunge animation via quick yaw nudge is overkill; just log occasionally.
      this.hud.log('You strike at empty air.');
    }
  }

  private attack(m: Monster) {
    const dmg = 2 + ((Math.random() * 3) | 0); // 2–4
    m.hp -= dmg;
    // Knockback flash: scale pop.
    m.sprite.scale.set(2.0, 2.0, 1);
    setTimeout(() => m.sprite.scale.set(1.6, 1.6, 1), 120);
    if (m.hp <= 0) {
      killMonster(this.renderer.scene, m);
      this.occupied.delete(`${m.pos.x},${m.pos.y}`);
      const barks = ['SKREEE…', '*the gnawing stops*', 'The static clears.'];
      this.hud.log(`Gibberling slain (${dmg}). ${barks[(Math.random() * barks.length) | 0]}`);
      if (Math.random() < 0.3) {
        this.hp = Math.min(this.maxHp, this.hp + 2);
        this.hud.log('It was guarding a scrap of rations. +2 HP.');
        this.hud.setHp(this.hp, this.maxHp);
      }
    } else {
      this.hud.log(`You hit the Gibberling for ${dmg}.`);
    }
  }

  private search() {
    if (this.over) return;
    const k = cellKey(this.px, this.py);
    if (this.d.searched.has(k)) {
      this.hud.log('You already searched here. The dust remembers.');
      return;
    }
    this.d.searched.add(k);
    const content: CellContent = this.d.contents.get(k) ?? null;
    if (content === 'gold') {
      const g = 5 + ((Math.random() * 20) | 0);
      this.gold += g;
      this.hud.log(`You find ${g} guild coins in a cracked strongbox.`);
    } else if (content === 'trap') {
      const dmg = 2 + ((Math.random() * 3) | 0);
      this.hp -= dmg;
      this.hud.setHp(this.hp, this.maxHp);
      this.hud.log(`A needle trap! ${dmg} damage. The labyrinth approves of your curiosity.`);
      this.checkDeath();
    } else if (content === 'lore') {
      this.hud.log(LORE[(Math.random() * LORE.length) | 0]);
    } else {
      const nothings = [
        'Dust. More dust. The labyrinth is tidy about its secrets.',
        'Nothing. Which, down here, feels like a threat.',
        'You find a single white thread. Nia’s been here.',
      ];
      this.hud.log(nothings[(Math.random() * nothings.length) | 0]);
    }
  }

  private checkDeath() {
    if (this.hp <= 0 && !this.over) {
      this.over = true;
      this.hud.flash('THE DEEP CLAIMS YOU', 4000);
      this.hud.log(`You died on depth ${this.d.level} with ${this.gold} coins. Click to try again.`);
      document.getElementById('title')!.style.display = 'flex';
      document.querySelector('#title h1')!.textContent = 'CLAIMED';
      document.querySelector('#title p')!.textContent = 'THE LABYRINTH REARRANGES ITSELF TONIGHT';
      document.querySelector('#title .enter')!.textContent = 'DESCEND AGAIN';
      document.getElementById('title')!.onclick = () => location.reload();
    }
  }

  private update(dt: number) {
    // Tween movement / turning.
    if (this.tween) {
      const tw = this.tween;
      tw.t += dt;
      const p = Math.min(1, tw.t / tw.dur);
      const e = 1 - Math.pow(1 - p, 3); // easeOutCubic
      const yaw = tw.fromYaw + (tw.toYaw - tw.fromYaw) * e;
      if (tw.moving) {
        const x = tw.fromX + (tw.toX - tw.fromX) * e;
        const z = tw.fromZ + (tw.toZ - tw.fromZ) * e;
        this.renderer.camera.position.set(x, 1.7 + Math.sin(this.bobPhase) * 0.04, z);
        this.renderer.camera.rotation.set(0, yaw, 0, 'YXZ');
        this.renderer.torch.position.set(x, 2.6, z);
        this.bobPhase += dt * 14;
      } else {
        this.renderer.setYaw(yaw);
      }
      if (p >= 1) {
        this.tween = null;
        this.renderer.setView(this.px, this.py, this.dir);
      }
    }

    // Monster ticks on a timer.
    this.tickTimer += dt;
    if (this.tickTimer > 0.55) {
      this.tickTimer = 0;
      for (const m of this.monsters) {
        const events = monsterTick(m, this.d, { x: this.px, y: this.py }, this.occupied);
        for (const e of events) {
          if (e === 'hit:1') {
            this.hp -= 1;
            this.hud.setHp(this.hp, this.maxHp);
            this.hud.log('A Gibberling bites you! -1 HP.');
            this.checkDeath();
          }
        }
      }
      this.hud.drawMinimap(this.d, this.px, this.py, this.dir, this.monsters);
    }
  }
}
