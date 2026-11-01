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
import { Monster, MonsterKind, spawnMonsters, monsterTick, killMonster } from './monsters';
import { HUD, visited, markVisited } from './hud';
import { GameAudio } from './audio';

interface Best {
  depth: number;
  kills: number;
  gold: number;
}

const BEST_KEY = 'hollowdeep.best.v1';

function loadBest(): Best | null {
  try {
    const raw = localStorage.getItem(BEST_KEY);
    return raw ? (JSON.parse(raw) as Best) : null;
  } catch {
    return null;
  }
}

function saveBest(b: Best) {
  try {
    localStorage.setItem(BEST_KEY, JSON.stringify(b));
  } catch {
    /* best-effort */
  }
}

/** Per-kind wind-up barks. Chad middle-manages his bites. */
function windupBark(m: Monster): string {
  if (m.kind === 'chad')
    return [
      'Chad schedules a mandatory bite.',
      'Chad wants to circle back… to your throat.',
      'Per my last email: RUN.',
    ][(Math.random() * 3) | 0];
  if (m.kind === 'wraith') return 'The Marrow Wraith inhales — like wind through ribs. Move!';
  return 'The Gibberling rears back, eyes blazing — move!';
}

const DEATH_BARKS: Record<MonsterKind, string[]> = {
  gibberling: ['SKREEE…', '*the gnawing stops*', 'The static clears.'],
  wraith: ['The wraith unravels into cold air.', '*a sigh, then silence*'],
  chad: ['Chad has left the dungeon. His calendar is finally clear.'],
};

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
  private audio = new GameAudio();
  private graceUntil = 0; // ms timestamp — monsters idle until then (spawn safety)
  private lastGrowl = 0;
  private kills = 0; // this run — remembered in localStorage on death

  constructor(container: HTMLElement) {
    this.renderer = new DungeonRenderer(container);
    this.d = generateDungeon(15, 1);
    this.newLevel(this.d, true);

    const titleEl = document.getElementById('title')!;
    const dismissTitle = () => {
      if (this.started) return;
      this.audio.unlock(); // user gesture — safe to start audio
      this.audio.startAmbient();
      titleEl.style.display = 'none';
      this.started = true;
      this.hud.log('You descend into the Hollowdeep.');
      this.hud.log('Find the shaft of blue light. Go down.');
    };
    // Best depth on the title screen — the labyrinth keeps score.
    const best = loadBest();
    if (best) {
      document.querySelector('#title p')!.textContent =
        `THE LABYRINTH REARRANGES ITSELF NIGHTLY · BEST: DEPTH ${best.depth}`;
    }
    titleEl.addEventListener('click', dismissTitle);
    // Keyboard users: Enter or Space on the focused title starts the game.
    titleEl.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        e.stopPropagation(); // don't let the game-input handler also see this key
        if (this.over) location.reload();
        else dismissTitle();
      }
    });

    addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
      if (e.repeat) return;
      // Title up: Enter/Space descends even when the title box isn't focused.
      if (!this.started && (e.key === 'Enter' || e.key === ' ')) {
        dismissTitle();
        return;
      }
      // Dead: Enter/Space tries again.
      if (this.over && (e.key === 'Enter' || e.key === ' ')) {
        location.reload();
        return;
      }
      this.keys.add(e.key.toLowerCase());
      this.handleKey(e.key.toLowerCase());
    });
    addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));

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

  private exitHintTier = 0; // 0 = none, 1 = faint cold, 2 = near — reset each level

  private newLevel(d: Dungeon, first = false) {
    this.d = d;
    this.px = d.start.x;
    this.py = d.start.y;
    // Spawn safety: face the first open direction (prefer east), never a wall.
    this.dir = [1, 0, 2, 3].find((dd) => {
      const [fx, fy] = [
        [0, -1],
        [1, 0],
        [0, 1],
        [-1, 0],
      ][dd];
      return isWalkable(d, this.px + fx, this.py + fy);
    }) ?? 1;
    this.tween = null;
    this.exitHintTier = 0;
    // Grace period: the labyrinth hasn't noticed you yet (~3s).
    this.graceUntil = performance.now() + 3000;
    this.occupied.clear();
    for (const m of this.monsters) killMonster(this.renderer.scene, m);
    this.monsters = spawnMonsters(this.renderer.scene, d, [d.start]);
    for (const m of this.monsters) this.occupied.add(`${m.pos.x},${m.pos.y}`);
    this.renderer.build(d);
    markVisited(d, this.px, this.py);
    this.renderer.setView(this.px, this.py, this.dir);
    this.hud.setHp(this.hp, this.maxHp);
    this.hud.setGold(this.gold);
    this.hud.drawMinimap(d, this.px, this.py, this.dir, this.monsters);
    if (!first) {
      this.hud.flash(`DEPTH ${d.level}`, 2500);
      this.hud.log(`You descend to depth ${d.level}. The walls feel… aware.`);
      if (d.level >= 3 && this.monsters.some((m) => m.kind === 'chad' && m.alive)) {
        this.hud.log('A nametag glints in the deeper dark: CHAD. Middle management has found you.');
      }
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
    this.exitWhisper();
    this.audio.footstep();
    if (this.d.grid[ny][nx] === EXIT) {
      setTimeout(() => {
        if (!this.over) {
          this.audio.descend();
          this.newLevel(generateDungeon(15, this.d.level + 1));
        }
      }, 350);
    }
  }

  /** Hot/cold exit sense: tiered whispers as the player nears the shaft.
   *  Text in the log + an audible breathy whisper (no words), louder when close. */
  private exitWhisper() {
    const dist =
      Math.abs(this.px - this.d.exit.x) + Math.abs(this.py - this.d.exit.y);
    if (dist === 0) return; // standing in it — descending anyway
    if (dist <= 4 && this.exitHintTier < 2) {
      this.exitHintTier = 2;
      this.hud.log('Cold blue light bleeds through the cracks. Close now.');
      this.audio.whisper('near');
    } else if (dist <= 9 && this.exitHintTier < 1) {
      this.exitHintTier = 1;
      this.hud.log('The air turns cold. Something blue breathes nearby.');
      this.audio.whisper('far');
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
    if (target) {
      this.audio.swing();
      this.attack(target);
    } else {
      // Whiff — small lunge animation via quick yaw nudge is overkill; just log occasionally.
      this.audio.swing();
      this.hud.log('You strike at empty air.');
    }
  }

  private attack(m: Monster) {
    const dmg = 2 + ((Math.random() * 3) | 0); // 2–4
    m.hp -= dmg;
    // Hit feedback: flash + shake + flinch pop + damage number.
    this.audio.hitFlesh();
    this.hud.hitFlash();
    this.hud.damageNumber(dmg);
    this.renderer.addShake(0.18);
    // Knockback flash: scale pop.
    const pop = m.scale * 1.25;
    m.sprite.scale.set(pop, pop, 1);
    setTimeout(() => m.sprite.scale.set(m.scale, m.scale, 1), 120);
    if (m.hp <= 0) {
      killMonster(this.renderer.scene, m);
      this.occupied.delete(`${m.pos.x},${m.pos.y}`);
      this.kills++;
      const barks = DEATH_BARKS[m.kind];
      this.hud.log(`${m.name} slain (${dmg}). ${barks[(Math.random() * barks.length) | 0]}`);
      if (m.kind === 'chad') {
        // The expense account spills everywhere.
        const g = 30 + ((Math.random() * 21) | 0);
        this.gold += g;
        this.hp = Math.min(this.maxHp, this.hp + 6);
        this.hud.setGold(this.gold);
        this.hud.setHp(this.hp, this.maxHp);
        this.hud.log(`Chad's expense account spills everywhere: +${g} coins, +6 HP.`);
      } else if (m.kind === 'gibberling' && Math.random() < 0.3) {
        this.hp = Math.min(this.maxHp, this.hp + 2);
        this.hud.log('It was guarding a scrap of rations. +2 HP.');
        this.hud.setHp(this.hp, this.maxHp);
      }
    } else {
      this.hud.log(`You hit the ${m.name} for ${dmg}.`);
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
    this.audio.search();
    const content: CellContent = this.d.contents.get(k) ?? null;
    if (content === 'gold') {
      const g = 5 + ((Math.random() * 20) | 0);
      this.gold += g;
      this.hud.setGold(this.gold);
      this.audio.find();
      this.hud.log(`You find ${g} guild coins in a cracked strongbox.`);
    } else if (content === 'bandage') {
      this.hp = Math.min(this.maxHp, this.hp + 4);
      this.hud.setHp(this.hp, this.maxHp);
      this.audio.find();
      this.hud.log('A wax-sealed bundle: clean bandages. +4 HP. Someone was prepared.');
    } else if (content === 'trap') {
      const dmg = 2 + ((Math.random() * 3) | 0);
      this.hp -= dmg;
      this.hud.setHp(this.hp, this.maxHp);
      this.audio.trap();
      this.renderer.addShake(0.18);
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
      this.audio.death();
      // The labyrinth keeps score.
      const run: Best = { depth: this.d.level, kills: this.kills, gold: this.gold };
      const prev = loadBest();
      const isBest = !prev || run.depth > prev.depth || (run.depth === prev.depth && run.gold > prev.gold);
      if (isBest) saveBest(run);
      const bestLine = isBest
        ? 'A NEW BEST.'
        : `BEST: DEPTH ${prev!.depth} · ${prev!.kills} KILLS`;
      this.hud.flash('THE DEEP CLAIMS YOU', 4000);
      this.hud.log(`You died on depth ${run.depth} with ${run.gold} coins and ${run.kills} kills. ${bestLine}`);
      document.getElementById('title')!.style.display = 'flex';
      document.querySelector('#title h1')!.textContent = 'CLAIMED';
      document.querySelector('#title p')!.textContent =
        `DEPTH ${run.depth} · ${run.kills} KILLS · ${run.gold} COINS — ${bestLine}`;
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

    // Monster ticks on a timer. Grace period: the labyrinth hasn't noticed you yet
    // — but the dead were already awake. Wraiths ignore the grace period.
    this.tickTimer += dt;
    if (this.tickTimer > 0.55) {
      this.tickTimer = 0;
      const graced = performance.now() < this.graceUntil;
      for (const m of this.monsters) {
        if (graced && m.kind !== 'wraith') continue;
        const events = monsterTick(m, this.d, { x: this.px, y: this.py }, this.occupied);
        for (const e of events) {
          if (e === 'windup') {
            // Telegraph: eyes flare (scale pop) + warning growl. Dodge by moving.
            const wpop = m.scale * 1.3;
            m.sprite.scale.set(wpop, wpop, 1);
            setTimeout(() => {
              if (m.alive) m.sprite.scale.set(m.scale, m.scale, 1);
            }, 400);
            this.audio.growl(0.9);
            this.hud.log(windupBark(m));
          } else if (e.startsWith('hit:')) {
            const bdmg = parseInt(e.slice(4), 10) || 1;
            this.hp -= bdmg;
            this.hud.setHp(this.hp, this.maxHp);
            this.hud.log(`A ${m.name} bites you! -${bdmg} HP.`);
            this.audio.bite();
            this.audio.hurt();
            this.renderer.addShake(0.22);
            this.hud.damageFlash(this.biteDirection(m));
            this.checkDeath();
          }
        }
      }
      // Growl when something is near — you hear it before you see it.
      const now = performance.now();
      if (!this.over && now - this.lastGrowl > 4000) {
        let nearest = 99;
        for (const m of this.monsters) {
          if (!m.alive) continue;
          const d = Math.abs(m.pos.x - this.px) + Math.abs(m.pos.y - this.py);
          if (d < nearest) nearest = d;
        }
        if (nearest <= 5) {
          this.lastGrowl = now;
          this.audio.growl(1 - nearest / 6);
        }
      }
      this.hud.drawMinimap(this.d, this.px, this.py, this.dir, this.monsters);
    }
  }

  /** Direction of monster m relative to where the player faces. */
  private biteDirection(m: Monster): 'front' | 'left' | 'right' | 'back' {
    const dx = m.pos.x - this.px;
    const dy = m.pos.y - this.py;
    const dirs = [
      [0, -1],
      [1, 0],
      [0, 1],
      [-1, 0],
    ];
    const aIdx = dirs.findIndex(([x, y]) => x === dx && y === dy);
    if (aIdx === -1) return 'front';
    const rel = (aIdx - this.dir + 4) % 4;
    return rel === 0 ? 'front' : rel === 1 ? 'right' : rel === 2 ? 'back' : 'left';
  }
}
