import mongoose, { Schema, model } from 'mongoose';
import { DEFAULT_RESTAURANT_ID } from '../auth';

const NotificationSchema = new Schema(
  {
    restaurantId: { type: String, required: true, index: true, default: DEFAULT_RESTAURANT_ID },
    orderId: { type: String, required: true, index: true },
    orderNumber: { type: String, required: true },
    channel: { type: String, enum: ['whatsapp'], required: true, default: 'whatsapp' },
    recipientType: { type: String, enum: ['driver', 'customer'], required: true },
    recipientPhone: { type: String, required: true },
    message: { type: String, required: true },
    status: { type: String, enum: ['pending', 'sent', 'failed'], required: true, default: 'pending' },
    sentAt: { type: Date },
    failedAt: { type: Date },
    error: { type: String, default: '' },
    attempts: { type: Number, default: 1 },
  },
  { timestamps: true },
);

const Notification = (mongoose.models && mongoose.models.Notification) || model('Notification', NotificationSchema);

export default Notification;
