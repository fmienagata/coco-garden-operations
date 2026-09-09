import { cookies } from 'next/headers';
import { AUTH_COOKIE, DEFAULT_RESTAURANT_ID } from './auth';
import { getSession, isWhatsappAgentRequest } from './server-session';
import { connectMongo } from './db/mongo';
import AuditEvent from './models/AuditEvent';

type Identity = {restaurantId:string;actor:string;actorType:'management'|'whatsapp_agent'|'unverified_agent'|'anonymous'};
let lastWriteFailure: number | null = null;
export function auditHealth() { return {lastWriteFailure: lastWriteFailure ? new Date(lastWriteFailure).toISOString() : null}; }
async function identity(request: Request, operation: string): Promise<Identity> {
  // Never persist untrusted headers, attempted logins, request bodies or URLs.
  const fallback: Identity={restaurantId:DEFAULT_RESTAURANT_ID,actor:'anonymous',actorType:'anonymous'};
  try {
    if (request.headers.has('x-whatsapp-agent-token')) {
      if (operation === 'POST /api/orders' && await isWhatsappAgentRequest(request)) return {...fallback,actor:'whatsapp-agent',actorType:'whatsapp_agent'};
      const session=await getSession((await cookies()).get(AUTH_COOKIE)?.value);
      if(session) return {restaurantId:session.restaurantId,actor:session.login,actorType:'management'};
      return {...fallback,actor:'unverified-agent',actorType:'unverified_agent'};
    }
    const session=await getSession((await cookies()).get(AUTH_COOKIE)?.value);
    if(session) return {restaurantId:session.restaurantId,actor:session.login,actorType:'management'};
  } catch { /* Authentication and database errors must not reveal input. */ }
  return fallback;
}
async function record(who:Identity,operation:string,status:number) {
  try {
    await connectMongo();
    const event = await AuditEvent.create({restaurantId:who.restaurantId,actor:who.actor,actorType:who.actorType,operation,status,result:status<400?'success':status===401||status===403?'denied':'failure',occurredAt:new Date()});
    return String(event._id);
  } catch {
    lastWriteFailure=Date.now();
    console.error('AUDIT_WRITE_FAILED');
  }
}
export function withAudit<Args extends any[]>(operation:string, handler:(...args:Args)=>Promise<Response>) {
  return async (...args:Args):Promise<Response> => {
    const request=args[0] instanceof Request ? args[0] : new Request('http://internal.invalid');
    let who=await identity(request,operation);
    let response:Response;
    try { response=await handler(...args); }
    catch { response=Response.json({error:'Erreur interne. Veuillez réessayer.'},{status:500}); }
    if(operation==='POST /api/auth/login') {
      who=response.ok ? await identity(request,operation) : {restaurantId:DEFAULT_RESTAURANT_ID,actor:'anonymous',actorType:'anonymous'};
    }
    // Successful polling reads are excluded; failed reads and every mutation are recorded.
    if(!operation.startsWith('GET ') || response.status>=400) {
      const eventId=await record(who,operation,response.status);
      if(eventId) response.headers.set('X-Audit-Event-Id',eventId);
    }
    return response;
  };
}
