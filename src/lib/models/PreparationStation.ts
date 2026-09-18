import mongoose, { Schema, model } from 'mongoose';

/**
 * Un poste de préparation est une destination : la cuisine chaude, le bar, la pâtisserie.
 *
 * Chaque poste reçoit les lignes qui le concernent, et rien d'autre — une bière n'a pas à
 * s'imprimer en cuisine. Sa destination est un écran, une imprimante, ou les deux : c'est
 * un réglage par établissement, jamais une hypothèse codée en dur, puisque certains
 * clients n'auront qu'une imprimante et d'autres qu'une tablette.
 */
const PreparationStationSchema = new Schema(
  {
    restaurantId: { type: String, required: true, index: true },
    name: { type: String, required: true, trim: true },
    destination: { type: String, enum: ['ecran', 'imprimante', 'les_deux'], required: true, default: 'ecran' },
    // Catégories de la carte dirigées vers ce poste. Vide sur le poste par défaut, qui
    // récupère tout ce qui n'est explicitement adressé nulle part.
    categories: { type: [String], default: [] },
    isDefault: { type: Boolean, default: false },
    // Imprimante réseau ESC/POS, relevée par l'agent local du poste caisse.
    printerHost: { type: String, trim: true, default: '' },
    printerPort: { type: Number, default: 9100 },
    // Largeur du papier en caractères : 42 sur un rouleau 80 mm, 32 sur un 58 mm.
    printerWidth: { type: Number, default: 42 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

PreparationStationSchema.index({ restaurantId: 1, name: 1 }, { unique: true });

const PreparationStation =
  (mongoose.models && mongoose.models.PreparationStation) || model('PreparationStation', PreparationStationSchema);
export default PreparationStation;
