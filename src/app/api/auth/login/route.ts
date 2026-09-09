import { withAudit } from '../../../../lib/audit';
import { cookies } from 'next/headers';
import { AUTH_COOKIE, createSession, DEFAULT_RESTAURANT_ID } from '../../../../lib/auth';
import User from '../../../../lib/models/User';
import { connectMongo } from '../../../../lib/db/mongo';
import { verifyPassword } from '../../../../lib/passwords';
async function handlePOST(request: Request) {
  const body=await request.json().catch(()=>null);
  if (!body || typeof body.login !== 'string' || typeof body.password !== 'string') return Response.json({error:'Identifiants invalides'},{status:401});
  try {
    await connectMongo();
    const user=await User.findOne({restaurantId:DEFAULT_RESTAURANT_ID,login:body.login.trim(),active:true,deletedAt:null,authType:{$ne:'api_token'}}).select('+passwordHash').lean() as any;
    if (!user || !verifyPassword(body.password,user.passwordHash)) return Response.json({error:'Identifiants invalides'},{status:401});
    (await cookies()).set(AUTH_COOKIE,createSession(user.login,user.restaurantId,user.role,user.sessionVersion || 0),{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV === 'production',maxAge:8*60*60,path:'/'});
    return Response.json({success:true});
  } catch { return Response.json({error:'Connexion temporairement indisponible.'},{status:503}); }
}

export const POST = withAudit("POST /api/auth/login", handlePOST);
