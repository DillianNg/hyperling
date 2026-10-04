import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/lib/db/schema.ts',
  out: './supabase/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? '',
  },
  // Supabase owns these schemas; Drizzle must never try to manage them.
  schemaFilter: ['public'],
  verbose: true,
  strict: true,
});
