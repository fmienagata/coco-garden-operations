import mongoose, { Schema } from 'mongoose';
// One document per order makes receipt and refund declarations atomic and idempotent.
const schema = new Schema({
  _id: { type: String, required: true },
  restaurantId: { type: String, required: true, index: true },
  orderId: { type: String, required: true },
  amount: Number,
  method: { type: String, enum: ['cash', 'mobile_money', 'card', 'transfer'] },
  paidAt: Date, paidBy: String,
  refundedAt: Date, refundedBy: String, refundReason: String,
  collectedAt: Date, collectedBy: String,
}, { timestamps: true });
export default mongoose.models.Settlement || mongoose.model('Settlement', schema);
