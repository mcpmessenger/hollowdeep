// Three.js first-person renderer for the grid dungeon.

import * as THREE from 'three';
import { Dungeon, WALL, EXIT } from './dungeon';
import { makeTextures, TextureSet, registerTexMat, resetTexRegistry } from './textures';

export const CELL = 4; // world units per grid cell
const WALL_H = 4;

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
    phase: number;
  } | null = null;

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

    const wallGeo = new THREE.BoxGeometry(CELL, WALL_H, CELL);
    const wallMat = new THREE.MeshStandardMaterial({
      map: this.textures.wall,
      roughness: 0.95,
      metalness: 0,
    });
    registerTexMat('wall', wallMat);

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
    const floorMat = new THREE.MeshStandardMaterial({ map: this.textures.floor, roughness: 1 });
    registerTexMat('floor', floorMat);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(S, S), floorMat);
    floor.material.map!.repeat.set(d.size, d.size);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set((S - CELL) / 2, 0, (S - CELL) / 2);
    floor.name = 'floor';
    this.scene.add(floor);
    this.wallMeshes.push(floor as unknown as THREE.Mesh);

    const ceilMat = new THREE.MeshStandardMaterial({ map: this.textures.ceil, roughness: 1 });
    registerTexMat('ceil', ceilMat);
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(S, S), ceilMat);
    ceil.material.map!.repeat.set(d.size, d.size);
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set((S - CELL) / 2, WALL_H, (S - CELL) / 2);
    ceil.name = 'ceil';
    this.scene.add(ceil);
    this.wallMeshes.push(ceil as unknown as THREE.Mesh);

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

    this.buildLair(d);
  }

  /** Vess's study: fireplace + bookshelf + alchemy table in the lair cell. */
  private buildLair(d: Dungeon) {
    // Tear down the previous level's study.
    if (this.lair) {
      this.scene.remove(this.lair.group);
      this.lair.group.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        const mat = (mesh as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
        const mats = Array.isArray(mat) ? mat : mat ? [mat] : [];
        for (const m of mats) {
          const withMap = m as THREE.MeshStandardMaterial;
          if (withMap.map) withMap.map.dispose();
          m.dispose();
        }
      });
      this.lair = null;
    }

    const group = new THREE.Group();
    const cx = d.lair.x * CELL;
    const cz = d.lair.y * CELL;
    const dirVec = [
      { x: 0, z: -1 },
      { x: 1, z: 0 },
      { x: 0, z: 1 },
      { x: -1, z: 0 },
    ][d.lair.fireDir];
    const yawFor = (vx: number, vz: number) => Math.atan2(vx, vz);

    // -- Fireplace: stone hearth built into the wall --
    const hx = cx + dirVec.x * 1.5;
    const hz = cz + dirVec.z * 1.5;
    const hearth = new THREE.Mesh(
      new THREE.BoxGeometry(1.7, 1.1, 0.8),
      new THREE.MeshStandardMaterial({ color: 0x35302a, roughness: 1 })
    );
    hearth.position.set(hx, 0.55, hz);
    hearth.rotation.y = yawFor(-dirVec.x, -dirVec.z);
    group.add(hearth);
    // Mantel slab.
    const mantel = new THREE.Mesh(
      new THREE.BoxGeometry(2.0, 0.14, 1.0),
      new THREE.MeshStandardMaterial({ color: 0x4a4038, roughness: 1 })
    );
    mantel.position.set(hx, 1.17, hz);
    mantel.rotation.y = hearth.rotation.y;
    group.add(mantel);

    // Flames: crossed emissive planes in the firebox.
    const flames: THREE.Mesh[] = [];
    const firePos = { x: hx - dirVec.x * 0.35, z: hz - dirVec.z * 0.35 };
    for (let i = 0; i < 3; i++) {
      const flame = new THREE.Mesh(
        new THREE.PlaneGeometry(0.55, 0.9),
        new THREE.MeshBasicMaterial({
          color: i === 0 ? 0xffd27a : 0xff8830,
          transparent: true,
          opacity: 0.9,
          side: THREE.DoubleSide,
          depthWrite: false,
        })
      );
      flame.position.set(firePos.x, 0.75, firePos.z);
      flame.rotation.y = (i * Math.PI) / 3;
      group.add(flame);
      flames.push(flame);
    }
    // Firelight.
    const fireLight = new THREE.PointLight(0xff8033, 26, 16, 1.8);
    fireLight.position.set(firePos.x, 1.7, firePos.z);
    group.add(fireLight);

    // Embers: additive points rising from the firebox.
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

    // -- Bookshelf: against a different wall than the fireplace --
    const DXY = [
      { x: 0, y: -1 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: -1, y: 0 },
    ];
    const wallDirs = [0, 1, 2, 3].filter((dd) => {
      const nx = d.lair.x + DXY[dd].x;
      const ny = d.lair.y + DXY[dd].y;
      return ny >= 0 && ny < d.size && nx >= 0 && nx < d.size && d.grid[ny][nx] === WALL;
    });
    const shelfDir = wallDirs.find((dd) => dd !== d.lair.fireDir) ?? d.lair.fireDir;
    const svec = [
      { x: 0, z: -1 },
      { x: 1, z: 0 },
      { x: 0, z: 1 },
      { x: -1, z: 0 },
    ][shelfDir];
    const shelf = new THREE.Mesh(
      new THREE.BoxGeometry(2.3, 2.5, 0.55),
      new THREE.MeshStandardMaterial({ map: this.makeBookshelfTexture(), roughness: 0.9 })
    );
    shelf.position.set(cx + svec.x * 1.55, 1.25, cz + svec.z * 1.55);
    shelf.rotation.y = yawFor(-svec.x, -svec.z);
    group.add(shelf);

    // -- Alchemy table: opposite the fire, potions on top --
    const tx = cx - dirVec.x * 0.9;
    const tz = cz - dirVec.z * 0.9;
    const wood = new THREE.MeshStandardMaterial({ color: 0x4a3520, roughness: 0.9 });
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.12, 1.1), wood);
    top.position.set(tx, 0.85, tz);
    group.add(top);
    for (const [lx, lz] of [
      [-0.85, -0.45],
      [0.85, -0.45],
      [-0.85, 0.45],
      [0.85, 0.45],
    ]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.85, 0.1), wood);
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

    // Scattered papers — set dressing.
    const paperMat = new THREE.MeshStandardMaterial({ color: 0xcbb98a, roughness: 1 });
    for (let i = 0; i < 4; i++) {
      const paper = new THREE.Mesh(new THREE.PlaneGeometry(0.35, 0.45), paperMat);
      paper.rotation.x = -Math.PI / 2;
      paper.rotation.z = Math.random() * Math.PI;
      paper.position.set(
        cx + (Math.random() - 0.5) * 2.4,
        0.012,
        cz + (Math.random() - 0.5) * 2.4
      );
      group.add(paper);
    }

    this.scene.add(group);
    this.lair = { group, fireLight, flames, embers, emberVel: evel, phase: Math.random() * 10 };
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
    // Torch flicker.
    this.flicker += dt;
    const f = Math.sin(this.flicker * 11) * 0.5 + Math.sin(this.flicker * 23 + 1.7) * 0.3;
    this.torch.intensity = 30 + f * 5;
    if (this.exitMarker) this.exitMarker.rotation.y += dt * 0.6;
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
