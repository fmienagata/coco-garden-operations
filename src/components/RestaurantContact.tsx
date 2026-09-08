import { RESTAURANT_CONTACT, RESTAURANT_NAME } from '../lib/restaurant';

export default function RestaurantContact() {
  return (
    <footer className="restaurant-contact" aria-label={`Informations pratiques — ${RESTAURANT_NAME}`}>
      <div className="restaurant-contact__inner">
        <div>
          <h2>Réservations</h2>
          <a href={RESTAURANT_CONTACT.whatsappUrl} target="_blank" rel="noopener noreferrer" aria-label={`Réserver sur WhatsApp au ${RESTAURANT_CONTACT.phone} (nouvel onglet)`}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M20 11.5a8.5 8.5 0 0 1-12.7 7.4L3 20l1.1-4.3A8.5 8.5 0 1 1 20 11.5Z"/><path d="M8 7.5c.3 4 2.5 6.2 6.5 7l1.5-2-2.5-1-1 1a7 7 0 0 1-3-3l1-1L9.5 6Z"/></svg>
            {RESTAURANT_CONTACT.phone}
          </a>
        </div>
        <div>
          <h2>Adresse</h2>
          <address>{RESTAURANT_CONTACT.street}<br />{RESTAURANT_CONTACT.landmark}<br />{RESTAURANT_CONTACT.city}</address>
        </div>
        <div>
          <h2>Ouverture</h2>
          <p>{RESTAURANT_CONTACT.openingDays}<br />{RESTAURANT_CONTACT.openingHours}</p>
        </div>
      </div>
    </footer>
  );
}
