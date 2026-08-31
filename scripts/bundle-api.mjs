// Empaqueta api/_router-src.ts en un único api/router.js autocontenido.
//
// Por qué: Vercel Hobby limita a 12 funciones/deploy, así que toda la API va
// en una sola función (el router). Su runtime Node en ESM estricto necesita
// extensiones en los imports relativos y `with { type: 'json' }` — cosas que
// el tsc del proyecto (moduleResolution: bundler) no emite. esbuild resuelve
// todo eso inlineando: un fichero, sin imports relativos, sin JSON externo.
//
// api/router.js está en .gitignore — lo produce `npm run build`.
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');

await build({
  entryPoints: [join(raiz, 'api/_router-src.ts')],
  outfile: join(raiz, 'api/router.js'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  loader: { '.json': 'json' },
  logLevel: 'info',
  // Node built-ins quedan externos (correcto). Todo lo demás —incluidas las
  // dependencias npm (@turf/circle, rbush)— se inlinea.
});

console.log('api/router.js generado.');
