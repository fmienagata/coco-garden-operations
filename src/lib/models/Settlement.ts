import mongoose, { Schema } from 'mongoose';
// One document per order makes receipt and refund declarations atomic and idempotent.
const schema = new Schema(
  {
    _id: { type: String, required: true },
    restaurantId: { type: String, required: true, index: true },
    orderId: { type: String, required: true },
    amount: Number,
    method: { type: String, enum: ['cash', 'mobile_money', 'card', 'transfer'] },
    paidAt: Date,
    paidBy: String,
    refundedAt: Date,
    refundedBy: String,
    refundReason: String,
    collectedAt: Date,
    collectedBy: String,
  },
  { timestamps: true },
);
// Le rapprochement part soit de la commande, soit de la date de mouvement.
schema.index({ restaurantId: 1, orderId: 1 });
schema.index({ restaurantId: 1, paidAt: 1 });
schema.index({ restaurantId: 1, refundedAt: 1 });
schema.index({ restaurantId: 1, collectedAt: 1 });

export default mongoose.models.Settlement || mongoose.model('Settlement', schema);
