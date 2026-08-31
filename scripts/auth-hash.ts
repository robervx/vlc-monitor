// Genera la entrada {u,h,s} para APP_USERS (spec 018 §2) sin que el PIN
// aparezca en el histórico de shell.
//
//   npm run auth:hash -- <usuario>
//
// Pide el PIN por stdin (sin eco), aplica el mismo PBKDF2 que el runtime
// (importado de api/_shared/auth.ts para que los parámetros no se desincronicen)
// y escribe el objeto JSON listo para pegar en la variable APP_USERS de Vercel.
import { createInterface } from 'node:readline';
import { pbkdf2 } from '../src/server/_shared/auth';

const usuario = process.argv[2];
if (!usuario || !/^[a-zA-Z0-9_-]{2,32}$/.test(usuario)) {
  console.error('Uso: npm run auth:hash -- <usuario>   (2-32 chars: letras, números, - y _)');
  process.exit(1);
}

function preguntarOculto(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const rlAny = rl as unknown as { _writeToOutput: (s: string) => void };
    const original = rlAny._writeToOutput.bind(rl);
    rlAny._writeToOutput = (s: string) => {
      if (s.includes(prompt) || s === '\n' || s === '\r\n') original(s);
      // el resto (los caracteres tecleados) no se imprime
    };
    rl.question(prompt, (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer.trim());
    });
  });
}

const pin = await preguntarOculto('PIN (mínimo 6 dígitos): ');
if (!/^\d{6,}$/.test(pin)) {
  console.error('\nEl PIN debe ser numérico y de al menos 6 dígitos (ver spec 018 §7).');
  process.exit(1);
}

const salt = [...crypto.getRandomValues(new Uint8Array(16))]
  .map((b) => b.toString(16).padStart(2, '0'))
  .join('');
const h = await pbkdf2(pin, salt);

console.log('\nAñade este objeto al array de la variable APP_USERS en Vercel:\n');
console.log('  ' + JSON.stringify({ u: usuario, h, s: salt }));
console.log('\nEjemplo de APP_USERS con dos accesos:');
console.log('  [' + JSON.stringify({ u: usuario, h, s: salt }) + ',{"u":"turno-noche","h":"...","s":"..."}]');
