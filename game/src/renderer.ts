// Three.js first-person renderer for the grid dungeon.

import * as THREE from 'three';
import { Dungeon, WALL, EXIT } from './dungeon';
import { makeTextures, TextureSet, registerTexMat, resetTexRegistry } from './textures';

export const CELL = 4; // world units per grid cell
const WALL_H = 4;
// The Vale's sky sits higher than its ruin walls (WALL_H) so the dragon
// can cruise ABOVE the wall tops and stay visible: at y=4 the dragon's
// body was wall-top height and the walls hid it for minutes at a time.
// The gap between the wall tops (4) and this ceiling reads as open sky —
// the scene background behind it is the same blue.
const VALE_CEIL_H = 7;

/** One drifting smoke puff — a sprite that rises, grows, and fades. */
interface SmokePuff {
  sprite: THREE.Sprite;
  life: number;
  maxLife: number;
  vy: number;
  baseX: number;
  baseY: number;
  baseZ: number;
  grow: number;
  maxOp: number;
  drift: number;
}

export class DungeonRenderer {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  torch: THREE.PointLight;
  private wallMeshes: THREE.Mesh[] = [];
  private exitMarker!: THREE.Mesh;
  private textures: TextureSet;
  private flicker = 0;
  private shakeAmt = 0;
  private lastShakeX = 0;
  private lastShakeY = 0;
  private lair: {
    group: THREE.Group;
    fireLight: THREE.PointLight;
    flames: THREE.Mesh[];
    embers: THREE.Points;
    emberVel: Float32Array;
    bubbles: THREE.Points;
    bubVel: Float32Array;
    brewMat: THREE.MeshStandardMaterial;
    coalLight: THREE.PointLight;
    smoke: SmokePuff[];
    clockMinute: THREE.Group;
    clockHour: THREE.Group;
    clockPendulum: THREE.Group;
    fissureMotes: THREE.Points | null;
    fissureVel: Float32Array;
    phase: number;
  } | null = null;
  /** The Vale of First Light — bright dream-valley built per entry, torn down on exit. */
  private vale: {
    group: THREE.Group;
    petals: Array<{ kind: string; group: THREE.Group; light: THREE.PointLight; beam: THREE.Mesh }>;
    streamMat: THREE.MeshBasicMaterial;
    phase: number;
    /** The dragon that never lands — slow wide circle over the valley. */
    dragon: {
      group: THREE.Group;
      bank: THREE.Group;
      wingL: THREE.Group;
      wingR: THREE.Group;
      neck: THREE.Group;
      tail: THREE.Group;
      shadow: THREE.Mesh;
      angle: number;
      cx: number;
      cz: number;
      radius: number;
    };
    /** The sun — a camera-facing sprite riding the northern sky (see
     *  buildVale). It is positioned from the camera every frame, never
     *  painted on the ceiling. */
    sun: THREE.Sprite;
  } | null = null;
  private theme: 'dungeon' | 'vale' = 'dungeon';
  private smokeTex: THREE.CanvasTexture | null = null;
  private clockFaceTex: THREE.CanvasTexture | null = null;
  private petalTex: THREE.CanvasTexture | null = null;
  private valeWallTex: THREE.CanvasTexture | null = null;
  private valeFloorTex: THREE.CanvasTexture | null = null;
  private valeSkyTex: THREE.CanvasTexture | null = null;

  /** Pale limestone blocks — the Vale's white stone ruins. Cached, shared. */
  private valeWallTexture(): THREE.CanvasTexture {
    if (this.valeWallTex) return this.valeWallTex;
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d')!;
    g.fillStyle = '#e8e2d0';
    g.fillRect(0, 0, 256, 256);
    // block courses
    g.strokeStyle = 'rgba(120,110,90,0.5)';
    g.lineWidth = 3;
    const rows = 4;
    for (let r = 0; r <= rows; r++) {
      const y = (r * 256) / rows;
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(256, y);
      g.stroke();
      const offset = r % 2 === 0 ? 0 : 64;
      for (let k = 0; k < 2; k++) {
        const x = offset + k * 128;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x, y + 256 / rows);
        g.stroke();
      }
    }
    // faint grey veins + warm sun-bleach
    for (let i = 0; i < 24; i++) {
      g.strokeStyle = 'rgba(140,130,110,0.18)';
      g.lineWidth = 1;
      const y = Math.random() * 256;
      g.beginPath();
      g.moveTo(0, y);
      g.bezierCurveTo(85, y + 6, 170, y - 6, 256, y);
      g.stroke();
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    this.valeWallTex = t;
    return t;
  }

  /** Gold grass — golden field with blade strokes and tiny wildflowers. */
  private valeFloorTexture(): THREE.CanvasTexture {
    if (this.valeFloorTex) return this.valeFloorTex;
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d')!;
    g.fillStyle = '#c9a227';
    g.fillRect(0, 0, 256, 256);
    // grass blades — darker and lighter gold strokes
    for (let i = 0; i < 500; i++) {
      const x = Math.random() * 256;
      const y = Math.random() * 256;
      g.strokeStyle = Math.random() < 0.5 ? 'rgba(140,105,20,0.5)' : 'rgba(230,200,90,0.5)';
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + (Math.random() - 0.5) * 4, y - 4 - Math.random() * 6);
      g.stroke();
    }
    // wildflowers — white and pale yellow dots
    for (let i = 0; i < 26; i++) {
      g.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,240,0.9)' : 'rgba(255,230,140,0.9)';
      g.beginPath();
      g.arc(Math.random() * 256, Math.random() * 256, 1.6 + Math.random() * 1.6, 0, 7);
      g.fill();
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    this.valeFloorTex = t;
    return t;
  }

  /** Sky — saturated bright blue, soft clouds. NO sun painted here: the
   *  sun is a camera-facing sprite (see buildVale). Paint on the horizontal
   *  ceiling can never look round — the fixed-pitch camera always sees the
   *  ceiling at a grazing angle, so a painted circle foreshortens into a
   *  huge flat 4:1 ellipse with a halo that bleaches the sky. The ceiling
   *  is rendered UNLIT (MeshBasicMaterial) so the warm sun light can never
   *  tint it yellow-green — what you see is the blue, full stop. */
  private valeSkyTexture(): THREE.CanvasTexture {
    if (this.valeSkyTex) return this.valeSkyTex;
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d')!;
    const grad = g.createLinearGradient(0, 0, 0, 256);
    // Deep blue to the NORTH (canvas bottom = v=0 = world -Z, where the
    // sun sits and the player spawns facing): the first frame at spawn is
    // already vivid blue. The pale end faces south, behind the player.
    // (The old orientation put the pale end north — the spawn view read as
    // washed-out sage-grey until the player turned around. There is no
    // fade-in in the code; that pale first impression WAS the gradient.)
    grad.addColorStop(0, '#7cc4f5');
    grad.addColorStop(0.55, '#3f9ae8');
    grad.addColorStop(1, '#1f6fd0');
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 256);
    // soft clouds
    for (let i = 0; i < 5; i++) {
      const x = Math.random() * 256;
      const y = 150 + Math.random() * 90;
      const cg = g.createRadialGradient(x, y, 2, x, y, 26);
      cg.addColorStop(0, 'rgba(255,255,255,0.8)');
      cg.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = cg;
      g.beginPath();
      g.arc(x, y, 26, 0, 7);
      g.fill();
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    this.valeSkyTex = t;
    return t;
  }

  /** The sun as a sprite texture — a small round saturated gold disc with
   *  a tight halo. The sprite itself always faces the camera, so the disc
   *  can never foreshorten into an ellipse, and the halo is gold with a
   *  fast falloff (never white) so it cannot bleach the nearby sky. */
  private makeSunTexture(): THREE.CanvasTexture {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d')!;
    const halo = g.createRadialGradient(64, 64, 28, 64, 64, 62);
    halo.addColorStop(0, 'rgba(255,205,70,0.55)');
    halo.addColorStop(0.5, 'rgba(255,200,60,0.22)');
    halo.addColorStop(1, 'rgba(255,200,60,0)');
    g.fillStyle = halo;
    g.fillRect(0, 0, 128, 128);
    g.fillStyle = '#ffd23d';
    g.beginPath();
    g.arc(64, 64, 30, 0, Math.PI * 2);
    g.fill();
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  /** Gold petal — deep saturated gold, bright center fading to transparent. */
  private makePetalTexture(): THREE.CanvasTexture {
    const c = document.createElement('canvas');
    c.width = 32;
    c.height = 64;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(16, 40, 2, 16, 40, 26);
    grad.addColorStop(0, 'rgba(255,215,70,1)');
    grad.addColorStop(0.6, 'rgba(255,180,30,0.95)');
    grad.addColorStop(1, 'rgba(255,160,20,0)');
    g.fillStyle = grad;
    g.beginPath();
    g.ellipse(16, 32, 12, 28, 0, 0, Math.PI * 2);
    g.fill();
    return new THREE.CanvasTexture(c);
  }

  /** Screen shake — call on hits/bites. Decays automatically, leaves no drift. */
  addShake(n: number) {
    this.shakeAmt = Math.min(0.5, this.shakeAmt + n);
  }

  constructor(container: HTMLElement) {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000000);
    this.scene.fog = new THREE.FogExp2(0x000000, 0.055);

    this.camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.1, 100);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    container.appendChild(this.renderer.domElement);

    this.textures = makeTextures();

    // Near-black ambient so unlit areas aren't pure void.
    this.scene.add(new THREE.AmbientLight(0x2a2018, 0.9));

    // The player's torch.
    this.torch = new THREE.PointLight(0xff9a3c, 30, 22, 1.8);
    this.scene.add(this.torch);

    addEventListener('resize', () => {
      this.camera.aspect = innerWidth / innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(innerWidth, innerHeight);
    });
  }

  /** (Re)build static geometry for a dungeon. */
  build(d: Dungeon) {
    for (const m of this.wallMeshes) {
      this.scene.remove(m);
      // Lights have no geometry — guard the dispose.
      const g = (m as THREE.Mesh).geometry;
      if (g) g.dispose();
    }
    this.wallMeshes = [];
    resetTexRegistry();
    this.theme = d.theme;
    this.teardownVale();

    // The Vale is bright: saturated blue sky, blue fog, warm sun. The dungeon stays black.
    if (d.theme === 'vale') {
      this.scene.background = new THREE.Color(0x3f8fd2);
      this.scene.fog = new THREE.FogExp2(0x7fb8e8, 0.012);
    } else {
      this.scene.background = new THREE.Color(0x000000);
      this.scene.fog = new THREE.FogExp2(0x000000, 0.055);
    }

    const wallGeo = new THREE.BoxGeometry(CELL, WALL_H, CELL);
    const wallMat = new THREE.MeshStandardMaterial({
      map: d.theme === 'vale' ? this.valeWallTexture() : this.textures.wall,
      roughness: 0.95,
      metalness: 0,
    });
    // Vale materials are NEVER registered in the texture registry: the AI
    // dungeon PNGs (wall/floor/ceiling.png) preload async and upgradeTex
    // swaps any registered material's map — that race turned the Vale's gold
    // grass into cobblestone and its limestone into dark stone on first entry.
    if (d.theme !== 'vale') registerTexMat('wall', wallMat);

    for (let y = 0; y < d.size; y++) {
      for (let x = 0; x < d.size; x++) {
        if (d.grid[y][x] === WALL) {
          const m = new THREE.Mesh(wallGeo, wallMat);
          m.position.set(x * CELL, WALL_H / 2, y * CELL);
          this.scene.add(m);
          this.wallMeshes.push(m);
        }
      }
    }

    // Floor + ceiling as single planes.
    const S = d.size * CELL;
    const floorMat = new THREE.MeshStandardMaterial({
      map: d.theme === 'vale' ? this.valeFloorTexture() : this.textures.floor,
      roughness: 1,
    });
    if (d.theme !== 'vale') registerTexMat('floor', floorMat);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(S, S), floorMat);
    floor.material.map!.repeat.set(d.size, d.size);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set((S - CELL) / 2, 0, (S - CELL) / 2);
    floor.name = 'floor';
    this.scene.add(floor);
    this.wallMeshes.push(floor as unknown as THREE.Mesh);

    // The Vale sky is UNLIT (MeshBasicMaterial): no light can tint it, so it
    // reads blue from every angle. The dungeon ceiling stays lit stone.
    const ceilMap = d.theme === 'vale' ? this.valeSkyTexture() : this.textures.ceil;
    if (d.theme === 'vale') ceilMap.repeat.set(1, 1); // one sky, not thirteen — the sun is a sprite, not paint
    else ceilMap.repeat.set(d.size, d.size);
    const ceilMat =
      d.theme === 'vale'
        ? new THREE.MeshBasicMaterial({ map: ceilMap })
        : new THREE.MeshStandardMaterial({ map: ceilMap, roughness: 1 });
    if (d.theme !== 'vale') registerTexMat('ceil', ceilMat as THREE.MeshStandardMaterial);
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(S, S), ceilMat);
    ceil.rotation.x = Math.PI / 2;
    // The Vale ceiling rides high (VALE_CEIL_H) so the dragon can cruise
    // above the ruin walls; the dungeon ceiling stays at wall height.
    ceil.position.set((S - CELL) / 2, d.theme === 'vale' ? VALE_CEIL_H : WALL_H, (S - CELL) / 2);
    ceil.name = 'ceil';
    this.scene.add(ceil);
    this.wallMeshes.push(ceil as unknown as THREE.Mesh);

    if (d.theme === 'vale') {
      // Warm sun overhead — the dungeon's torch is a candle next to it.
      const sun = new THREE.DirectionalLight(0xffe9b0, 2.6);
      sun.position.set(S / 2, 20, S / 2 - 10);
      this.scene.add(sun);
      this.wallMeshes.push(sun as unknown as THREE.Mesh);
      const skyFill = new THREE.AmbientLight(0xfff2cc, 1.8);
      this.scene.add(skyFill);
      this.wallMeshes.push(skyFill as unknown as THREE.Mesh);
      this.buildVale(d);
    } else {
      // Exit stairs marker — a shaft of cold light.
      const exitGeo = new THREE.CylinderGeometry(0.7, 0.7, WALL_H, 12, 1, true);
      const exitMat = new THREE.MeshBasicMaterial({
        color: 0x6ab8ff,
        transparent: true,
        opacity: 0.55,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      this.exitMarker = new THREE.Mesh(exitGeo, exitMat);
      this.exitMarker.position.set(d.exit.x * CELL, WALL_H / 2, d.exit.y * CELL);
      this.scene.add(this.exitMarker);
      this.wallMeshes.push(this.exitMarker);

      // Cold blue glow so the exit reads through fog at distance.
      const exitLight = new THREE.PointLight(0x6ab8ff, 28, 20, 1.8);
      exitLight.position.set(d.exit.x * CELL, 2.5, d.exit.y * CELL);
      this.scene.add(exitLight);
      this.wallMeshes.push(exitLight as unknown as THREE.Mesh);
    }

    if (d.lair) this.buildLair(d);
    else this.teardownLair();
  }

  /** The dragon that never lands — dark silhouette, wings, long tail, horns,
   *  ember eyes. Built facing +X; the group yaws to the flight tangent and
   *  the bank group rolls it into the turn. Wings pivot at the shoulders so
   *  they can flap; neck and tail sway on their own phase. */
  private makeDragon(): {
    group: THREE.Group;
    bank: THREE.Group;
    wingL: THREE.Group;
    wingR: THREE.Group;
    neck: THREE.Group;
    tail: THREE.Group;
  } {
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x201c28, roughness: 0.85, metalness: 0.15 });
    const wingMat = new THREE.MeshStandardMaterial({ color: 0x3a2c4e, roughness: 0.9, side: THREE.DoubleSide });
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffc23d });

    const group = new THREE.Group();
    const bank = new THREE.Group();
    group.add(bank);

    // Body — long ellipsoid, nose +X.
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 12), bodyMat);
    body.scale.set(2.2, 0.85, 0.85);
    bank.add(body);
    // Spine spikes.
    for (let i = 0; i < 4; i++) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.32, 6), bodyMat);
      spike.position.set(0.7 - i * 0.45, 0.55, 0);
      spike.rotation.z = -0.25;
      bank.add(spike);
    }
    // Neck + head, reaching up-forward — big enough to read at distance:
    // a thick neck, a broad skull, long swept-back horns, ember eyes.
    const neck = new THREE.Group();
    neck.position.set(1.0, 0.1, 0);
    neck.rotation.z = 0.7;
    const neckSeg = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.22, 0.9, 8), bodyMat);
    neckSeg.position.y = 0.42;
    neck.add(neckSeg);
    const head = new THREE.Group();
    head.position.set(0, 0.9, 0);
    const skull = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.42, 0.45), bodyMat);
    head.add(skull);
    const snout = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.22, 0.32), bodyMat);
    snout.position.set(0.6, -0.06, 0);
    head.add(snout);
    for (const s of [-1, 1]) {
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.6, 6), bodyMat);
      horn.position.set(-0.32, 0.26, s * 0.16);
      horn.rotation.z = 1.1; // swept back
      head.add(horn);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), eyeMat);
      eye.position.set(0.26, 0.1, s * 0.24);
      head.add(eye);
    }
    neck.add(head);
    bank.add(neck);
    // Tail — a short stub now, thick enough to read as a tail. The old
    // 2-segment + spade tail read as a long tapered spike from above even
    // though it looked short from the side; total length is now ~0.75
    // against a 2.4 body.
    const tail = new THREE.Group();
    tail.position.set(-1.05, 0, 0);
    let tx = 0;
    const segs: Array<[number, number, number]> = [
      [0.2, 0.16, 0.45],
    ];
    for (const [r1, r2, len] of segs) {
      const seg = new THREE.Mesh(new THREE.CylinderGeometry(r2, r1, len, 8), bodyMat);
      seg.rotation.z = Math.PI / 2; // lie along X
      seg.position.set(tx - len / 2, -0.04 * (tx + 1), 0);
      tail.add(seg);
      tx -= len;
    }
    const spade = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.3, 4), bodyMat);
    spade.rotation.z = Math.PI / 2;
    spade.scale.set(1, 1, 0.4);
    spade.position.set(tx - 0.14, -0.14, 0);
    tail.add(spade);
    bank.add(tail);
    // Wings — bat-wing membranes on shoulder pivots. The wingspan (~9
    // units) now dominates the silhouette; the old 2.5-unit wings read as
    // sticks because a flat horizontal membrane is edge-on from below.
    // Shape is drawn in XY (x = chord, y = span); the mesh rotation lays
    // it flat, span outward.
    const wingShape = new THREE.Shape();
    wingShape.moveTo(0.4, 0);
    wingShape.lineTo(1.05, 4.2); // wingtip
    wingShape.quadraticCurveTo(0.5, 3.7, 0.0, 3.1); // scalloped trailing edge
    wingShape.quadraticCurveTo(-0.4, 2.5, -0.85, 1.7);
    wingShape.quadraticCurveTo(-0.55, 0.8, -0.2, 0);
    wingShape.closePath();
    const wingGeo = new THREE.ShapeGeometry(wingShape, 8);
    const mkWing = (side: 1 | -1): THREE.Group => {
      const pivot = new THREE.Group();
      pivot.position.set(0.25, 0.35, side * 0.35);
      const membrane = new THREE.Mesh(wingGeo, wingMat);
      membrane.rotation.x = side > 0 ? Math.PI / 2 : -Math.PI / 2;
      pivot.add(membrane);
      // Leading-edge spar — the bone line that reads at distance.
      const spar = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 4.3, 6), bodyMat);
      const sparDir = new THREE.Vector3(0.65, 0, side * 4.2).normalize();
      spar.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), sparDir);
      spar.position.set(0.72, 0, side * 2.1);
      pivot.add(spar);
      return pivot;
    };
    const wingR = mkWing(1);
    const wingL = mkWing(-1);
    bank.add(wingR, wingL);
    return { group, bank, wingL, wingR, neck, tail };
  }

  /** Soft dark ellipse — the dragon's shadow sliding over the gold grass.
   *  Square canvas so the radial gradient is fully inside it (the old
   *  128x64 canvas clipped the circle top and bottom, leaving hard edges). */
  private makeDragonShadowTexture(): THREE.CanvasTexture {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 128;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(64, 64, 4, 64, 64, 60);
    grad.addColorStop(0, 'rgba(0,0,0,0.65)');
    grad.addColorStop(0.6, 'rgba(0,0,0,0.35)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  /** The Vale of First Light: stream, sunpetals, fissure arch, golden way back. */
  private buildVale(d: Dungeon) {
    const group = new THREE.Group();
    const S = d.size * CELL;
    const petals: Array<{ kind: string; group: THREE.Group; light: THREE.PointLight; beam: THREE.Mesh }> = [];

    // The stream — a translucent blue band across the middle. Walkable water:
    // the god's dream doesn't bother with wet feet. Near-opaque: at 0.6 the
    // gold grass showed through and the water read murky grey-green.
    const streamMat = new THREE.MeshBasicMaterial({
      color: 0x3f8fd2,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    });
    const stream = new THREE.Mesh(
      new THREE.PlaneGeometry(S, CELL),
      streamMat
    );
    stream.rotation.x = -Math.PI / 2;
    stream.position.set((S - CELL) / 2, 0.03, (d.streamRow ?? 6) * CELL);
    group.add(stream);

    // Sunpetals — big golden flowers, one per spot, glowing until picked.
    // Each stands in a tall golden beam so you can spot it across the valley.
    if (!this.petalTex) this.petalTex = this.makePetalTexture();
    for (const spot of d.valeSpots ?? []) {
      if (spot.taken) continue;
      const pg = new THREE.Group();
      const cx = spot.x * CELL;
      const cz = spot.y * CELL;
      pg.position.set(cx, 0, cz);
      const petalMat = new THREE.MeshBasicMaterial({
        map: this.petalTex,
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      for (let i = 0; i < 7; i++) {
        const petal = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.95), petalMat);
        const a = (i / 7) * Math.PI * 2;
        petal.position.set(Math.cos(a) * 0.3, 1.05, Math.sin(a) * 0.3);
        petal.rotation.set(-0.5, -a + Math.PI / 2, 0);
        pg.add(petal);
      }
      const heart = new THREE.Mesh(
        new THREE.SphereGeometry(0.18, 12, 12),
        new THREE.MeshBasicMaterial({ color: 0xffc93a })
      );
      heart.position.y = 1.05;
      pg.add(heart);
      const stem = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.06, 1.0, 6),
        new THREE.MeshStandardMaterial({ color: 0x3a7a2a, roughness: 1 })
      );
      stem.position.y = 0.5;
      pg.add(stem);
      const light = new THREE.PointLight(0xffd76a, 14, 13, 1.8);
      light.position.set(cx, 1.6, cz);
      group.add(light);
      // Golden beam — a shaft of light marking the flower from anywhere.
      const beam = new THREE.Mesh(
        new THREE.CylinderGeometry(0.28, 0.45, WALL_H, 10, 1, true),
        new THREE.MeshBasicMaterial({
          color: 0xffd76a,
          transparent: true,
          opacity: 0.22,
          side: THREE.DoubleSide,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        })
      );
      beam.position.set(cx, WALL_H / 2, cz);
      group.add(beam);
      group.add(pg);
      petals.push({ kind: spot.kind, group: pg, light, beam });
    }

    // The fissure back — a shaft of warm gold where the exit would be,
    // ringed by a white stone arch. Step into the light to go home.
    const exitGeo = new THREE.CylinderGeometry(0.9, 0.9, WALL_H, 12, 1, true);
    const exitMat = new THREE.MeshBasicMaterial({
      color: 0xffd76a,
      transparent: true,
      opacity: 0.5,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.exitMarker = new THREE.Mesh(exitGeo, exitMat);
    this.exitMarker.position.set(d.exit.x * CELL, WALL_H / 2, d.exit.y * CELL);
    group.add(this.exitMarker);
    const exitLight = new THREE.PointLight(0xffc860, 24, 18, 1.8);
    exitLight.position.set(d.exit.x * CELL, 2.5, d.exit.y * CELL);
    group.add(exitLight);
    const archMat = new THREE.MeshStandardMaterial({
      map: this.valeWallTexture(),
      roughness: 0.95,
    });
    const arch = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.32, 10, 20, Math.PI), archMat);
    arch.position.set(d.exit.x * CELL, 1.5, d.exit.y * CELL - 0.5);
    group.add(arch);

    // The sun — a camera-facing sprite riding the northern sky at a fixed
    // offset from the camera (a far sun never moves), so it is always a
    // round disc, always the same size, and never hidden behind ruin walls.
    // depthTest false: the sun is sky — it draws over the ceiling plane
    // (which would otherwise occlude anything above y=4) and always sits
    // above the wall tops on screen. fog false: fog would pale it.
    const sun = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.makeSunTexture(),
        transparent: true,
        depthTest: false,
        depthWrite: false,
        fog: false,
      })
    );
    sun.scale.set(6, 6, 1);
    sun.renderOrder = 10;
    group.add(sun);

    // The dragon that never lands — a dark silhouette circling high over
    // the valley, banking on slow wings. It never comes down: in the dream
    // the sky has no ground for it. Its shadow slides over the gold grass
    // below, so you feel how high it is.
    const dragon = this.makeDragon();
    group.add(dragon.group);
    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(10, 6.5),
      new THREE.MeshBasicMaterial({
        map: this.makeDragonShadowTexture(),
        transparent: true,
        opacity: 0.6,
        depthWrite: false,
      })
    );
    shadow.rotation.set(-Math.PI / 2, 0, 0);
    shadow.position.y = 0.06; // above the floor and the stream
    shadow.renderOrder = 2;
    group.add(shadow);

    this.scene.add(group);
    this.vale = {
      group,
      petals,
      streamMat,
      phase: Math.random() * 10,
      sun,
      dragon: {
        ...dragon,
        shadow,
        angle: Math.random() * Math.PI * 2,
        cx: ((d.size - 1) / 2) * CELL,
        cz: ((d.size - 1) / 2) * CELL,
        radius: 12, // tighter circle — crosses the open central grass, stays clear of the ruin cluster
      },
    };
  }

  /** Tear down the previous Vale build (entry/exit, petals, stream). */
  private teardownVale() {
    if (!this.vale) return;
    const sharedMaps = new Set(Object.values(this.textures));
    if (this.petalTex) sharedMaps.add(this.petalTex);
    this.scene.remove(this.vale.group);
    this.vale.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const mat = (mesh as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      const mats = Array.isArray(mat) ? mat : mat ? [mat] : [];
      for (const m of mats) {
        const withMap = m as THREE.MeshStandardMaterial;
        if (withMap.map && !sharedMaps.has(withMap.map)) withMap.map.dispose();
        m.dispose();
      }
    });
    this.vale = null;
  }

  /** Remove one sunpetal's flower + glow + beam when it is picked. */
  takePetal(kind: string) {
    if (!this.vale) return;
    const p = this.vale.petals.find((e) => e.kind === kind);
    if (!p) return;
    this.vale.group.remove(p.group);
    this.vale.group.remove(p.light);
    this.vale.group.remove(p.beam);
    p.beam.geometry.dispose();
    (p.beam.material as THREE.Material).dispose();
    p.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
    });
    this.vale.petals = this.vale.petals.filter((e) => e !== p);
  }

  /** Tear down the previous level's study. Shared texture-set maps are NOT
   *  disposed (they belong to textures.ts); per-level canvas textures are. */
  private teardownLair() {
    if (!this.lair) return;
    const sharedMaps = new Set(Object.values(this.textures));
    if (this.smokeTex) sharedMaps.add(this.smokeTex);
    if (this.clockFaceTex) sharedMaps.add(this.clockFaceTex);
    this.scene.remove(this.lair.group);
    this.lair.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const mat = (mesh as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      const mats = Array.isArray(mat) ? mat : mat ? [mat] : [];
      for (const m of mats) {
        const withMap = m as THREE.MeshStandardMaterial;
        if (withMap.map && !sharedMaps.has(withMap.map)) withMap.map.dispose();
        m.dispose();
      }
    });
    this.lair = null;
  }

  /** Vess's study: a real chamber — fireplace, bookshelf, alchemy table,
   *  cauldron, and stone arches over every doorway. */
  private buildLair(d: Dungeon) {
    this.teardownLair();
    if (!d.lair) return; // the Vale has no study

    const group = new THREE.Group();
    const L = d.lair;
    const VEC = [
      { x: 0, z: -1 },
      { x: 1, z: 0 },
      { x: 0, z: 1 },
      { x: -1, z: 0 },
    ];
    const dirVec = VEC[L.fireDir];
    const shelfDir = (L.fireDir + 1) % 4; // 90° clockwise from the fireplace
    const svec = VEC[shelfDir];
    const yawFor = (vx: number, vz: number) => Math.atan2(vx, vz);

    // Shared-look materials: AI wood/iron/stone, registered so the PNG
    // upgrades hit live props.
    const woodMat = new THREE.MeshStandardMaterial({ map: this.textures.wood, roughness: 0.85 });
    registerTexMat('wood', woodMat);
    const ironMat = new THREE.MeshStandardMaterial({
      map: this.textures.iron,
      roughness: 0.55,
      metalness: 0.65,
      side: THREE.DoubleSide,
    });
    registerTexMat('iron', ironMat);
    const stoneMat = new THREE.MeshStandardMaterial({ map: this.textures.wall, roughness: 0.95 });
    registerTexMat('wall', stoneMat);

    // -- Fireplace: hearth cell, built into the fireDir wall --
    const hx = L.hearth.x * CELL + dirVec.x * 1.2;
    const hz = L.hearth.y * CELL + dirVec.z * 1.2;
    const hearth = new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.15, 0.9), stoneMat);
    hearth.position.set(hx, 0.575, hz);
    hearth.rotation.y = yawFor(-dirVec.x, -dirVec.z);
    group.add(hearth);
    const mantel = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.16, 1.1), woodMat);
    mantel.position.set(hx, 1.23, hz);
    mantel.rotation.y = hearth.rotation.y;
    group.add(mantel);

    const flames: THREE.Mesh[] = [];
    const flameTex = this.makeFlameTexture();
    const firePos = { x: hx - dirVec.x * 0.62, z: hz - dirVec.z * 0.62 };
    for (let i = 0; i < 3; i++) {
      const flame = new THREE.Mesh(
        new THREE.PlaneGeometry(0.7, 1.1),
        new THREE.MeshBasicMaterial({
          map: flameTex,
          transparent: true,
          side: THREE.DoubleSide,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        })
      );
      flame.position.set(firePos.x, 0.85, firePos.z);
      flame.rotation.y = (i * Math.PI) / 3;
      group.add(flame);
      flames.push(flame);
    }
    const fireLight = new THREE.PointLight(0xff8033, 26, 16, 1.8);
    fireLight.position.set(firePos.x, 1.7, firePos.z);
    group.add(fireLight);

    const EMBERS = 30;
    const epos = new Float32Array(EMBERS * 3);
    const evel = new Float32Array(EMBERS);
    for (let i = 0; i < EMBERS; i++) {
      epos[i * 3] = firePos.x + (Math.random() - 0.5) * 0.8;
      epos[i * 3 + 1] = 0.6 + Math.random() * 1.6;
      epos[i * 3 + 2] = firePos.z + (Math.random() - 0.5) * 0.8;
      evel[i] = 0.25 + Math.random() * 0.5;
    }
    const emberGeo = new THREE.BufferGeometry();
    emberGeo.setAttribute('position', new THREE.BufferAttribute(epos, 3));
    const embers = new THREE.Points(
      emberGeo,
      new THREE.PointsMaterial({
        color: 0xffa040,
        size: 0.07,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    group.add(embers);

    // -- Bookshelf: shelf cell, against the shelfDir wall. Book spines face
    // the room (local +Z after yaw); other faces are wood.
    const shx = L.shelf.x * CELL + svec.x * 1.2;
    const shz = L.shelf.y * CELL + svec.z * 1.2;
    const bookTex = this.makeBookshelfTexture();
    const shelfMats = [
      woodMat,
      woodMat,
      woodMat,
      woodMat,
      new THREE.MeshStandardMaterial({ map: bookTex, roughness: 0.9 }),
      woodMat,
    ];
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.6, 0.6), shelfMats);
    shelf.position.set(shx, 1.3, shz);
    shelf.rotation.y = yawFor(-svec.x, -svec.z);
    group.add(shelf);

    // -- Alchemy table: table cell, centered. Wood top/legs, potion bottles.
    const tx = L.table.x * CELL;
    const tz = L.table.y * CELL;
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.12, 1.1), woodMat);
    top.position.set(tx, 0.85, tz);
    group.add(top);
    for (const [lx, lz] of [
      [-0.85, -0.45],
      [0.85, -0.45],
      [-0.85, 0.45],
      [0.85, 0.45],
    ]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.85, 0.12), woodMat);
      leg.position.set(tx + lx, 0.42, tz + lz);
      group.add(leg);
    }
    const potionColors = [0x33ff77, 0x44aaff, 0xff4455, 0xbb66ff];
    potionColors.forEach((color, i) => {
      const px = tx - 0.6 + i * 0.4;
      const bottle = new THREE.Mesh(
        new THREE.CylinderGeometry(0.09, 0.11, 0.32, 10),
        new THREE.MeshStandardMaterial({
          color,
          emissive: color,
          emissiveIntensity: 0.9,
          roughness: 0.3,
        })
      );
      bottle.position.set(px, 1.07, tz + (i % 2 === 0 ? 0.18 : -0.18));
      group.add(bottle);
      const cork = new THREE.Mesh(
        new THREE.SphereGeometry(0.05, 8, 8),
        new THREE.MeshStandardMaterial({ color: 0x8a6a3a, roughness: 1 })
      );
      cork.position.set(px, 1.26, bottle.position.z);
      group.add(cork);
    });

    // -- Cauldron: tucked into the room-corner of its cell so the walkable
    // lane past it stays clear. Iron pot over coals, green brew, bubbles.
    const ccx = L.cauldron.x * CELL + (svec.x + dirVec.x) * 1.2;
    const ccz = L.cauldron.y * CELL + (svec.z + dirVec.z) * 1.2;
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.55, 8), ironMat);
      leg.position.set(ccx + Math.cos(a) * 0.34, 0.28, ccz + Math.sin(a) * 0.34);
      group.add(leg);
    }
    const coalMat = new THREE.MeshStandardMaterial({
      color: 0x1a0f08,
      emissive: 0xff5a1a,
      emissiveIntensity: 1.6,
      roughness: 1,
    });
    for (let i = 0; i < 6; i++) {
      const coal = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.16), coalMat);
      coal.position.set(ccx + (Math.random() - 0.5) * 0.5, 0.08, ccz + (Math.random() - 0.5) * 0.5);
      coal.rotation.y = Math.random() * Math.PI;
      group.add(coal);
    }
    const pot = new THREE.Mesh(
      new THREE.SphereGeometry(0.6, 20, 12, 0, Math.PI * 2, Math.PI * 0.32, Math.PI * 0.68),
      ironMat
    );
    pot.scale.set(1, 0.85, 1);
    pot.position.set(ccx, 0.75, ccz);
    group.add(pot);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.08, 10, 22), ironMat);
    rim.rotation.x = Math.PI / 2;
    rim.position.set(ccx, 1.02, ccz);
    group.add(rim);
    const brewMat = new THREE.MeshStandardMaterial({
      color: 0x0d3a1a,
      emissive: 0x39ff6a,
      emissiveIntensity: 1.1,
      roughness: 0.4,
    });
    const brew = new THREE.Mesh(new THREE.CircleGeometry(0.46, 20), brewMat);
    brew.rotation.x = -Math.PI / 2;
    brew.position.set(ccx, 1.0, ccz);
    group.add(brew);
    const coalLight = new THREE.PointLight(0xff6a2a, 10, 9, 1.8);
    coalLight.position.set(ccx, 0.9, ccz);
    group.add(coalLight);
    const NBUB = 8;
    const bpos = new Float32Array(NBUB * 3);
    const bvel = new Float32Array(NBUB);
    for (let i = 0; i < NBUB; i++) {
      bpos[i * 3] = ccx + (Math.random() - 0.5) * 0.6;
      bpos[i * 3 + 1] = 1.0 + Math.random() * 0.5;
      bpos[i * 3 + 2] = ccz + (Math.random() - 0.5) * 0.6;
      bvel[i] = 0.3 + Math.random() * 0.4;
    }
    const bubGeo = new THREE.BufferGeometry();
    bubGeo.setAttribute('position', new THREE.BufferAttribute(bpos, 3));
    const bubbles = new THREE.Points(
      bubGeo,
      new THREE.PointsMaterial({
        color: 0x66ff88,
        size: 0.09,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    group.add(bubbles);

    // Smoke: green wisps off the brew, grey smoke off the fireplace.
    if (!this.smokeTex) this.smokeTex = this.makeSmokeTexture();
    const smoke: SmokePuff[] = [
      ...this.makeSmoke(12, ccx, 1.2, ccz, 0x4dff6a, 0.55, 0.5, 1.6, THREE.AdditiveBlending, group),
      ...this.makeSmoke(10, firePos.x, 1.35, firePos.z, 0x8a8a8a, 0.3, 0.55, 1.7, THREE.NormalBlending, group),
    ];

    // -- Grandfather clock: corner opposite the cauldron. Wood case, painted
    // face, hands that walk BACKWARDS (time pools down here), swinging pendulum.
    const klx = L.clock.x * CELL;
    const klz = L.clock.y * CELL;
    const clockG = new THREE.Group();
    clockG.position.set(klx, 0, klz);
    clockG.rotation.y = Math.atan2(L.cx - L.clock.x, L.cy - L.clock.y); // face room center
    const caseMesh = new THREE.Mesh(new THREE.BoxGeometry(1.1, 3.1, 0.7), woodMat);
    caseMesh.position.y = 1.55;
    clockG.add(caseMesh);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.18, 0.85), woodMat);
    cap.position.y = 3.18;
    clockG.add(cap);
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.25, 0.8), woodMat);
    plinth.position.y = 0.12;
    clockG.add(plinth);
    if (!this.clockFaceTex) this.clockFaceTex = this.makeClockFaceTexture();
    const face = new THREE.Mesh(
      new THREE.CircleGeometry(0.4, 28),
      new THREE.MeshStandardMaterial({ map: this.clockFaceTex, roughness: 0.6 })
    );
    face.position.set(0, 2.5, 0.36);
    clockG.add(face);
    const handMat = new THREE.MeshStandardMaterial({ color: 0x1a140c, roughness: 0.5 });
    const clockHour = new THREE.Group();
    const hhm = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.22, 0.02), handMat);
    hhm.position.y = 0.09;
    clockHour.add(hhm);
    clockHour.position.set(0, 2.5, 0.38);
    clockG.add(clockHour);
    const clockMinute = new THREE.Group();
    const mhm = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.32, 0.02), handMat);
    mhm.position.y = 0.13;
    clockMinute.add(mhm);
    clockMinute.position.set(0, 2.5, 0.39);
    clockG.add(clockMinute);
    // Pendulum behind a dark inset panel (reads as glass without transparency).
    const panel = new THREE.Mesh(
      new THREE.PlaneGeometry(0.5, 1.5),
      new THREE.MeshStandardMaterial({ color: 0x0a0805, roughness: 1 })
    );
    panel.position.set(0, 1.15, 0.36);
    clockG.add(panel);
    const clockPendulum = new THREE.Group();
    clockPendulum.position.set(0, 1.85, 0.38);
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.2, 8), handMat);
    rod.position.y = -0.6;
    clockPendulum.add(rod);
    const bob = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.14, 0.04, 20),
      new THREE.MeshStandardMaterial({ color: 0xa8842a, metalness: 0.8, roughness: 0.35 })
    );
    bob.rotation.x = Math.PI / 2;
    bob.position.y = -1.15;
    clockPendulum.add(bob);
    clockG.add(clockPendulum);
    group.add(clockG);

    // -- The fissure: a crack in the study floor that breathes warm light.
    // Press F while standing on it to step into the Vale. Once the sunpetal
    // quest is done it goes dark — the dream has given all it has.
    const fissureX = L.cx * CELL;
    const fissureZ = L.cy * CELL;
    const sealed = !!d.valeSealed;
    const crack = new THREE.Mesh(
      new THREE.CircleGeometry(0.7, 24),
      new THREE.MeshStandardMaterial({ color: 0x0a0500, roughness: 1 })
    );
    crack.rotation.x = -Math.PI / 2;
    crack.scale.set(1, 1.6, 1);
    crack.position.set(fissureX, 0.015, fissureZ);
    group.add(crack);
    let fissureMotes: THREE.Points | null = null;
    const fissureVel = new Float32Array(8);
    if (!sealed) {
      const rim = new THREE.Mesh(
        new THREE.TorusGeometry(0.72, 0.05, 8, 28),
        new THREE.MeshStandardMaterial({
          color: 0xc8a03a,
          emissive: 0x8a6a1a,
          emissiveIntensity: 0.8,
          roughness: 0.6,
        })
      );
      rim.rotation.x = -Math.PI / 2;
      rim.scale.set(1, 1.6, 1);
      rim.position.set(fissureX, 0.03, fissureZ);
      group.add(rim);
      const fissureLight = new THREE.PointLight(0xffc860, 7, 8, 1.8);
      fissureLight.position.set(fissureX, 1.2, fissureZ);
      group.add(fissureLight);
      const FMOT = 8;
      const fpos = new Float32Array(FMOT * 3);
      for (let i = 0; i < FMOT; i++) {
        fpos[i * 3] = fissureX + (Math.random() - 0.5) * 0.9;
        fpos[i * 3 + 1] = 0.1 + Math.random() * 1.2;
        fpos[i * 3 + 2] = fissureZ + (Math.random() - 0.5) * 0.9;
        fissureVel[i] = 0.2 + Math.random() * 0.3;
      }
      const fgeo = new THREE.BufferGeometry();
      fgeo.setAttribute('position', new THREE.BufferAttribute(fpos, 3));
      fissureMotes = new THREE.Points(
        fgeo,
        new THREE.PointsMaterial({
          color: 0xffd76a,
          size: 0.08,
          transparent: true,
          opacity: 0.9,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      group.add(fissureMotes);
    }

    // -- Arched doorways: half-torus stone arches + jambs over each opening --
    const GDIR = [
      { x: 0, y: -1 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: -1, y: 0 },
    ];
    for (const dw of L.doorways) {
      const v = VEC[dw.dir]; // world-space {x, z}
      const g = GDIR[dw.dir]; // grid-space {x, y}
      const bx = (dw.x + g.x * 0.5) * CELL;
      const bz = (dw.y + g.y * 0.5) * CELL;
      const arch = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.3, 10, 20, Math.PI), stoneMat);
      arch.position.set(bx, 1.5, bz);
      arch.rotation.y = Math.atan2(v.x, v.z);
      group.add(arch);
      for (const s of [-1, 1]) {
        const jamb = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.5, 0.55), stoneMat);
        jamb.position.set(bx + -v.z * s * 1.5, 0.75, bz + v.x * s * 1.5);
        group.add(jamb);
      }
    }

    // Scattered papers — set dressing on open room floor.
    const blocked = new Set([`${L.hearth.x},${L.hearth.y}`, `${L.shelf.x},${L.shelf.y}`, `${L.table.x},${L.table.y}`, `${L.cauldron.x},${L.cauldron.y}`, `${L.clock.x},${L.clock.y}`]);
    const paperMat = new THREE.MeshStandardMaterial({ color: 0xcbb98a, roughness: 1 });
    let papers = 0;
    for (let y = L.y0; y <= L.y1 && papers < 7; y++) {
      for (let x = L.x0; x <= L.x1 && papers < 7; x++) {
        if (blocked.has(`${x},${y}`) || Math.random() < 0.45) continue;
        const paper = new THREE.Mesh(new THREE.PlaneGeometry(0.35, 0.45), paperMat);
        paper.rotation.x = -Math.PI / 2;
        paper.rotation.z = Math.random() * Math.PI;
        paper.position.set(x * CELL + (Math.random() - 0.5) * 2, 0.012, y * CELL + (Math.random() - 0.5) * 2);
        group.add(paper);
        papers++;
      }
    }

    this.scene.add(group);
    this.lair = {
      group,
      fireLight,
      flames,
      embers,
      emberVel: evel,
      bubbles,
      bubVel: bvel,
      brewMat,
      coalLight,
      smoke,
      clockMinute,
      clockHour,
      clockPendulum,
      fissureMotes,
      fissureVel,
      phase: Math.random() * 10,
    };
  }

  /** Aged clock face: cream, tick marks, roman quarters. Shared across levels. */
  private makeClockFaceTexture(): THREE.CanvasTexture {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d')!;
    g.fillStyle = '#e8dcc0';
    g.beginPath();
    g.arc(128, 128, 126, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#5a4a2a';
    g.lineWidth = 6;
    g.beginPath();
    g.arc(128, 128, 116, 0, Math.PI * 2);
    g.stroke();
    for (let i = 0; i < 60; i++) {
      const a = (i / 60) * Math.PI * 2;
      const big = i % 5 === 0;
      g.strokeStyle = '#3a2f1a';
      g.lineWidth = big ? 5 : 2;
      const r1 = big ? 98 : 106;
      const r2 = 112;
      g.beginPath();
      g.moveTo(128 + Math.cos(a) * r1, 128 + Math.sin(a) * r1);
      g.lineTo(128 + Math.cos(a) * r2, 128 + Math.sin(a) * r2);
      g.stroke();
    }
    g.fillStyle = '#3a2f1a';
    g.font = 'bold 26px serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('XII', 128, 44);
    g.fillText('III', 212, 128);
    g.fillText('VI', 128, 212);
    g.fillText('IX', 44, 128);
    g.fillStyle = '#2a2114';
    g.beginPath();
    g.arc(128, 128, 8, 0, Math.PI * 2);
    g.fill();
    return new THREE.CanvasTexture(c);
  }

  /** Soft radial blob texture, tinted per smoke system via sprite color. */
  private makeSmokeTexture(): THREE.CanvasTexture {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
    grad.addColorStop(0, 'rgba(255,255,255,0.85)');
    grad.addColorStop(0.5, 'rgba(255,255,255,0.32)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  }

  private resetPuff(p: SmokePuff, stagger = false) {
    p.life = stagger ? Math.random() * p.maxLife : 0;
    p.sprite.position.set(
      p.baseX + (Math.random() - 0.5) * 0.4,
      p.baseY,
      p.baseZ + (Math.random() - 0.5) * 0.4
    );
  }

  private makeSmoke(
    n: number,
    x: number,
    y: number,
    z: number,
    color: number,
    maxOp: number,
    vy: number,
    grow: number,
    blending: THREE.Blending,
    group: THREE.Group
  ): SmokePuff[] {
    const out: SmokePuff[] = [];
    for (let i = 0; i < n; i++) {
      const mat = new THREE.SpriteMaterial({
        map: this.smokeTex!,
        color,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending,
      });
      const sprite = new THREE.Sprite(mat);
      const p: SmokePuff = {
        sprite,
        life: 0,
        maxLife: 2.2 + Math.random() * 1.6,
        vy: vy * (0.8 + Math.random() * 0.4),
        baseX: x,
        baseY: y,
        baseZ: z,
        grow,
        maxOp,
        drift: Math.random() * 10,
      };
      this.resetPuff(p, true);
      group.add(sprite);
      out.push(p);
    }
    return out;
  }

  /** Teardrop flame sprite: hot core → transparent tip, for additive planes. */
  private makeFlameTexture(): THREE.CanvasTexture {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 128;
    const g = c.getContext('2d')!;
    const layers: Array<[number, number, number, number, string]> = [
      // [cx, cy, rx, ry, color]
      [32, 96, 26, 30, 'rgba(255, 90, 20, 0.55)'], // outer orange body
      [32, 100, 17, 22, 'rgba(255, 150, 40, 0.75)'], // mid
      [32, 104, 10, 14, 'rgba(255, 220, 120, 0.9)'], // hot core
      [32, 58, 12, 28, 'rgba(255, 120, 30, 0.45)'], // licking tip
    ];
    for (const [cx, cy, rx, ry, color] of layers) {
      const grad = g.createRadialGradient(cx, cy, 1, cx, cy, Math.max(rx, ry));
      grad.addColorStop(0, color);
      grad.addColorStop(1, 'rgba(255, 80, 10, 0)');
      g.fillStyle = grad;
      g.beginPath();
      g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      g.fill();
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  /** Procedural book-spine texture for the shelf front. */
  private makeBookshelfTexture(): THREE.CanvasTexture {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 256;
    const g = c.getContext('2d')!;
    g.fillStyle = '#241a10';
    g.fillRect(0, 0, 256, 256);
    const palette = ['#7a2a2a', '#2a4a7a', '#3a6a3a', '#6a5a2a', '#5a2a6a', '#8a6a3a', '#933d1e'];
    for (let shelf = 0; shelf < 4; shelf++) {
      const y0 = 8 + shelf * 62;
      g.fillStyle = '#171008';
      g.fillRect(0, y0 + 54, 256, 8);
      let x = 6;
      while (x < 244) {
        const w = 8 + Math.random() * 12;
        const h = 38 + Math.random() * 14;
        g.fillStyle = palette[(Math.random() * palette.length) | 0];
        g.fillRect(x, y0 + 54 - h, w, h);
        g.fillStyle = 'rgba(0,0,0,0.35)';
        g.fillRect(x, y0 + 54 - h, 3, h);
        g.fillStyle = 'rgba(255,230,180,0.25)';
        g.fillRect(x + w - 4, y0 + 58 - h, 2, h - 8);
        x += w + 2;
      }
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  /** Place camera + torch at grid cell, facing dir (0=N,1=E,2=S,3=W). */
  setView(x: number, y: number, dir: number, bobPhase = 0) {
    const px = x * CELL;
    const pz = y * CELL;
    // Camera default looks along -Z = map north (world -Z = decreasing y).
    const yaw = [0, -Math.PI / 2, Math.PI, Math.PI / 2][dir];
    this.camera.position.set(px, 1.7 + Math.sin(bobPhase) * 0.05, pz);
    this.camera.rotation.set(0, yaw, 0, 'YXZ');
    this.torch.position.set(px, 2.6, pz);
  }

  /** Tween helper state lives in game.ts; this just applies an interpolated yaw. */
  setYaw(yaw: number) {
    this.camera.rotation.y = yaw;
  }

  update(dt: number) {
    // Torch flicker — in the Vale the sun does the work; the torch is a candle.
    this.flicker += dt;
    const f = Math.sin(this.flicker * 11) * 0.5 + Math.sin(this.flicker * 23 + 1.7) * 0.3;
    this.torch.intensity = this.theme === 'vale' ? 5 : 30 + f * 5;
    if (this.exitMarker) this.exitMarker.rotation.y += dt * 0.6;
    // The Vale: stream shimmer, sunpetals turning in the light, and the
    // dragon that never lands — one slow circle per ~55s, banking into the
    // turn, wings flapping in bursts with long glides between.
    if (this.vale) {
      const V = this.vale;
      V.phase += dt;
      // Stream shimmer — must stay near-opaque (0.82–0.98): the old shimmer
      // swung 0.38–0.62 and undid the 0.9 opacity fix every frame, which is
      // why the water kept reading murky grey-green.
      V.streamMat.opacity = 0.9 + Math.sin(V.phase * 1.4) * 0.08;
      for (const p of V.petals) {
        p.group.rotation.y += dt * 0.4;
        p.group.position.y = Math.sin(V.phase * 1.8 + p.group.position.x) * 0.05;
        p.light.intensity = 14 + Math.sin(V.phase * 2.2) * 2;
      }
      // The sun rides the northern sky at a fixed offset from the camera —
      // a far sun never moves, and it is never occluded by ruin walls.
      // ~13° elevation, ~9° across: a small round disc in the upper sky.
      V.sun.position.set(
        this.camera.position.x,
        this.camera.position.y + 9,
        this.camera.position.z - 38
      );
      const D = V.dragon;
      D.angle += dt * ((Math.PI * 2) / 55);
      const dx = D.cx + D.radius * Math.cos(D.angle);
      const dz = D.cz + D.radius * Math.sin(D.angle);
      // High in the sky — the body cruises at y≈4.8, ABOVE the 4-tall
      // ruin walls, under the y=7 Vale ceiling (see the node check):
      // lowest wingtip ~2.9, highest wingtip ~6.8, head ~6.4. At y≈3.0
      // the dragon WAS wall-top height and the walls hid it for minutes.
      const dy = 4.8 + 0.1 * Math.sin(D.angle * 2 + 1.3);
      D.group.position.set(dx, dy, dz);
      // Face the flight tangent: velocity (-sin, cos) in (x, z).
      D.group.rotation.y = Math.atan2(-Math.cos(D.angle), -Math.sin(D.angle));
      // The circle's center sits on the dragon's right — it banks right.
      // 0.3 rad: the roll reads at distance without dropping a wingtip
      // near the grass (the old 0.5 rad + 0.4 dihedral put a tip at y≈0.2).
      D.bank.rotation.x = 0.3;
      // Wingbeats: a readable rhythm — 3 strong beats (~1.2 Hz) then a
      // 4s glide, on a 6.5s cycle. The flap is a raised cosine over the
      // beat window, so it starts and ends at the glide value (0.06) with
      // no snap. The old slow envelope read as static gliding.
      const cyc = V.phase % 6.5;
      let flap = 0.06;
      if (cyc < 2.5) {
        flap = 0.06 + 0.32 * (0.5 - 0.5 * Math.cos(cyc * Math.PI * 2 * 1.2));
      }
      // Wings hold a dihedral (tips drooped ~0.3 rad) so the broad membrane
      // faces the ground — flat wings read edge-on as sticks from below.
      // The flap lifts the tips from the droop; at full beat they rise
      // just past level, never above the ceiling.
      D.wingR.rotation.x = 0.3 - flap;
      D.wingL.rotation.x = -0.3 + flap;
      D.neck.rotation.y = 0.1 * Math.sin(V.phase * 0.6);
      D.tail.rotation.y = 0.12 * Math.sin(V.phase * 0.6 - 1.2);
      // Its shadow slides over the gold grass below, long axis along the heading.
      D.shadow.position.set(dx, 0.06, dz);
      D.shadow.rotation.set(-Math.PI / 2, 0, D.group.rotation.y);
    }
    // The study fire: flicker + dancing flames + rising embers.
    if (this.lair) {
      const L = this.lair;
      L.phase += dt;
      const ff =
        Math.sin(L.phase * 9) * 0.5 + Math.sin(L.phase * 17 + 2.1) * 0.3 + Math.sin(L.phase * 31) * 0.2;
      L.fireLight.intensity = 26 + ff * 7;
      L.flames.forEach((fl, i) => {
        const s = 1 + Math.sin(L.phase * (10 + i * 3) + i * 2) * 0.16;
        fl.scale.set(s, 1 + Math.sin(L.phase * 13 + i) * 0.22, 1);
      });
      const pos = L.embers.geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < L.emberVel.length; i++) {
        let y = pos.getY(i) + L.emberVel[i] * dt;
        if (y > 2.6) y = 0.6;
        pos.setY(i, y);
        pos.setX(i, pos.getX(i) + Math.sin(L.phase * 3 + i * 1.7) * dt * 0.25);
      }
      pos.needsUpdate = true;
      // Cauldron: bubbles rise and pop, brew glows, coals breathe.
      const bp = L.bubbles.geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < L.bubVel.length; i++) {
        let y = bp.getY(i) + L.bubVel[i] * dt;
        if (y > 1.6) y = 1.0;
        bp.setY(i, y);
      }
      bp.needsUpdate = true;
      L.brewMat.emissiveIntensity = 1.1 + Math.sin(L.phase * 2.4) * 0.35;
      L.coalLight.intensity = 10 + Math.sin(L.phase * 7 + 1) * 2.5;
      // Grandfather clock: hands walk BACKWARDS (time pools down here),
      // pendulum swings on a 2s period.
      const back = L.phase * ((Math.PI * 2) / 120); // full backwards turn per 120s
      L.clockMinute.rotation.z = back;
      L.clockHour.rotation.z = back / 12;
      L.clockPendulum.rotation.z = Math.sin(L.phase * Math.PI) * 0.28;
      // Fissure motes: golden dust rising from the crack in the floor.
      if (L.fissureMotes) {
        const fp = L.fissureMotes.geometry.getAttribute('position') as THREE.BufferAttribute;
        for (let i = 0; i < L.fissureVel.length; i++) {
          let y = fp.getY(i) + L.fissureVel[i] * dt;
          if (y > 1.6) y = 0.1;
          fp.setY(i, y);
        }
        fp.needsUpdate = true;
      }
      // Smoke puffs: rise, grow, fade, recycle.
      for (const p of L.smoke) {
        p.life += dt;
        if (p.life >= p.maxLife) {
          this.resetPuff(p);
          continue;
        }
        const t = p.life / p.maxLife;
        p.sprite.position.y += p.vy * dt;
        p.sprite.position.x += Math.sin(L.phase * 2 + p.drift) * dt * 0.3;
        const sc = 0.5 + t * p.grow;
        p.sprite.scale.set(sc, sc, 1);
        (p.sprite.material as THREE.SpriteMaterial).opacity = p.maxOp * (1 - t);
      }
    }
    // Screen shake: remove last frame's offset, apply a fresh decaying one.
    this.camera.position.x -= this.lastShakeX;
    this.camera.position.y -= this.lastShakeY;
    this.lastShakeX = 0;
    this.lastShakeY = 0;
    if (this.shakeAmt > 0.004) {
      this.lastShakeX = (Math.random() - 0.5) * this.shakeAmt;
      this.lastShakeY = (Math.random() - 0.5) * this.shakeAmt * 0.6;
      this.camera.position.x += this.lastShakeX;
      this.camera.position.y += this.lastShakeY;
      this.shakeAmt *= Math.pow(0.02, dt); // fast decay
    } else {
      this.shakeAmt = 0;
    }
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
