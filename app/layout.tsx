import type { Metadata } from 'next';
import './globals.css';
import TopHeader from '@/components/layout/TopHeader';
import BottomNav from '@/components/layout/BottomNav';
import AppWrapper from '@/components/layout/AppWrapper';

export const metadata: Metadata = {
  title: 'Boussole Budget',
  description: 'Reprends le contrôle de ton budget',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
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
