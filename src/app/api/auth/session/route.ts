import { withAudit } from '../../../../lib/audit';
import { cookies } from 'next/headers';
import { AUTH_COOKIE } from "../../../../lib/auth";
import { getSession } from "../../../../lib/server-session";

async function handleGET() {
  const cookieStore = await cookies();
  const session = (await getSession(cookieStore.get(AUTH_COOKIE)?.value));
  return Response.json({ authenticated: Boolean(session), role: session?.role || null, login: session?.login || null });
}

export const GET = withAudit("GET /api/auth/session", handleGET);
