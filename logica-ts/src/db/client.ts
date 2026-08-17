/**
 * Conexão com o banco (Drizzle).
 * - Sem DATABASE_URL  → PGlite (Postgres embarcado, persistido em data/pg). Zero setup.
 * - Com DATABASE_URL  → postgres.js apontando para um Postgres/Neon real.
 * A API é a mesma nos dois casos — troca só por variável de ambiente.
 */
import { drizzle as drizzlePglite, type PgliteDatabase } from 'drizzle-orm/pglite';
import { drizzle as drizzlePg } from 'drizzle-orm/postgres-js';
import { PGlite } from '@electric-sql/pglite';
import postgres from 'postgres';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as schema from './schema.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PG_DIR = path.resolve(__dirname, '../../data/pg');

export const usandoPostgres = Boolean(process.env.DATABASE_URL);

// Garante a pasta do PGlite (ele cria a datadir de forma não-recursiva).
if (!usandoPostgres) fs.mkdirSync(PG_DIR, { recursive: true });

// Runtime idêntico nas duas engines; tipamos como PgliteDatabase para queries tipadas.
export const db = (
  usandoPostgres
    ? drizzlePg(postgres(process.env.DATABASE_URL as string), { schema })
    : drizzlePglite(new PGlite(PG_DIR), { schema })
) as unknown as PgliteDatabase<typeof schema>;

export { schema };
