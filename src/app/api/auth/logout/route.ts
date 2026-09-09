import { withAudit } from '../../../../lib/audit';
import { cookies } from 'next/headers';
import { AUTH_COOKIE } from '../../../../lib/auth';

async function handlePOST() {
  const cookieStore = await cookies();
  cookieStore.delete(AUTH_COOKIE);
  return Response.json({ success: true });
}

export const POST = withAudit("POST /api/auth/logout", handlePOST);
