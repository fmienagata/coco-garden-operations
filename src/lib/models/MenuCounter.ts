import mongoose, { Schema, model } from 'mongoose';

const MenuCounterSchema = new Schema({
  _id: { type: String, required: true },
  sequence: { type: Number, required: true, default: 0 },
});

const MenuCounter = (mongoose.models && mongoose.models.MenuCounter) || model('MenuCounter', MenuCounterSchema);

export default MenuCounter;
