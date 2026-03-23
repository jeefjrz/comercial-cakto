import type { Metadata } from 'next';
import './globals.css';
import ClientProviders from '@/components/ClientProviders';

export const metadata: Metadata = {
  title: 'Comercial Cakto',
  description: 'Sistema Comercial Interno',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <ClientProviders>{children}</ClientProviders>
      </body>
    </html>
  );
}
