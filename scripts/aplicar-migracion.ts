/**
 * Aplica las migraciones SQL de scripts/migrations/*.sql contra Neon
 * (ADR-006), en orden de nombre de fichero, registrando cuáles ya se
 * aplicaron en `schema_migrations` para no repetirlas. Uso:
 *
 *   npx tsx scripts/aplicar-migracion.ts
 *
 * Necesita DATABASE_URL en el entorno (ver .env.local / .env.example).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { neon } from '@neondatabase/serverless';

const DIR = join(import.meta.dirname, 'migrations');

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('Falta DATABASE_URL en el entorno.');
  const sql = neon(url);

  await sql`
    create table if not exists schema_migrations (
      nombre text primary key,
      aplicada_en timestamptz not null default now()
    )
  `;

  const aplicadas = new Set((await sql`select nombre from schema_migrations`).map((r: any) => r.nombre));
  const ficheros = readdirSync(DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const fichero of ficheros) {
    if (aplicadas.has(fichero)) {
      console.log(`= ${fichero} (ya aplicada, se salta)`);
      continue;
    }
    const texto = readFileSync(join(DIR, fichero), 'utf8');
    console.log(`> aplicando ${fichero}...`);
    // El driver HTTP de Neon ejecuta una sentencia por petición — se separa
    // por ';' (seguro aquí: DDL/INSERT simples, sin cuerpos con ';' embebido).
    // Se despoja cada trozo de sus líneas de comentario ANTES de decidir si
    // está vacío — un trozo puede empezar con un comentario de cabecera y
    // aun así contener la sentencia real más abajo (bug real encontrado al
    // verificar en vivo: el primer `create table` se descartaba entero).
    const sentencias = texto
      .split(';')
      .map((bloque) =>
        bloque
          .split('\n')
          .filter((linea) => !linea.trim().startsWith('--'))
          .join('\n')
          .trim(),
      )
      .filter((s) => s.length > 0);
    for (const sentencia of sentencias) {
      await sql.query(sentencia);
    }
    await sql`insert into schema_migrations (nombre) values (${fichero})`;
    console.log(`✓ ${fichero}`);
  }
  console.log('Migraciones al día.');
}

main().catch((err) => {
  console.error('ERROR aplicando migraciones:', err);
  process.exit(1);
});
