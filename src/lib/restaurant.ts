export const RESTAURANT_NAME = process.env.NEXT_PUBLIC_RESTAURANT_NAME || 'Coco Garden';
export const RESTAURANT_CURRENCY = 'XAF';
export const RESTAURANT_CURRENCY_LABEL = 'FCFA';
export const RESTAURANT_LOCALE = 'fr-FR';

export function formatCfa(amount: number) {
  return `${new Intl.NumberFormat(RESTAURANT_LOCALE, { maximumFractionDigits: 0 }).format(amount)} ${RESTAURANT_CURRENCY_LABEL}`;
}