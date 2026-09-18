import Notification from './models/Notification';

export async function recordSentNotification(input: {
  restaurantId: string;
  orderId: string;
  orderNumber: string;
  recipientType: 'driver' | 'customer';
  recipientPhone: string;
  message: string;
}) {
  return Notification.create({ ...input, channel: 'whatsapp', status: 'sent', sentAt: new Date() });
}
