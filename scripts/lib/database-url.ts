/**
 * Work out the Postgres connection string.
 *
 * Assembling it from parts removes two failure modes that are easy to hit and
 * confusing to diagnose:
 *
 *   - URL-encoding. A database password containing @ : / ? # or % breaks a
 *     hand-pasted URI in a way that looks like a wrong password.
 *   - The IPv6-only direct host. `db.<ref>.supabase.co` resolves to AAAA only,
 *     so on an IPv4 network it fails with ENOTFOUND. The Session pooler works
 *     over IPv4.
 *
 * A complete DATABASE_URL still wins when one is set.
 */

const PLACEHOLDER = /\[.*\]|your[-_]?password|<.*>/i;

export interface DatabaseUrlResult {
  url: string | null;
  /** Vietnamese explanation of what to fix, when the url is null. */
  problem?: string;
}

export function resolveDatabaseUrl(env: NodeJS.ProcessEnv = process.env): DatabaseUrlResult {
  const direct = env.DATABASE_URL?.trim();

  if (direct) {
    const password = /postgres(?:ql)?:\/\/[^:]+:([^@]*)@/.exec(direct)?.[1] ?? '';

    if (PLACEHOLDER.test(password)) {
      return {
        url: null,
        problem:
          'DATABASE_URL còn chứa mật khẩu mẫu (dạng [YOUR-PASSWORD] hoặc dấu *). ' +
          'Trên Supabase bạn phải bấm "Reveal"/"Copy" sau khi hiện mật khẩu thật, ' +
          'hoặc đặt lại mật khẩu ở Project Settings → Database → Reset database password.',
      };
    }

    if (/@db\.[a-z0-9]+\.supabase\.co/.test(direct)) {
      return {
        url: null,
        problem:
          'DATABASE_URL đang dùng host trực tiếp db.<ref>.supabase.co, mà host này chỉ có ' +
          'địa chỉ IPv6 — mạng IPv4 sẽ báo ENOTFOUND. Hãy dùng Session pooler: ' +
          'Project Settings → Database → Connection string → tab "Session pooler".',
      };
    }

    return { url: direct };
  }

  // Assemble from parts: the path that cannot be mis-encoded.
  const ref = env.SUPABASE_PROJECT_REF?.trim();
  const password = env.SUPABASE_DB_PASSWORD;
  const region = env.SUPABASE_REGION?.trim() || 'ap-southeast-1';

  if (!ref || !password) return { url: null };

  if (PLACEHOLDER.test(password)) {
    return {
      url: null,
      problem: 'SUPABASE_DB_PASSWORD vẫn là mật khẩu mẫu, chưa phải mật khẩu thật.',
    };
  }

  return {
    url:
      `postgresql://postgres.${ref}:${encodeURIComponent(password)}` +
      `@aws-0-${region}.pooler.supabase.com:5432/postgres?sslmode=require`,
  };
}
