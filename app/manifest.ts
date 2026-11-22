import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Capiste',
    short_name: 'Capiste',
    description: 'Calcule ce que tu peux dépenser et suis tes échéances.',
    lang: 'fr-BE',
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    background_color: '#fbf7ee',
    theme_color: '#0b5f5d',
    icons: [
      { src: '/icons/capiste-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/capiste-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/capiste-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/capiste-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
