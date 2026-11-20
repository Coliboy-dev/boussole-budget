import type { Metadata, Viewport } from 'next';
import { connection } from 'next/server';
import './globals.css';
import TopHeader from '@/components/layout/TopHeader';
import BottomNav from '@/components/layout/BottomNav';
import AppWrapper from '@/components/layout/AppWrapper';
import { RegisterOfflineSupport } from '@/components/layout/OfflineSupport';

export const metadata: Metadata = {
  title: 'Boussole Budget',
  description: 'Reprends le contrôle de ton budget',
  robots: { index: false },
  appleWebApp: { capable: true, title: 'Boussole' },
  icons: { apple: '/icons/boussole-180.png' },
};

export const viewport: Viewport = { themeColor: '#115e59' };

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Les scripts de chaque réponse utilisent le nonce de cette requête.
  await connection();
  return (
    <html lang="fr" className="h-full">
      <body className="h-full bg-[#F8F7F5] text-[#1A1A2E] antialiased">
        <RegisterOfflineSupport />
        <a href="#contenu" className="sr-only z-50 min-h-11 rounded-lg bg-white px-4 py-2 font-semibold text-teal-800 focus:not-sr-only focus:fixed focus:top-2 focus:left-2">
          Aller au contenu
        </a>
        <AppWrapper>
          <div className="flex flex-col min-h-screen max-w-2xl mx-auto">
            <TopHeader />
            <main id="contenu" tabIndex={-1} className="flex-1 overflow-y-auto pb-20 pt-2">
              {children}
            </main>
            <BottomNav />
          </div>
        </AppWrapper>
      </body>
    </html>
  );
}
