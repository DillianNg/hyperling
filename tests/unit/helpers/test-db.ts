import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const MIGRATIONS_DIR = join(ROOT, 'supabase', 'migrations');

/**
 * Minimal stand-in for the parts of Supabase the migrations depend on:
 * the `auth` schema, an `auth.users` table, `auth.uid()` with Supabase's own
 * definition, and the `anon` / `authenticated` roles.
 *
 * Running the real migration files against real Postgres (PGlite is Postgres
 * compiled to WASM) is what makes the RLS tests meaningful: they exercise the
 * policies that will be deployed, not a reimplementation of them.
 */
const SUPABASE_SHIM = `
create schema if not exists auth;

create table auth.users (
  id    uuid primary key default gen_random_uuid(),
  email text unique
);

-- Same definition Supabase ships: read the subject claim off the request.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

create role anon nologin;
create role authenticated nologin;
grant usage on schema public to anon, authenticated;
grant usage on schema auth to anon, authenticated;
grant select on auth.users to authenticated;
`;

export interface TestDb {
  db: PGlite;
  /** Create a user the way Supabase Auth would, firing the profile trigger. */
  createUser(email: string): Promise<string>;
  /** Run `fn` as that signed-in user, with RLS applied exactly as in production. */
  asUser<T>(userId: string, fn: () => Promise<T>): Promise<T>;
  /** Run `fn` as an anonymous visitor. */
  asAnon<T>(fn: () => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export async function createTestDb(): Promise<TestDb> {
  const db = await PGlite.create();
  await db.exec(SUPABASE_SHIM);

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  if (files.length === 0) throw new Error(`Không tìm thấy migration nào trong ${MIGRATIONS_DIR}`);

  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    try {
      await db.exec(sql);
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : String(cause);
      throw new Error(`Migration ${file} thất bại: ${reason}`);
    }
  }

  async function withRole<T>(role: 'anon' | 'authenticated', userId: string | null, fn: () => Promise<T>): Promise<T> {
    // set_config(..., true) scopes the claim to the transaction-less session;
    // reset afterwards so one test cannot leak identity into the next.
    if (userId) await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [userId]);
    await db.exec(`set role ${role};`);
    try {
      return await fn();
    } finally {
      await db.exec('reset role;');
      await db.query(`select set_config('request.jwt.claim.sub', '', false)`);
    }
  }

  return {
    db,
    async createUser(email: string): Promise<string> {
      const result = await db.query<{ id: string }>(
        'insert into auth.users (email) values ($1) returning id',
        [email],
      );
      const id = result.rows[0]?.id;
      if (!id) throw new Error(`Không tạo được user ${email}`);
      return id;
    },
    asUser(userId, fn) {
      return withRole('authenticated', userId, fn);
    },
    asAnon(fn) {
      return withRole('anon', null, fn);
    },
    async close() {
      await db.close();
    },
  };
}
