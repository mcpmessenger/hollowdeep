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
