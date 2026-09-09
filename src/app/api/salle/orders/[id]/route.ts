import {withAudit} from '../../../../../lib/audit';
import {diningSession,objectId,priceItems,details,payDining} from '../../../../../lib/dining';
import {userResponse,readBody,UserError} from '../../../../../lib/user-management';
import Order from '../../../../../lib/models/Order';
import DiningTable from '../../../../../lib/models/DiningTable';
async function change(request:Request,context:{params:Promise<{id:string}>}){return userResponse(async()=>{const s=await diningSession();const {id}=await context.params;const order=await Order.findOne({_id:objectId(id),restaurantId:s.restaurantId,fulfillmentType:'dine_in'}).lean() as any;if(!order)throw new UserError('Ticket introuvable.',404);const b=await readBody(request);if(b.action==='pay'){if(b.confirmed!==true)throw new UserError('Confirmez le paiement reçu.');return Response.json(await payDining(order,s,b.method));}if(!Number.isInteger(b.version)||b.version!==order.__v)throw new UserError('Ce ticket a changé. Actualisez avant de réessayer.',409);let changes:any;
if(b.action==='edit'){if(order.status!=='draft')throw new UserError('Seul un brouillon peut être modifié.',409);const info=details(b);const table=await DiningTable.findOne({_id:order.diningTableId,restaurantId:s.restaurantId});if(!table||info.covers>table.capacity)throw new UserError('Capacité de table dépassée.');const items=await priceItems(s.restaurantId,b.items);changes={...info,items,total:items.reduce((n:number,i:any)=>n+i.price*i.qty,0)};}
else if(b.action==='send'){if(order.status!=='draft')throw new UserError('Ticket déjà envoyé.',409);changes={status:'confirmed'};}
else if(b.action==='serve'){if(order.status!=='ready')throw new UserError('La cuisine doit terminer la préparation.',409);changes={status:'served',servedAt:new Date()};}
else if(b.action==='cancel'){if(!['draft','confirmed'].includes(order.status))throw new UserError('Annulation possible seulement avant la préparation.',409);if(typeof b.reason!=='string'||b.reason.trim().length<3||b.reason.length>300)throw new UserError('Indiquez un motif (3 à 300 caractères).');changes={status:'cancelled',diningClosed:true,cancellationReason:b.reason.trim()};}
else throw new UserError('Action invalide.');
const updated=await Order.findOneAndUpdate({_id:order._id,restaurantId:s.restaurantId,__v:b.version,status:order.status},{$set:changes,$inc:{__v:1}},{new:true});if(!updated)throw new UserError('Modification concurrente. Actualisez.',409);return Response.json(updated);});}
export const PATCH=withAudit('PATCH /api/salle/orders/[id]',change);
