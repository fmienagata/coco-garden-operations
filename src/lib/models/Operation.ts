import mongoose, { Schema } from 'mongoose';

// Une opération est un geste métier produit par un poste, éventuellement hors ligne,
// puis rejoué au serveur. L'identifiant déterministe rend le rejeu inoffensif : la même
// opération réémise dix fois ne s'applique qu'une seule fois.
//
// Un refus est enregistré au même titre qu'une réussite. Sans cela, une opération
// devenue impossible — un ticket déjà encaissé, par exemple — serait rejouée
// indéfiniment par un poste qui n'obtient jamais de réponse définitive.
const OperationSchema = new Schema(
  {
    _id: { type: String, required: true },
    restaurantId: { type: String, required: true, index: true },
    deviceId: { type: String, required: true },
    actor: { type: String, required: true },
    opId: { type: String, required: true },
    type: { type: String, required: true },
    status: { type: String, enum: ['applied', 'rejected'], required: true },
    resultId: { type: String, default: null },
    resultNumber: { type: String, default: null },
    error: { type: String, default: null },
    producedAt: { type: Date, default: null },
    appliedAt: { type: Date, required: true },
  },
  { timestamps: true },
);

OperationSchema.index({ restaurantId: 1, appliedAt: -1 });

const Operation = (mongoose.models && mongoose.models.Operation) || mongoose.model('Operation', OperationSchema);
export default Operation;
