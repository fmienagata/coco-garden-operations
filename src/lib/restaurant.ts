export const RESTAURANT_NAME = process.env.NEXT_PUBLIC_RESTAURANT_NAME || 'Coco Garden';
export const RESTAURANT_CURRENCY = 'XAF';
export const RESTAURANT_CURRENCY_LABEL = 'FCFA';
export const RESTAURANT_LOCALE = 'fr-FR';

export function formatCfa(amount: number) {
  return `${new Intl.NumberFormat(RESTAURANT_LOCALE, { maximumFractionDigits: 0 }).format(amount)} ${RESTAURANT_CURRENCY_LABEL}`;
}

export const RESTAURANT_CONTACT = {
  phone: '+242 04 443 4310',
  whatsappUrl: 'https://wa.me/242044434310',
  street: 'Avenue Moe Vangoula',
  landmark: 'face à la Direction de la Pêche',
  city: 'Pointe-Noire',
  openingDays: 'Lundi – Samedi',
  openingHours: '11h00 – 23h00',
} as const;
