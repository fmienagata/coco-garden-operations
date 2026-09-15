import mongoose, { Schema, model } from 'mongoose';
import { DEFAULT_RESTAURANT_ID } from '../auth';

// Un poste est une identité durable : c'est lui qui portera sa plage de numéros
// et qui signera les opérations produites pendant une coupure réseau.
const DeviceSchema = new Schema(
  {
    restaurantId: { type: String, required: true, index: true, default: DEFAULT_RESTAURANT_ID },
    name: { type: String, required: true, trim: true },
    kind: { type: String, enum: ['caisse', 'salle', 'cuisine'], required: true, default: 'salle' },
    // Préfixe court qui désambiguïse les numéros émis hors ligne par deux postes à la fois.
    numberPrefix: { type: String, required: true, trim: true, uppercase: true },
    // Jeton aléatoire de 256 bits : SHA-256 suffit et reste utilisable à chaque requête,
    // contrairement à scrypt réservé aux secrets à faible entropie.
    tokenHash: { type: String, required: true, select: false },
    active: { type: Boolean, default: true },
    lastSeenAt: { type: Date, default: null },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

DeviceSchema.index({ restaurantId: 1, numberPrefix: 1 }, { unique: true });
DeviceSchema.index({ tokenHash: 1 });

const Device = (mongoose.models && mongoose.models.Device) || model('Device', DeviceSchema);
export default Device;
