import mongoose, { Schema, model } from 'mongoose';
import { connectMongo } from '../db/mongo';
import { DEFAULT_RESTAURANT_ID } from '../auth';

const ItemSchema = new Schema(
  {
    name: { type: String, required: true },
    itemCode: { type: String, trim: true },
    qty: { type: Number, required: true, default: 1 },
    price: { type: Number, required: true, default: 0 }
  },
  { _id: false }
);

const OrderSchema = new Schema(
  {
    restaurantId: { type: String, required: true, index: true, default: DEFAULT_RESTAURANT_ID },
    orderNumber: { type: String, required: true, index: true },
    fulfillmentType: { type: String, enum: ['delivery', 'takeaway'], required: true, default: 'takeaway' },
    customerName: { type: String, trim: true },
    customerPhone: { type: String, trim: true, required: function(this: { fulfillmentType: string }) { return this.fulfillmentType === 'delivery'; } },
    deliveryAddress: { type: String, trim: true, required: function(this: { fulfillmentType: string }) { return this.fulfillmentType === 'delivery'; } },
    deliveryZoneId: { type: String, trim: true },
    deliveryZoneName: { type: String, trim: true },
    deliveryFee: { type: Number, min: 0, default: 0 },
    deliveryNotes: { type: String, trim: true, default: '' },
    driverPhone: { type: String, trim: true },
    driverId: { type: String, trim: true },
    driverName: { type: String, trim: true },
    driverAssignedAt: { type: Date },
    pickedUpAt: { type: Date },
    deliveredAt: { type: Date },
    driverMessageSentAt: { type: Date },
    customerMessageSentAt: { type: Date },
    isDemo: { type: Boolean, default: false },
    tableNumber: { type: Number, required: false, min: 1 },
    items: { type: [ItemSchema], required: true, default: [] },
    total: { type: Number, required: true, default: 0 },
    status: { type: String, required: true, default: 'pending' }
  },
  { timestamps: true }
);

// Ensure connection before accessing models in serverless / dev HMR
connectMongo().catch(() => {});

const Order = (mongoose.models && mongoose.models.Order) || model('Order', OrderSchema);

export default Order;
