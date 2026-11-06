// Game orchestration — input, movement, combat, search, ticks.
// EOB-authentic: grid steps, 90° turns. WASD + arrows BOTH bound
// (the old game's bug was unbound WASD — not repeating that).

import { DungeonRenderer, CELL } from './renderer';
import {
  Dungeon,
  generateDungeon,
  generateVale,
  isWalkable,
  inLair,
  cellKey,
  Cell,
  CellContent,
  ValeSpot,
  EXIT,
} from './dungeon';
import { Monster, MonsterKind, spawnMonsters, spawnChadNear, monsterTick, killMonster, destroyMonsters, animateMonsters } from './monsters';
import {
  CHAD_CHOICES,
  ChadChoiceId,
  DEAL_PRICE,
  DEAL_DURATION_MS,
  ENRAGE_DURATION_MS,
  chadGreeting,
  chadDealAccept,
  chadDealMock,
  chadTauntBack,
  chadParting,
  chadEnragedBark,
  VESS_CHOICES,
  VessChoiceId,
  VESS_EXIT_LINE,
  VESS_ADVICE_LOWHP,
  vessGreeting,
  vessStory,
  vessAdviceTip,
  vessParting,
} from './dialogue';
import { HUD, visited, markVisited } from './hud';
import { GameAudio, VessVoiceKind } from './audio';
import { initTouchControls, isTouchDevice } from './touch';
import { journalPage, VALE_PAGE } from './lore';

interface Best {
  depth: number;
  kills: number;
  gold: number;
}

const BEST_KEY = 'hollowdeep.best.v1';
const MUTE_KEY = 'hollowdeep.muted.v1';

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
  if (m.kind === 'chad') {
    if (Date.now() < m.enragedUntil) return chadEnragedBark();
    return [
      'Chad schedules a mandatory bite.',
      'Chad wants to circle back… to your throat.',
      'Per my last email: RUN.',
      'Chad has added biting you to the sprint.',
      "Let's take this offline — permanently.",
    ][(Math.random() * 5) | 0];
  }
  if (m.kind === 'wraith')
    return [
      'The Marrow Wraith inhales — like wind through ribs. Move!',
      'Cold fingers of air close around your throat. Move!',
    ][(Math.random() * 2) | 0];
  return [
    'The Gibberling rears back, eyes blazing — move!',
    'The Gibberling gibbers faster. That means bite. Move!',
  ][(Math.random() * 2) | 0];
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

/** The Vale of First Light — dream-drift lasts one full backwards turn of
 *  the study clock (120s). Then the dream notices you. */
const VALE_DRIFT_SECONDS = 120;

/** What each sunpetal says when you pick it. */
const PETAL_LINES: Record<ValeSpot['kind'], string> = {
  stream: 'A sunpetal nods by the stream — gold on gold. You take it gently. The water keeps singing the same note.',
  ruins: 'Between the white stones, a sunpetal grows from a crack in the old world. You take it. The ruins don’t mind.',
  ridge: 'On the high ridge, the sunpetal faces the wrong way, like all the flowers here. You take it anyway.',
};

/** Searching the Vale: bright, warm, and wrong in small ways — including the
 *  one that matters: time runs true here. */
const VALE_SEARCH_LINES = [
  'The sun hasn’t moved since you arrived. But the clock in your head — the one that always ran backwards down here — is ticking forward.',
  'The same bird sings the same note. It has been singing it for fifty years.',
  'The flowers all face the wrong way. You decide not to think about it.',
  'Gold grass, warm light, no walls that breathe. It feels like a lie you want to believe.',
  'Your shadow falls the wrong way. You step out of it.',
];

/** Every cell of Vess's study — monsters never spawn inside. No study, no cells. */
function roomCells(d: Dungeon): Cell[] {
  if (!d.lair) return [];
  const out: Cell[] = [];
  for (let y = d.lair.y0; y <= d.lair.y1; y++)
    for (let x = d.lair.x0; x <= d.lair.x1; x++) out.push({ x, y });
  return out;
}

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
  private animTime = 0; // global clock for monster idle animation
  private chadTarget: Monster | null = null; // Chad currently in dialogue
  private dialogueMode: 'chad' | 'vess' | null = null; // who the open dialogue is with
  private bobPhase = 0;
  private over = false;
  private started = false;
  private audio = new GameAudio();
  private graceUntil = 0; // ms timestamp — monsters idle until then (spawn safety)
  private lastGrowl = 0;
  private kills = 0; // this run — remembered in localStorage on death
  private journal: string[] = []; // Vess's pages, collected across depths
  private lairGreeted = false; // per level
  // The Vale of First Light — a bright dream-valley through the study fissure.
  private inVale = false;
  private valeSaved: {
    dungeon: Dungeon;
    px: number;
    py: number;
    dir: number;
    monsters: Monster[];
    occupied: Set<string>;
    exitHintTier: number;
  } | null = null;
  private valePetals = new Set<ValeSpot['kind']>(); // this visit's harvest
  private valeDrift = 0; // seconds left before the dream notices you
  private valeDriftShown = -1; // last whole second pushed to the HUD
  private valeCompleted = false; // all three petals, this run — fissure seals
  private valeExitTier = 0; // fissure proximity hints, per visit
  private fissureHinted = false; // per level

  constructor(container: HTMLElement) {
    this.renderer = new DungeonRenderer(container);
    this.hud.setMuteHandler(() => this.toggleMute());
    this.d = generateDungeon(15, 1);
    this.newLevel(this.d, true);

    const titleEl = document.getElementById('title')!;
    let showTouch: (() => void) | null = null;
    if (isTouchDevice()) {
      showTouch = initTouchControls((k) => this.press(k)).show;
    }
    const dismissTitle = () => {
      if (this.started) return;
      this.audio.unlock(); // user gesture — safe to start audio
      // Restore the saved mute state (M or the speaker button toggles it).
      try {
        const saved = localStorage.getItem(MUTE_KEY) === '1';
        this.audio.setMuted(saved);
        this.hud.setMuted(saved);
      } catch {
        /* best-effort */
      }
      this.audio.startAmbient();
      this.audio.startMusic();
      titleEl.style.display = 'none';
      this.started = true;
      showTouch?.();
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

    // Test hook: #chad drops a Chad near spawn for dialogue verification.
    if (location.hash === '#chad') {
      setTimeout(() => {
        document.getElementById('title')!.style.display = 'none';
        this.started = true;
        const m = spawnChadNear(
          this.renderer.scene,
          this.d,
          { x: this.px, y: this.py },
          this.occupied
        );
        if (m) {
          this.monsters.push(m);
          this.hud.log('Chad has entered the dungeon. Press T to talk.');
          this.hud.drawMinimap(this.d, this.px, this.py, this.dir, this.monsters);
        }
      }, 800);
    }
    // Test hook: #lair teleports to Vess's study for visual verification.
    if (location.hash === '#lair') {
      setTimeout(() => {
        document.getElementById('title')!.style.display = 'none';
        this.started = true;
        this.px = this.d.lair!.cx;
        this.py = this.d.lair!.cy;
        this.dir = this.d.lair!.fireDir; // face the fireplace straight on
        markVisited(this.d, this.px, this.py);
        this.renderer.setView(this.px, this.py, this.dir);
        this.hud.drawMinimap(this.d, this.px, this.py, this.dir, this.monsters);
        this.hud.log("Vess's study. Dust, old paper — and a fire that never goes out.");
      }, 800);
    }
    // Test hook: #vale walks straight into the Vale from the study.
    if (location.hash === '#vale') {
      setTimeout(() => {
        document.getElementById('title')!.style.display = 'none';
        this.started = true;
        this.px = this.d.lair!.cx;
        this.py = this.d.lair!.cy;
        this.dir = this.d.lair!.fireDir;
        markVisited(this.d, this.px, this.py);
        this.renderer.setView(this.px, this.py, this.dir);
        this.hud.drawMinimap(this.d, this.px, this.py, this.dir, this.monsters);
        this.enterVale();
      }, 800);
    }

    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      // Journal open = the delver is reading; the dungeon waits.
      if (this.started && !this.over && !this.hud.isJournalOpen() && !this.hud.isDialogueOpen()) this.update(dt);
      this.renderer.update(dt);
      this.renderer.render();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  private exitHintTier = 0; // 0 = none, 1 = faint cold, 2 = near — reset each level

  private newLevel(d: Dungeon, first = false) {
    this.d = d;
    // The sunpetal quest is once per run — every deeper study's fissure
    // stays sealed after it is done.
    if (this.valeCompleted) d.valeSealed = true;
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
    this.lairGreeted = false;
    this.fissureHinted = false;
    this.audio.stopFire();
    this.audio.stopClock(); // proximity check restarts them if the study is near
    // Grace period: the labyrinth hasn't noticed you yet (~3s).
    this.graceUntil = performance.now() + 3000;
    this.occupied.clear();
    destroyMonsters(this.renderer.scene, this.monsters); // instant teardown, no death anims
    this.monsters = spawnMonsters(this.renderer.scene, d, [
      d.start,
      ...roomCells(d),
    ]);
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
    if (inLair(this.d, nx, ny) && !this.lairGreeted) {
      this.lairGreeted = true;
      this.hud.log("Vess's study. Dust, old paper — and a fire that never goes out.");
    }
    // The fissure hums underfoot — warm light from a crack in the floor.
    if (this.d.lair && nx === this.d.lair.cx && ny === this.d.lair.cy && !this.fissureHinted) {
      this.fissureHinted = true;
      if (this.d.valeSealed) {
        this.hud.log('The fissure is dark now. The Vale has given all it has.');
      } else {
        this.hud.log('A fissure in the floor breathes warm light. Press F to step through.');
      }
    }
    if (this.d.grid[ny][nx] === EXIT) {
      if (this.inVale) {
        // The golden shaft is the way back — no descent, just home.
        setTimeout(() => {
          if (!this.over) this.returnToStudy(false);
        }, 350);
        return;
      }
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
    if (this.inVale) {
      // The way back is warm light, not cold blue.
      if (dist <= 4 && this.valeExitTier < 2) {
        this.valeExitTier = 2;
        this.hud.log('The fissure waits — warm light, and the way back.');
      } else if (dist <= 8 && this.valeExitTier < 1) {
        this.valeExitTier = 1;
        this.hud.log('Somewhere behind you, the fissure breathes warm air.');
      }
      return;
    }
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

  /** Touch controls + autotest feed through here — same discrete path as keys. */
  press(k: string) {
    this.handleKey(k);
  }

  private handleKey(k: string) {
    if (!this.started || this.over) return;
    // Overlays capture input while open.
    if (k === 'j' || k === 't' || k === 'escape') {
      if (this.hud.isDialogueOpen()) {
        if (k === 't' || k === 'escape') {
          this.hud.hideDialogue();
          this.chadTarget = null;
          this.dialogueMode = null;
        }
        return;
      }
      if (this.hud.isJournalOpen()) {
        if (k === 'j' || k === 'escape') this.hud.hideJournal();
        return;
      }
      if (k === 'j') {
        this.hud.showJournal(this.journal);
        return;
      }
      if (k === 't') {
        this.tryTalk();
        return;
      }
      return; // escape with nothing open
    }
    if (k === 'm') {
      this.toggleMute();
      return;
    }
    if (this.hud.isJournalOpen() || this.hud.isDialogueOpen()) {
      // Choice keys while talking. Chad has 3 choices, Vess has 4.
      if (this.dialogueMode === 'chad') {
        if (k === '1') this.resolveChadChoice('deal');
        else if (k === '2') this.resolveChadChoice('taunt');
        else if (k === '3') this.resolveChadChoice('leave');
      } else if (this.dialogueMode === 'vess') {
        if (k === '1') this.resolveVessChoice('exit');
        else if (k === '2') this.resolveVessChoice('story');
        else if (k === '3') this.resolveVessChoice('advice');
        else if (k === '4') this.resolveVessChoice('leave');
      }
      return;
    }
    if (this.tween) return;
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
    // Enraged Chad fights sloppy: +1 damage taken.
    const dmg = 2 + ((Math.random() * 3) | 0) + (m.kind === 'chad' && Date.now() < m.enragedUntil ? 1 : 0);
    m.hp -= dmg;
    // Hit feedback: flash + shake + flinch pop + damage number.
    this.audio.hitFlesh();
    this.hud.hitFlash();
    this.hud.damageNumber(dmg);
    this.renderer.addShake(0.18);
    // Knockback flash: scale pop (the per-frame animator owns sprite scale).
    m.hitT = 1;
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

  /** Mute toggle — M key or the speaker button. Persists across sessions. */
  private toggleMute() {
    const muted = !this.audio.isMuted();
    this.audio.setMuted(muted);
    this.hud.setMuted(muted);
    try {
      localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
    } catch {
      /* best-effort */
    }
    this.hud.log(muted ? 'Muted. The dungeon holds its breath.' : 'Sound on. The dungeon exhales.');
  }

  /** Press T: talk to Chad if he's near, else to Vess's echo if in her study. */
  private tryTalk() {
    const chad = this.monsters.find(
      (m) =>
        m.kind === 'chad' &&
        m.alive &&
        Math.abs(m.pos.x - this.px) + Math.abs(m.pos.y - this.py) <= 4
    );
    if (chad) {
      this.chadTarget = chad;
      this.dialogueMode = 'chad';
      this.hud.showDialogue({
        name: 'CHAD',
        subtitle: 'MIDDLE MANAGEMENT',
        portraitUrl: new URL('sprites/chad.png', document.baseURI).toString(),
        greeting: chadGreeting(),
        choices: CHAD_CHOICES,
        onChoice: (id) => this.resolveChadChoice(id as ChadChoiceId),
      });
      this.audio.chadVoice('greet');
      return;
    }
    if (inLair(this.d, this.px, this.py)) {
      this.dialogueMode = 'vess';
      this.hud.showDialogue({
        name: 'VESS HOLLOWAY',
        subtitle: 'CARTOGRAPHER-SCHOLAR · 50 YEARS GONE',
        portraitUrl: new URL('sprites/vess.png', document.baseURI).toString(),
        greeting: vessGreeting(),
        choices: VESS_CHOICES,
        onChoice: (id) => this.resolveVessChoice(id as VessChoiceId),
      });
      this.audio.vessVoice('greet');
      return;
    }
    this.hud.log('No one here wants to talk. (Chad lurks on depth 3+; Vess in her study.)');
  }

  /** One choice per opening — re-talk with T for another round. */
  private resolveChadChoice(id: ChadChoiceId) {
    const chad = this.chadTarget;
    if (!chad || !chad.alive || !this.hud.isDialogueOpen()) return;
    const now = Date.now();
    if (id === 'deal') {
      if (this.gold >= DEAL_PRICE) {
        this.gold -= DEAL_PRICE;
        this.hud.setGold(this.gold);
        chad.pacifiedUntil = now + DEAL_DURATION_MS;
        chad.windup = 0;
        this.hud.showDialogueResponse('CHAD', chadDealAccept());
        this.audio.chadVoice('deal');
        this.hud.log(`Chad pockets ${DEAL_PRICE} gold. No bites for 45 seconds.`);
      } else {
        this.hud.showDialogueResponse('CHAD', chadDealMock());
        this.audio.chadVoice('mock');
        this.hud.log(`Chad wants ${DEAL_PRICE} gold. You have ${this.gold}.`);
      }
    } else if (id === 'taunt') {
      chad.enragedUntil = now + ENRAGE_DURATION_MS;
      this.hud.showDialogueResponse('CHAD', chadTauntBack());
      this.audio.chadVoice('enrage');
      this.hud.log('Chad is ENRAGED — bites faster, but sloppy (+1 damage taken).');
    } else {
      this.hud.showDialogueResponse('CHAD', chadParting());
    }
    this.chadTarget = null;
    this.dialogueMode = null;
  }

  /** Vess's echo answers from the study. One question per opening. */
  private resolveVessChoice(id: VessChoiceId) {
    if (this.dialogueMode !== 'vess' || !this.hud.isDialogueOpen()) return;
    if (id === 'exit') {
      const dx = this.d.exit.x - this.px;
      const dy = this.d.exit.y - this.py;
      // Map north = decreasing y.
      const dir =
        Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'east' : 'west') : dy > 0 ? 'south' : 'north';
      this.hud.showDialogueResponse('VESS HOLLOWAY', VESS_EXIT_LINE(dir));
      this.audio.vessVoice(`exit-${dir}` as VessVoiceKind);
      this.hud.log(`Vess points ${dir} — the way down breathes cold that way.`);
    } else if (id === 'story') {
      this.hud.showDialogueResponse('VESS HOLLOWAY', vessStory());
      this.audio.vessVoice('story');
    } else if (id === 'advice') {
      if (this.hp < this.maxHp / 2) {
        this.hud.showDialogueResponse('VESS HOLLOWAY', VESS_ADVICE_LOWHP);
        this.audio.vessVoice('advice');
      } else {
        // Rotating tips are text-only — the voiced lines stay exact-matched.
        this.hud.showDialogueResponse('VESS HOLLOWAY', vessAdviceTip());
      }
    } else {
      this.hud.showDialogueResponse('VESS HOLLOWAY', vessParting());
      this.audio.vessVoice('parting');
    }
    this.dialogueMode = null;
  }

  private search() {
    if (this.over) return;
    // Out in the Vale, searching gathers sunpetals.
    if (this.inVale) {
      this.searchVale();
      return;
    }
    // Standing on the fissure in the study? Step through — or find it sealed.
    if (this.d.lair && this.px === this.d.lair.cx && this.py === this.d.lair.cy) {
      if (this.valeCompleted || this.d.valeSealed) {
        this.hud.log('The fissure is dark now. The Vale has given all it has.');
      } else {
        this.enterVale();
      }
      return;
    }
    // Vess's study: the shelf gives her journal page, the table a tonic,
    // the cauldron a brew. Search anywhere in the room.
    if (inLair(this.d, this.px, this.py)) {
      this.searchLair();
      return;
    }
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

  /** Searching inside the study: shelf (journal), table (tonic), cauldron (brew). */
  private searchLair() {
    this.audio.search();
    if (!this.d.lairTaken.has('shelf')) {
      this.d.lairTaken.add('shelf');
      const page = journalPage(this.d.level);
      this.journal.push(page);
      this.audio.find();
      this.hud.log('You pull a loose journal from the shelf. Page kept — press J to read.');
    } else if (!this.d.lairTaken.has('table')) {
      this.d.lairTaken.add('table');
      this.hp = Math.min(this.maxHp, this.hp + 6);
      this.hud.setHp(this.hp, this.maxHp);
      this.audio.find();
      this.hud.log("One of Vess's tonics, labeled in her hand: 'for whoever follows.' +6 HP.");
    } else if (!this.d.lairTaken.has('cauldron')) {
      this.d.lairTaken.add('cauldron');
      this.hp = Math.min(this.maxHp, this.hp + 8);
      this.hud.setHp(this.hp, this.maxHp);
      this.audio.find();
      this.hud.log("You ladle up Vess's firebelly brew — smoke and courage. +8 HP.");
    } else if (!this.d.lairTaken.has('clock')) {
      this.d.lairTaken.add('clock');
      this.audio.find();
      this.hud.log(
        "Vess's grandfather clock. The hands walk backwards, patient as grief — fifty years of wrong time, and it still ticks."
      );
    } else {
      this.hud.log('The study keeps its silence. The fire pops, the brew bubbles.');
    }
  }

  /** HUD line for the Vale: drift timer (time runs true here) + petal count. */
  private valeStatus(): string {
    const left = Math.max(0, Math.ceil(this.valeDrift));
    const mm = Math.floor(left / 60);
    const ss = String(left % 60).padStart(2, '0');
    return `☀ TIME RUNS TRUE · ${mm}:${ss} · ❀ ${this.valePetals.size}/3`;
  }

  /** Step through the fissure into the Vale of First Light. The dungeon waits
   *  exactly as you left it — monsters, loot, and all. */
  private enterVale() {
    if (this.inVale || this.valeCompleted) return;
    this.valeSaved = {
      dungeon: this.d,
      px: this.px,
      py: this.py,
      dir: this.dir,
      monsters: this.monsters,
      occupied: this.occupied,
      exitHintTier: this.exitHintTier,
    };
    // The dungeon's monsters stay behind — their sprites leave the scene,
    // the objects (and their state) come back with you.
    for (const m of this.monsters) this.renderer.scene.remove(m.sprite);
    this.audio.stopFire();
    this.audio.stopClock();
    this.audio.stopAmbient();
    this.audio.startBreeze();
    this.audio.startValeBirds();
    this.d = generateVale(13, this.valeSaved.dungeon.level);
    this.inVale = true;
    this.valePetals = new Set();
    this.valeDrift = VALE_DRIFT_SECONDS;
    this.valeDriftShown = -1;
    this.valeExitTier = 0;
    this.px = this.d.start.x;
    this.py = this.d.start.y;
    this.dir = 0; // face north, up the valley toward the ridge
    this.tween = null;
    this.renderer.build(this.d);
    markVisited(this.d, this.px, this.py);
    this.renderer.setView(this.px, this.py, this.dir);
    this.hud.drawMinimap(this.d, this.px, this.py, this.dir, []);
    this.hud.setVale(this.valeStatus());
    this.hud.flash('THE VALE OF FIRST LIGHT', 3000);
    this.hud.log('Warm light. Gold grass. The ticking in your ears turns around — for the first time in fifty years, time runs forward.');
    this.hud.log('Three sunpetals grow here: one by the stream, one in the ruins, one on the high ridge. Gather them before the dream notices you.');
  }

  /** Leave the Vale — through the golden shaft, or waking when the drift ends.
   *  Petals gathered this visit are lost either way unless all three are in. */
  private returnToStudy(woke: boolean) {
    const saved = this.valeSaved;
    if (!saved || !this.inVale) return;
    this.audio.stopValeBirds();
    this.audio.stopBreeze();
    this.audio.startAmbient();
    this.inVale = false;
    this.valeSaved = null;
    this.valePetals = new Set();
    this.valeDrift = 0;
    this.hud.setVale(null);
    this.d = saved.dungeon;
    this.px = saved.px;
    this.py = saved.py;
    this.dir = saved.dir;
    this.monsters = saved.monsters;
    this.occupied = saved.occupied;
    this.exitHintTier = saved.exitHintTier;
    this.tween = null;
    this.renderer.build(this.d);
    for (const m of this.monsters) {
      if (!m.gone) this.renderer.scene.add(m.sprite);
    }
    markVisited(this.d, this.px, this.py);
    this.renderer.setView(this.px, this.py, this.dir);
    this.hud.drawMinimap(this.d, this.px, this.py, this.dir, this.monsters);
    if (woke) {
      this.hud.flash('THE DREAM LETS GO', 3000);
      this.hud.log('The valley forgets you. You wake in the study — the sunpetals gone, ash on your tongue.');
    } else {
      this.hud.log('You step back through the fissure. The dark takes you back, and the fire is still lit.');
    }
  }

  /** Searching in the Vale: pick sunpetals, or read the dream. */
  private searchVale() {
    this.audio.search();
    const spot = (this.d.valeSpots ?? []).find(
      (s) => s.x === this.px && s.y === this.py && !s.taken
    );
    if (spot) {
      spot.taken = true;
      this.valePetals.add(spot.kind);
      this.audio.find();
      this.renderer.takePetal(spot.kind);
      this.hud.setVale(this.valeStatus(), this.valeDrift <= 30);
      this.hud.log(PETAL_LINES[spot.kind]);
      if (this.valePetals.size === 3) this.grantSunpetalReward();
      return;
    }
    const k = cellKey(this.px, this.py);
    if (this.d.searched.has(k)) {
      this.hud.log('You already searched here. The valley hums the same note.');
      return;
    }
    this.d.searched.add(k);
    this.hud.log(VALE_SEARCH_LINES[(Math.random() * VALE_SEARCH_LINES.length) | 0]);
  }

  /** All three sunpetals: a tonic stronger than anything Vess left, a page
   *  for the journal, and the fissure seals behind you. */
  private grantSunpetalReward() {
    this.valeCompleted = true;
    this.d.valeSealed = true;
    // The seal belongs to the dungeon you came from, not the Vale itself —
    // otherwise the fissure would still glow when you step back through.
    if (this.valeSaved) this.valeSaved.dungeon.valeSealed = true;
    this.hp = Math.min(this.maxHp, this.hp + 12);
    this.hud.setHp(this.hp, this.maxHp);
    this.journal.push(VALE_PAGE);
    this.audio.find();
    this.hud.flash('SUNPETAL TONIC', 3000);
    this.hud.log('Three petals, crushed together — golden light, warm as noon. Sunpetal tonic: +12 HP. Page kept — press J to read.');
    this.hud.log('The fissure dims behind you. The Vale has given all it has.');
  }

  private checkDeath() {
    if (this.hp <= 0 && !this.over) {
      this.over = true;
      this.audio.death();
      this.audio.stopFire();
      this.audio.stopClock();
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
    // Dream-drift: the Vale forgets you a little at a time. Pauses while
    // the journal or a dialogue is open (update() isn't called then).
    if (this.inVale && !this.over) {
      this.valeDrift -= dt;
      const whole = Math.max(0, Math.ceil(this.valeDrift));
      if (whole !== this.valeDriftShown) {
        this.valeDriftShown = whole;
        this.hud.setVale(this.valeStatus(), this.valeDrift <= 30);
      }
      if (this.valeDrift <= 0) {
        this.returnToStudy(true);
        return;
      }
    }
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

    // Per-frame monster animation: idle bob, step hops, wind-up lunges,
    // death sink + fade. Single writer of sprite position/scale.
    this.animTime += dt;
    animateMonsters(
      this.monsters,
      dt,
      this.animTime,
      { x: this.px, y: this.py },
      this.renderer.scene
    );
    if (this.monsters.some((m) => m.gone)) {
      this.monsters = this.monsters.filter((m) => !m.gone);
    }

    // Monster ticks on a timer. Grace period: the labyrinth hasn't noticed you yet
    // — but the dead were already awake. Wraiths ignore the grace period.
    this.tickTimer += dt;
    if (this.tickTimer > 0.55) {
      this.tickTimer = 0;
      // Fireplace crackle when near the study. The Vale has no study.
      if (this.d.lair) {
        const lairDist =
          Math.abs(this.px - this.d.lair.cx) + Math.abs(this.py - this.d.lair.cy);
        if (lairDist <= 8) {
          this.audio.startFire();
          this.audio.startClock();
        } else {
          this.audio.stopFire();
          this.audio.stopClock();
        }
      }
      const graced = performance.now() < this.graceUntil;
      for (const m of this.monsters) {
        if (graced && m.kind !== 'wraith') continue;
        const events = monsterTick(m, this.d, { x: this.px, y: this.py }, this.occupied);
        for (const e of events) {
          if (e === 'windup') {
            // Telegraph: the lunge swells in the per-frame animator + warning growl. Dodge by moving.
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
