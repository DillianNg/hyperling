/**
 * Supabase row casting, in one place.
 *
 * Without generated database types, PostgREST responses come back as a union
 * that includes an error shape, so every query would otherwise need its own
 * double cast. These two helpers keep that in a single file where the shapes
 * being asserted are visible, rather than scattered across the data layer.
 *
 * Each caller still declares the row interface it expects, so the assertion is
 * checked against something written down rather than against `any`.
 */

export function rows<T>(data: unknown): T[] {
  return Array.isArray(data) ? (data as T[]) : [];
}

export function row<T>(data: unknown): T | null {
  return data === null || data === undefined ? null : (data as T);
}
