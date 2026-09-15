import mongoose, { Schema, model } from 'mongoose';
import { DEFAULT_RESTAURANT_ID } from '../auth';

const UserSchema = new Schema({
  restaurantId: { type: String, required: true, index: true, default: DEFAULT_RESTAURANT_ID },
  login: { type: String, required: true, trim: true },
  authType: { type: String, enum: ['password', 'api_token'], default: 'password' },
  passwordHash: { type: String, required: function (this: { authType?: string }): boolean { return this.authType !== 'api_token'; }, select: false },
  name: { type: String, required: true, trim: true },
  role: { type: String, enum: ['admin', 'serveur', 'cuisinier', 'manager', 'kitchen', 'operations', 'whatsapp_agent'], required: true, default: 'serveur' },
  active: { type: Boolean, default: true },
  deletedAt: { type: Date, default: null },
  sessionVersion: { type: Number, default: 0 },
  // Le PIN sert à la reprise de poste en plein service ; le mot de passe reste la voie
  // d'accès complète. Un PIN a peu d'entropie : il n'est utilisable que depuis un poste
  // enrôlé, et le verrouillage est persisté pour survivre à un redémarrage.
  pinHash: { type: String, default: null, select: false },
  pinFailedAttempts: { type: Number, default: 0, select: false },
  pinLockedUntil: { type: Date, default: null, select: false },
}, { timestamps: true });

UserSchema.index({ restaurantId: 1, login: 1 }, { unique: true });

const User = (mongoose.models && mongoose.models.User) || model('User', UserSchema);
export default User;
