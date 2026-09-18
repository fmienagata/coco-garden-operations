import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  experimental: {
    // Détection de connectivité par sondage HEAD avec repli progressif, et reprise
    // automatique des navigations bloquées. Plus fiable que `navigator.onLine`, qui
    // annonce « connecté » sur un WiFi sans accès Internet — le mode de panne le plus
    // courant en salle. Expose aussi le hook `useOffline` de `next/offline`.
    useOffline: true,
  },
};

export default nextConfig;
