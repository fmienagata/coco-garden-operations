import { cookies } from 'next/headers';
import { AUTH_COOKIE, createSession, credentialsAreValid, DEFAULT_RESTAURANT_ID } from '../../../../lib/auth';

export async function POST(request: Request) {
  const { login, password } = await request.json();
  if (typeof login !== 'string' || typeof password !== 'string' || !credentialsAreValid(login, password)) {
    return Response.json({ error: 'Identifiants invalides' }, { status: 401 });
  }

  const cookieStore = await cookies();
  cookieStore.set(AUTH_COOKIE, createSession(login, DEFAULT_RESTAURANT_ID), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 8 * 60 * 60,
    path: '/',
  });
  return Response.json({ success: true });
}