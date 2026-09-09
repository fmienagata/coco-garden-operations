import {withAudit} from '../../../lib/audit';
import {diningSession} from '../../../lib/dining';
import {userResponse} from '../../../lib/user-management';
import DiningTable from '../../../lib/models/DiningTable';
import Order from '../../../lib/models/Order';
import MenuItem from '../../../lib/models/MenuItem';
import Settlement from '../../../lib/models/Settlement';
async function get(){return userResponse(async()=>{const session=await diningSession();const scope={restaurantId:session.restaurantId};const [tables,open,recent,menu]=await Promise.all([DiningTable.find(scope).sort({number:1}).lean(),Order.find({...scope,fulfillmentType:'dine_in',diningClosed:{$ne:true},status:{$ne:'cancelled'}}).sort({createdAt:1}).lean(),Order.find({...scope,fulfillmentType:'dine_in',$or:[{diningClosed:true},{status:'cancelled'}]}).sort({createdAt:-1}).limit(50).lean(),MenuItem.find({...scope,active:true}).sort({category:1,sortOrder:1}).lean()]);const orders=[...open,...recent];const payments=await Settlement.find({...scope,orderId:{$in:orders.map(o=>String(o._id))}}).lean();return Response.json({tables,orders:orders.map(o=>({...o,payment:payments.find(p=>p.orderId===String(o._id))||null})),menu,role:session.role},{headers:{'Cache-Control':'no-store'}});});}
export const GET=withAudit('GET /api/salle',get);
