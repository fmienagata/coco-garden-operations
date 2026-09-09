import { withAudit } from '../../../../lib/audit';
import { cookies } from 'next/headers';
import Order from '../../../../lib/models/Order';
import Driver from '../../../../lib/models/Driver';
import { connectMongo } from '../../../../lib/db/mongo';
import { AUTH_COOKIE } from "../../../../lib/auth";
import { getSession } from "../../../../lib/server-session";

const transitions: Record<string, { status: string; field?: string }> = {
  assign: { status: 'driver_assigned', field: 'driverAssignedAt' },
  pickup: { status: 'in_delivery', field: 'pickedUpAt' },
  deliver: { status: 'delivered', field: 'deliveredAt' },
};

async function handlePOST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const cookieStore = await cookies();
  const session = (await getSession(cookieStore.get(AUTH_COOKIE)?.value));
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const { action, driverId } = await request.json();
  const transition = transitions[action];
  if (!transition) return Response.json({ error: 'Invalid delivery action' }, { status: 400 });
  await connectMongo();
  const { id } = await params;
  const order = await Order.findOne({ _id: id, restaurantId: session.restaurantId, fulfillmentType: 'delivery' });
  if (!order) return Response.json({ error: 'Delivery order not found' }, { status: 404 });
  if (action === 'assign') {
    const driver = await Driver.findOne({ _id: driverId, restaurantId: session.restaurantId, active: true, available: true });
    if (!driver) return Response.json({ error: 'Active driver not found' }, { status: 400 });
    if (order.status !== 'ready') return Response.json({ error: 'Only ready orders can be assigned' }, { status: 409 });
    order.driverId = String(driver._id); order.driverName = driver.name; order.driverPhone = driver.phone;
  } else if ((action === 'pickup' && order.status !== 'driver_assigned') || (action === 'deliver' && order.status !== 'in_delivery')) {
    return Response.json({ error: 'Invalid delivery transition' }, { status: 409 });
  }
  order.status = action === 'deliver' ? 'completed' : transition.status;
  if (action === 'deliver') order.completedAt = new Date();
  (order as unknown as Record<string, unknown>)[transition.field!] = new Date();
  await order.save();
  return Response.json(order.toObject());
}

export const POST = withAudit("POST /api/delivery/[id]", handlePOST);
