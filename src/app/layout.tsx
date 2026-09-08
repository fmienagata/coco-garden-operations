import type { Metadata } from "next";
import "./globals.css";
import "./logo.css";
import "./menu.css";
import "./delivery.css";
import "./ui-pro.css";
import "./delivery-polish.css";
import { RESTAURANT_NAME } from '../lib/restaurant';

export const metadata: Metadata = {
  title: `${RESTAURANT_NAME} — Cuisine & Livraison`,
  description: "Gestion de la préparation et de la livraison des commandes",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="fr"><body>{children}</body></html>;
}
