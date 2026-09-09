import AuditEvent from '../../../lib/models/AuditEvent';
import { requireAdmin, userResponse, UserError } from '../../../lib/user-management';
import { withAudit, auditHealth } from '../../../lib/audit';
async function handleGET(request:Request) {
  return userResponse(async()=>{
    const session=await requireAdmin();
    const search=new URL(request.url).searchParams;
    const now=new Date();
    const from=search.get('from')?new Date(search.get('from')!):new Date(now.getTime()-24*60*60*1000);
    const to=search.get('to')?new Date(search.get('to')!):now;
    if(!Number.isFinite(from.getTime())||!Number.isFinite(to.getTime())||from>to||to.getTime()-from.getTime()>31*24*60*60*1000)throw new UserError('Choisissez une période valide de 31 jours maximum.');
    const page=Number(search.get('page')||1);
    if(!Number.isInteger(page)||page<1||page>10000)throw new UserError('Page invalide.');
    const query:Record<string,any>={restaurantId:session.restaurantId,occurredAt:{$gte:from,$lte:to}};
    const result=search.get('result');
    if(result){if(!['success','denied','failure'].includes(result))throw new UserError('Résultat invalide.');query.result=result;}
    const actorType=search.get('actorType');
    if(actorType){if(!['management','whatsapp_agent','unverified_agent','anonymous'].includes(actorType))throw new UserError('Acteur invalide.');query.actorType=actorType;}
    const operation=search.get('operation');
    if(operation){if(operation.length>120)throw new UserError('Opération invalide.');query.operation=operation;}
    const actor=search.get('actor');
    if(actor){if(actor.length>64)throw new UserError('Acteur invalide.');query.actor=actor;}
    const [events,total,summary,alerts,operations]=await Promise.all([
      AuditEvent.find(query).sort({occurredAt:-1,_id:-1}).skip((page-1)*25).limit(25).select('-restaurantId').lean(),
      AuditEvent.countDocuments(query),
      AuditEvent.aggregate([{$match:query},{$group:{_id:'$result',count:{$sum:1}}}]),
      AuditEvent.aggregate([{$match:{restaurantId:session.restaurantId,occurredAt:{$gte:new Date(now.getTime()-10*60*1000)},result:{$in:['denied','failure']}}},{$group:{_id:{actor:'$actor',actorType:'$actorType',operation:'$operation'},count:{$sum:1},lastAt:{$max:'$occurredAt'}}},{$match:{count:{$gte:5}}},{$sort:{count:-1}},{$limit:20}]),
      AuditEvent.distinct('operation',{restaurantId:session.restaurantId,occurredAt:{$gte:from,$lte:to}}),
    ]);
    return Response.json({events,total,page,pageSize:25,summary,alerts,operations:operations.sort(),health:auditHealth(),retentionDays:90,alertThreshold:5,alertWindowMinutes:10},{headers:{'Cache-Control':'no-store'}});
  });
}
export const GET=withAudit('GET /api/audit',handleGET);
