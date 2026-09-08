import mongoose, { Schema, model } from 'mongoose';
import { DEFAULT_RESTAURANT_ID } from '../auth';

const DriverSchema = new Schema(
  {
    restaurantId: { type: String, required: true, index: true, default: DEFAULT_RESTAURANT_ID },
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    active: { type: Boolean, default: true },
    available: { type: Boolean, default: true },
  },
  { timestamps: true },
);

const Driver = (mongoose.models && mongoose.models.Driver) || model('Driver', DriverSchema);

export default Driver;