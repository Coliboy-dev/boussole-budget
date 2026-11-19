import type { Metadata } from 'next';
import { connection } from 'next/server';
import './globals.css';
import TopHeader from '@/components/layout/TopHeader';
import BottomNav from '@/components/layout/BottomNav';
import AppWrapper from '@/components/layout/AppWrapper';

export const metadata: Metadata = {
  title: 'Boussole Budget',
  description: 'Reprends le contrôle de ton budget',
};

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
        <AppWrapper>
          <div className="flex flex-col min-h-screen max-w-2xl mx-auto">
            <TopHeader />
            <main className="flex-1 overflow-y-auto pb-20 pt-2">
              {children}
            </main>
            <BottomNav />
          </div>
        </AppWrapper>
      </body>
    </html>
  );
}
