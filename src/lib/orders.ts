import OrderCounter from './models/OrderCounter';

export async function getNextOrderNumber(restaurantId: string) {
  const counter = await OrderCounter.findOneAndUpdate(
    { _id: restaurantId },
    { $inc: { sequence: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  ).lean() as { sequence: number } | null;
  if (!counter) throw new Error('Unable to allocate an order number');
  return `CMD-${String(counter.sequence).padStart(5, '0')}`;
}