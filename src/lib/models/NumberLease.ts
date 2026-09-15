import mongoose, { Schema, model } from 'mongoose';

// Un bail est une plage de numéros concédée à un poste pendant qu'il est connecté,
// pour qu'il puisse continuer à émettre des commandes pendant une coupure.
// Les plages sont disjointes par construction : elles viennent du même compteur atomique
// que la numérotation en ligne, ce qui garantit l'unicité sans coordination.
const NumberLeaseSchema = new Schema(
  {
    restaurantId: { type: String, required: true, index: true },
    deviceId: { type: String, required: true, index: true },
    prefix: { type: String, required: true },
    start: { type: Number, required: true },
    end: { type: Number, required: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

NumberLeaseSchema.index({ restaurantId: 1, deviceId: 1, start: 1 });

const NumberLease = (mongoose.models && mongoose.models.NumberLease) || model('NumberLease', NumberLeaseSchema);
export default NumberLease;
