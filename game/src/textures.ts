// Procedural canvas textures — placeholders until the AI-generated
// "world model style" set lands. All textures are tileable-ish and dark.

import * as THREE from 'three';

function canvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return [c, c.getContext('2d')!];
}

function noise(ctx: CanvasRenderingContext2D, size: number, base: string, amp: number) {
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  const img = ctx.getImageData(0, 0, size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * amp;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}

function stoneWall(): HTMLCanvasElement {
  const S = 256;
  const [c, ctx] = canvas(S);
  noise(ctx, S, '#2b2620', 36);
  // brick courses
  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.lineWidth = 3;
  const rows = 4;
  for (let r = 0; r <= rows; r++) {
    const y = (r * S) / rows;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(S, y);
    ctx.stroke();
    const offset = r % 2 === 0 ? 0 : S / 4;
    for (let k = 0; k < 2; k++) {
      const x = offset + (k * S) / 2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + S / rows);
      ctx.stroke();
    }
  }
  // moss / damp patches
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = `rgba(${20 + Math.random() * 30},${50 + Math.random() * 40},${20 + Math.random() * 20},0.12)`;
    ctx.beginPath();
    ctx.arc(Math.random() * S, Math.random() * S, 4 + Math.random() * 14, 0, 7);
    ctx.fill();
  }
  // torch soot near top
  const g = ctx.createLinearGradient(0, 0, 0, S * 0.4);
  g.addColorStop(0, 'rgba(0,0,0,0.5)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S * 0.4);
  return c;
}

function flagstone(): HTMLCanvasElement {
  const S = 256;
  const [c, ctx] = canvas(S);
  noise(ctx, S, '#232022', 30);
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  ctx.lineWidth = 4;
  // irregular flagstones
  const n = 3;
  for (let i = 0; i <= n; i++) {
    const p = (i * S) / n + (Math.random() - 0.5) * 10;
    ctx.beginPath();
    ctx.moveTo(p, 0);
    ctx.lineTo(p + (Math.random() - 0.5) * 20, S);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, p);
    ctx.lineTo(S, p + (Math.random() - 0.5) * 20);
    ctx.stroke();
  }
  return c;
}

function ceiling(): HTMLCanvasElement {
  const S = 256;
  const [c, ctx] = canvas(S);
  noise(ctx, S, '#161312', 22);
  for (let i = 0; i < 25; i++) {
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.arc(Math.random() * S, Math.random() * S, 6 + Math.random() * 20, 0, 7);
    ctx.fill();
  }
  return c;
}

/** A gibberling: dark furball with too many eyes. Drawn, not modeled. */
export function gibberlingSprite(): HTMLCanvasElement {
  const S = 128;
  const [c, ctx] = canvas(S);
  ctx.clearRect(0, 0, S, S);
  // fur blob
  const g = ctx.createRadialGradient(S / 2, S / 2, 8, S / 2, S / 2, S / 2);
  g.addColorStop(0, '#4a3b2d');
  g.addColorStop(0.7, '#2a2018');
  g.addColorStop(1, 'rgba(20,14,10,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(S / 2, S / 2, S / 2 - 2, 0, 7);
  ctx.fill();
  // fur spikes
  ctx.strokeStyle = '#1a120c';
  ctx.lineWidth = 2;
  for (let i = 0; i < 60; i++) {
    const a = Math.random() * Math.PI * 2;
    const r1 = S * 0.32;
    const r2 = S * 0.32 + Math.random() * S * 0.14;
    ctx.beginPath();
    ctx.moveTo(S / 2 + Math.cos(a) * r1, S / 2 + Math.sin(a) * r1);
    ctx.lineTo(S / 2 + Math.cos(a) * r2, S / 2 + Math.sin(a) * r2);
    ctx.stroke();
  }
  // eyes — too many, and they glow. Red reads in the dark; amber didn't.
  const eyePos: Array<[number, number]> = [];
  const eyes = 5 + ((Math.random() * 3) | 0);
  for (let i = 0; i < eyes; i++) {
    eyePos.push([
      S / 2 + (Math.random() - 0.5) * S * 0.5,
      S / 2 + (Math.random() - 0.5) * S * 0.4,
    ]);
  }
  ctx.save();
  ctx.shadowColor = '#ff2a1a';
  ctx.shadowBlur = 14;
  ctx.fillStyle = '#ff3b28';
  for (const [ex, ey] of eyePos) {
    ctx.beginPath();
    ctx.arc(ex, ey, 6, 0, 7);
    ctx.fill();
  }
  ctx.restore();
  // crisp dark pupils on top
  ctx.fillStyle = '#1a0505';
  for (const [ex, ey] of eyePos) {
    ctx.beginPath();
    ctx.arc(ex, ey, 2.4, 0, 7);
    ctx.fill();
  }
  // teeth
  ctx.fillStyle = '#d8d0c0';
  for (let i = 0; i < 6; i++) {
    const tx = S / 2 - 24 + i * 9;
    ctx.beginPath();
    ctx.moveTo(tx, S / 2 + 22);
    ctx.lineTo(tx + 4, S / 2 + 22);
    ctx.lineTo(tx + 2, S / 2 + 30);
    ctx.fill();
  }
  return c;
}

function toTexture(c: HTMLCanvasElement, repeat = 1): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export interface TextureSet {
  wall: THREE.CanvasTexture;
  floor: THREE.CanvasTexture;
  ceil: THREE.CanvasTexture;
}

export function makeTextures(): TextureSet {
  return {
    wall: toTexture(stoneWall()),
    floor: toTexture(flagstone(), 1),
    ceil: toTexture(ceiling()),
  };
}
