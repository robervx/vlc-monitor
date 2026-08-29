// Genera los iconos PWA (spec 028 §3) a partir del escudo oficial
// public/assets/policia-local-valencia-logo.png.
//
//   npm run iconos:pwa
//
// Los iconos se versionan en public/icons/ — NO hay pipeline en runtime ni en
// el build. Vuelve a ejecutarlo solo si cambia el escudo de origen.
//
// Requiere `sips` (viene con macOS) para el reescalado con antialiasing; el
// aplanado del alfa contra el navy de marca se hace aquí en Node puro
// (zlib + composición por píxel), sin añadir ninguna dependencia npm.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { crc32, deflateSync, inflateSync } from 'node:zlib';

const RAIZ = join(import.meta.dirname, '..');
const ORIGEN = join(RAIZ, 'public/assets/policia-local-valencia-logo.png');
const SALIDA = join(RAIZ, 'public/icons');
const TMP = join(RAIZ, 'node_modules/.cache/iconos-pwa');

// Navy de marca (index.html / spec 019).
const FONDO: [number, number, number] = [0x0b, 0x1f, 0x33];

interface Imagen {
  width: number;
  height: number;
  /** RGBA 8-bit, width*height*4 */
  data: Uint8Array;
}

// --------------------------------------------------------------------------
// PNG mínimo: decodifica/codifica RGBA 8-bit no entrelazado (lo que produce sips)
// --------------------------------------------------------------------------

function leerChunks(buf: Buffer): { tipo: string; datos: Buffer }[] {
  const chunks: { tipo: string; datos: Buffer }[] = [];
  let p = 8; // saltar la firma PNG
  while (p < buf.length) {
    const len = buf.readUInt32BE(p);
    const tipo = buf.toString('ascii', p + 4, p + 8);
    chunks.push({ tipo, datos: buf.subarray(p + 8, p + 8 + len) });
    p += 12 + len;
  }
  return chunks;
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

function decodificarPng(ruta: string): Imagen {
  const buf = readFileSync(ruta);
  const chunks = leerChunks(buf);
  const ihdr = chunks.find((c) => c.tipo === 'IHDR');
  if (!ihdr) throw new Error('PNG sin IHDR');
  const width = ihdr.datos.readUInt32BE(0);
  const height = ihdr.datos.readUInt32BE(4);
  const bitDepth = ihdr.datos.readUInt8(8);
  const colorType = ihdr.datos.readUInt8(9);
  const interlace = ihdr.datos.readUInt8(12);
  if (bitDepth !== 8 || colorType !== 6 || interlace !== 0) {
    throw new Error(`Formato PNG no soportado (bitDepth=${bitDepth} colorType=${colorType} interlace=${interlace})`);
  }

  const idat = Buffer.concat(chunks.filter((c) => c.tipo === 'IDAT').map((c) => c.datos));
  const raw = inflateSync(idat);
  const bpp = 4;
  const stride = width * bpp;
  const data = new Uint8Array(width * height * bpp);

  for (let y = 0; y < height; y++) {
    const filtro = raw[y * (stride + 1)] ?? 0;
    const inicioFila = y * (stride + 1) + 1;
    for (let x = 0; x < stride; x++) {
      const valorFiltrado = raw[inicioFila + x] ?? 0;
      const izq = x >= bpp ? (data[y * stride + x - bpp] ?? 0) : 0;
      const arr = y > 0 ? (data[(y - 1) * stride + x] ?? 0) : 0;
      const arrIzq = y > 0 && x >= bpp ? (data[(y - 1) * stride + x - bpp] ?? 0) : 0;
      let recon: number;
      switch (filtro) {
        case 0: recon = valorFiltrado; break;
        case 1: recon = valorFiltrado + izq; break;
        case 2: recon = valorFiltrado + arr; break;
        case 3: recon = valorFiltrado + ((izq + arr) >> 1); break;
        case 4: recon = valorFiltrado + paeth(izq, arr, arrIzq); break;
        default: throw new Error(`Filtro PNG desconocido: ${filtro}`);
      }
      data[y * stride + x] = recon & 0xff;
    }
  }
  return { width, height, data };
}

function chunk(tipo: string, datos: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(datos.length, 0);
  const tipoBuf = Buffer.from(tipo, 'ascii');
  const cuerpo = Buffer.concat([tipoBuf, datos]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(cuerpo) >>> 0, 0);
  return Buffer.concat([len, cuerpo, crc]);
}

function codificarPng(img: Imagen): Buffer {
  const bpp = 4;
  const stride = img.width * bpp;
  const conFiltro = Buffer.alloc((stride + 1) * img.height);
  for (let y = 0; y < img.height; y++) {
    conFiltro[y * (stride + 1)] = 0; // filtro None
    Buffer.from(img.data.buffer, y * stride, stride).copy(conFiltro, y * (stride + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(img.width, 0);
  ihdr.writeUInt32BE(img.height, 4);
  ihdr.writeUInt8(8, 8); // bit depth
  ihdr.writeUInt8(6, 9); // color type RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(conFiltro, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// --------------------------------------------------------------------------
// Composición
// --------------------------------------------------------------------------

/** Lienzo `lado`×`lado` de color de fondo opaco con `logo` centrado ocupando `escala`. */
function componer(logo: Imagen, lado: number, escala: number, fondo: [number, number, number]): Imagen {
  const data = new Uint8Array(lado * lado * 4);
  for (let i = 0; i < lado * lado; i++) {
    data[i * 4] = fondo[0];
    data[i * 4 + 1] = fondo[1];
    data[i * 4 + 2] = fondo[2];
    data[i * 4 + 3] = 255;
  }
  const destino = Math.round(lado * escala);
  if (logo.width !== destino || logo.height !== destino) {
    throw new Error(`El logo reescalado mide ${logo.width}×${logo.height}, se esperaba ${destino}×${destino}`);
  }
  const offset = Math.round((lado - destino) / 2);
  for (let y = 0; y < destino; y++) {
    for (let x = 0; x < destino; x++) {
      const s = (y * destino + x) * 4;
      const a = (logo.data[s + 3] ?? 0) / 255;
      if (a === 0) continue;
      const d = ((y + offset) * lado + (x + offset)) * 4;
      for (let c = 0; c < 3; c++) {
        data[d + c] = Math.round((logo.data[s + c] ?? 0) * a + (data[d + c] ?? 0) * (1 - a));
      }
      data[d + 3] = 255;
    }
  }
  return { width: lado, height: lado, data };
}

function reescalar(destino: number): Imagen {
  const tmp = join(TMP, `r${destino}.png`);
  execFileSync('sips', ['-s', 'format', 'png', '-z', String(destino), String(destino), ORIGEN, '--out', tmp], {
    stdio: 'ignore',
  });
  return decodificarPng(tmp);
}

// --------------------------------------------------------------------------

if (!existsSync(ORIGEN)) throw new Error(`No existe ${ORIGEN}`);
rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });
mkdirSync(SALIDA, { recursive: true });

const objetivos = [
  // fichero, lado, escala del logo dentro del lienzo, fondo
  { nombre: 'icon-192.png', lado: 192, escala: 0.82 },
  { nombre: 'icon-512.png', lado: 512, escala: 0.82 },
  { nombre: 'icon-maskable-512.png', lado: 512, escala: 0.66 }, // zona segura maskable (~80% -> logo dentro del 66%)
  { nombre: 'apple-touch-icon.png', lado: 180, escala: 0.8 },
];

for (const o of objetivos) {
  const logo = reescalar(Math.round(o.lado * o.escala));
  const img = componer(logo, o.lado, o.escala, FONDO);
  writeFileSync(join(SALIDA, o.nombre), codificarPng(img));
  console.log(`  public/icons/${o.nombre}  (${o.lado}×${o.lado})`);
}

rmSync(TMP, { recursive: true, force: true });
console.log('Iconos PWA generados.');
