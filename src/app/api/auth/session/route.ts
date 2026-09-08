import { cookies } from 'next/headers';
import { AUTH_COOKIE, isValidSession } from '../../../../lib/auth';

export async function GET() {
  const cookieStore = await cookies();
  return Response.json({ authenticated: isValidSession(cookieStore.get(AUTH_COOKIE)?.value) });
}
