import mongoose, { Schema, model } from 'mongoose';
import { DEFAULT_RESTAURANT_ID } from '../auth';

const DeliveryZoneSchema = new Schema(
  {
    restaurantId: { type: String, required: true, index: true, default: DEFAULT_RESTAURANT_ID },
    name: { type: String, required: true, trim: true },
    fee: { type: Number, required: true, min: 0 },
    active: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true },
);

const DeliveryZone = (mongoose.models && mongoose.models.DeliveryZone) || model('DeliveryZone', DeliveryZoneSchema);
export default DeliveryZone;