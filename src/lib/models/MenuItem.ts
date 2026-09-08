import mongoose, { Schema, model } from 'mongoose';
import { DEFAULT_RESTAURANT_ID } from '../auth';

const MenuItemSchema = new Schema(
  {
    restaurantId: { type: String, required: true, index: true, default: DEFAULT_RESTAURANT_ID },
    itemCode: { type: String, required: true, index: true },
    category: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: '' },
    price: { type: Number, required: true, min: 0 },
    variants: { type: [{ label: { type: String, required: true }, price: { type: Number, required: true, min: 0 } }], default: [] },
    imageUrl: { type: String, trim: true, default: '' },
    active: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true },
);

const MenuItem = (mongoose.models && mongoose.models.MenuItem) || model('MenuItem', MenuItemSchema);

export default MenuItem;
