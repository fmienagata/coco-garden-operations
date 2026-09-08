import mongoose, { Schema, model } from 'mongoose';

const OrderCounterSchema = new Schema({
  _id: { type: String, required: true },
  sequence: { type: Number, required: true, default: 0 },
});

const OrderCounter = (mongoose.models && mongoose.models.OrderCounter) || model('OrderCounter', OrderCounterSchema);

export default OrderCounter;