import MenuCounter from './models/MenuCounter';

export async function getNextMenuCode(restaurantId: string) {
  const counter = await MenuCounter.findOneAndUpdate(
    { _id: restaurantId },
    { $inc: { sequence: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  ).lean() as { sequence: number } | null;
  if (!counter) throw new Error('Unable to allocate a menu code');
  return `PLT-${String(counter.sequence).padStart(5, '0')}`;
}