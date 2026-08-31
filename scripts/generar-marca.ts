// Genera el logo placeholder neutro y los iconos PWA — spec 030.
//
//   npm run marca
//
// Node puro (zlib para el PNG), sin dependencias ni `sips`: dibuja una marca
// tipo radar (anillos concéntricos + barrido + punto) y la codifica a PNG a
// varios tamaños. Salida versionada en public/assets/ y public/icons/.
//
// Es un PLACEHOLDER explícito. Quien despliegue el repo pone su propio logo en
// public/assets/logo.png (transparente, cuadrado) y regenera los iconos.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { crc32, deflateSync } from 'node:zlib';

const RAIZ = join(import.meta.dirname, '..');
const NAVY: RGB = [0x0b, 0x1f, 0x33];
const BLANCO: RGB = [0xf2, 0xf5, 0xf9];
const ACENTO: RGB = [0x38, 0xbd, 0xf8];

type RGB = [number, number, number];

// --------------------------------------------------------------------------
// Lienzo RGBA float con composición "over"
// --------------------------------------------------------------------------

class Lienzo {
  readonly n: number;
  private readonly px: Float64Array; // RGBA premult-free, alpha 0..1

  constructor(n: number) {
    this.n = n;
    this.px = new Float64Array(n * n * 4);
  }

  private over(i: number, c: RGB, a: number): void {
    if (a <= 0) return;
    const r = this.px[i]!;
    const g = this.px[i + 1]!;
    const b = this.px[i + 2]!;
    const da = this.px[i + 3]!;
    const oa = a + da * (1 - a);
    if (oa <= 0) return;
    this.px[i] = (c[0] * a + r * da * (1 - a)) / oa;
    this.px[i + 1] = (c[1] * a + g * da * (1 - a)) / oa;
    this.px[i + 2] = (c[2] * a + b * da * (1 - a)) / oa;
    this.px[i + 3] = oa;
  }

  fill(c: RGB): void {
    for (let p = 0; p < this.n * this.n; p++) {
      this.px[p * 4] = c[0];
      this.px[p * 4 + 1] = c[1];
      this.px[p * 4 + 2] = c[2];
      this.px[p * 4 + 3] = 1;
    }
  }

  /** Recorre cada píxel con coordenadas normalizadas (0..1) y una función de cobertura. */
  paint(cobertura: (x: number, y: number) => { c: RGB; a: number } | null): void {
    for (let y = 0; y < this.n; y++) {
      for (let x = 0; x < this.n; x++) {
        const r = cobertura((x + 0.5) / this.n, (y + 0.5) / this.n);
        if (r) this.over((y * this.n + x) * 4, r.c, r.a);
      }
    }
  }

  /** Downsample box a n/f y devuelve RGBA 8-bit. */
  downsample(f: number): { size: number; data: Uint8Array } {
    const size = Math.floor(this.n / f);
    const data = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        let r = 0, g = 0, b = 0, a = 0;
        for (let dy = 0; dy < f; dy++) {
          for (let dx = 0; dx < f; dx++) {
            const i = ((y * f + dy) * this.n + (x * f + dx)) * 4;
            const pa = this.px[i + 3]!;
            r += this.px[i]! * pa;
            g += this.px[i + 1]! * pa;
            b += this.px[i + 2]! * pa;
            a += pa;
          }
        }
        const o = (y * size + x) * 4;
        data[o] = a > 0 ? Math.round(r / a) : 0;
        data[o + 1] = a > 0 ? Math.round(g / a) : 0;
        data[o + 2] = a > 0 ? Math.round(b / a) : 0;
        data[o + 3] = Math.round((a / (f * f)) * 255);
      }
    }
    return { size, data };
  }
}

// SDF helpers en coordenadas normalizadas, centro (0.5,0.5)
const dist = (x: number, y: number, cx: number, cy: number) => Math.hypot(x - cx, y - cy);

function cobAnillo(x: number, y: number, r: number, half: number, aa: number): number {
  return clamp01((half - Math.abs(dist(x, y, 0.5, 0.5) - r)) / aa);
}
function cobDisco(x: number, y: number, cx: number, cy: number, r: number, aa: number): number {
  return clamp01((r - dist(x, y, cx, cy)) / aa);
}
function cobSegmento(x: number, y: number, ax: number, ay: number, bx: number, by: number, half: number, aa: number): number {
  const dx = bx - ax, dy = by - ay;
  const t = clamp01(((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy));
  return clamp01((half - Math.hypot(x - (ax + t * dx), y - (ay + t * dy))) / aa);
}
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

// --------------------------------------------------------------------------
// La marca
// --------------------------------------------------------------------------

/** Dibuja la marca sobre `lienzo`. `s` escala el contenido (0.78 para maskable). */
function dibujarMarca(lienzo: Lienzo, s: number): void {
  const aa = 1.4 / lienzo.n;
  const ang = -Math.PI / 4; // barrido a 45°
  const rMax = 0.4 * s;
  const tipX = 0.5 + Math.cos(ang) * rMax;
  const tipY = 0.5 + Math.sin(ang) * rMax;
  const blipX = 0.5 + Math.cos(2.3) * 0.24 * s;
  const blipY = 0.5 + Math.sin(2.3) * 0.24 * s;

  lienzo.paint((x, y) => {
    // anillos concéntricos
    const anillos: Array<[number, number]> = [
      [0.16 * s, 0.95],
      [0.28 * s, 0.5],
      [0.4 * s, 0.28],
    ];
    let out: { c: RGB; a: number } | null = null;
    const acc = (c: RGB, a: number) => {
      if (a <= 0) return;
      out = out ? { c, a: a + out.a * (1 - a) } : { c, a };
    };
    // crosshair tenue (dentro del radio, no a sangre)
    acc(BLANCO, 0.14 * cobSegmento(x, y, 0.5, 0.5 - 0.42 * s, 0.5, 0.5 + 0.42 * s, 0.003, aa));
    acc(BLANCO, 0.14 * cobSegmento(x, y, 0.5 - 0.42 * s, 0.5, 0.5 + 0.42 * s, 0.5, 0.003, aa));
    for (const [r, alpha] of anillos) acc(BLANCO, alpha * cobAnillo(x, y, r, 0.008, aa));
    // barrido de acento + punta
    acc(ACENTO, 0.9 * cobSegmento(x, y, 0.5, 0.5, tipX, tipY, 0.009, aa));
    acc(ACENTO, cobDisco(x, y, tipX, tipY, 0.02 * s, aa));
    // blip
    acc(ACENTO, 0.85 * cobDisco(x, y, blipX, blipY, 0.016 * s, aa));
    // punto central
    acc(BLANCO, cobDisco(x, y, 0.5, 0.5, 0.03 * s, aa));
    return out;
  });
}

// --------------------------------------------------------------------------
// PNG (RGBA 8-bit)
// --------------------------------------------------------------------------

function chunk(tipo: string, datos: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(datos.length, 0);
  const cuerpo = Buffer.concat([Buffer.from(tipo, 'ascii'), datos]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(cuerpo) >>> 0, 0);
  return Buffer.concat([len, cuerpo, crc]);
}

function png(size: number, data: Uint8Array): Buffer {
  const stride = size * 4;
  const conFiltro = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    Buffer.from(data.buffer, y * stride, stride).copy(conFiltro, y * (stride + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr.writeUInt8(8, 8);
  ihdr.writeUInt8(6, 9);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(conFiltro, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function generar(size: number, opts: { fondo: RGB | null; escala: number }): Buffer {
  const SS = size <= 64 ? 8 : 4;
  const lienzo = new Lienzo(size * SS);
  if (opts.fondo) lienzo.fill(opts.fondo);
  dibujarMarca(lienzo, opts.escala);
  const { size: s, data } = lienzo.downsample(SS);
  return png(s, data);
}

// --------------------------------------------------------------------------

mkdirSync(join(RAIZ, 'public/assets'), { recursive: true });
mkdirSync(join(RAIZ, 'public/icons'), { recursive: true });

const salidas: Array<[string, number, RGB | null, number]> = [
  ['public/assets/logo.png', 512, null, 1],
  ['public/icons/icon-192.png', 192, NAVY, 1],
  ['public/icons/icon-512.png', 512, NAVY, 1],
  ['public/icons/icon-maskable-512.png', 512, NAVY, 0.78],
  ['public/icons/apple-touch-icon.png', 180, NAVY, 1],
  ['public/icons/favicon-32.png', 32, NAVY, 1],
];

for (const [ruta, size, fondo, escala] of salidas) {
  writeFileSync(join(RAIZ, ruta), generar(size, { fondo, escala }));
  console.log(`  ${ruta}  (${size}×${size})`);
}
console.log('Marca e iconos generados.');
