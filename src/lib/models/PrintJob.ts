import mongoose, { Schema } from 'mongoose';

/**
 * Un bon à imprimer pour un poste de préparation.
 *
 * L'identifiant est déterministe — `<restaurantId>:<orderId>:<stationId>` — comme pour
 * `Settlement` et `Operation`. Un ticket envoyé deux fois, ou rejoué après une coupure,
 * ne peut donc pas produire deux bons : la cuisine préparerait le plat en double.
 *
 * L'agent d'impression réclame un bon avant de l'imprimer. Deux agents branchés par
 * erreur sur la même imprimante ne sortiront pas le même bon deux fois.
 */
const PrintJobSchema = new Schema({
  _id: { type: String, required: true },
  restaurantId: { type: String, required: true, index: true },
  stationId: { type: String, required: true },
  stationName: { type: String, required: true },
  orderId: { type: String, required: true },
  orderNumber: { type: String, required: true },
  printerHost: { type: String, default: '' },
  printerPort: { type: Number, default: 9100 },
  lines: { type: [{ text: String, style: String }], default: [] },
  status: { type: String, enum: ['pending', 'claimed', 'printed', 'failed'], required: true, default: 'pending' },
  attempts: { type: Number, default: 0 },
  claimedBy: { type: String, default: null },
  claimedAt: { type: Date, default: null },
  printedAt: { type: Date, default: null },
  lastError: { type: String, default: null },
}, { timestamps: true });

PrintJobSchema.index({ restaurantId: 1, status: 1, createdAt: 1 });

const PrintJob = (mongoose.models && mongoose.models.PrintJob) || mongoose.model('PrintJob', PrintJobSchema);
export default PrintJob;
