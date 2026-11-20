import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Boussole Budget',
    short_name: 'Boussole',
    description: 'Calcule ce que tu peux dépenser et suis tes échéances.',
    lang: 'fr-BE',
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    background_color: '#f8f7f5',
    theme_color: '#115e59',
    icons: [
      { src: '/icons/boussole-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/boussole-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/boussole-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
