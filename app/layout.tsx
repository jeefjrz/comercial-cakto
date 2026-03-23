import type { Metadata } from 'next';
import './globals.css';
import ClientProviders from '@/components/ClientProviders';

export const metadata: Metadata = {
  title: 'Comercial Cakto',
  description: 'Sistema Comercial Interno',
};

// RootLayout é um Server Component puro — sem 'use client', sem estado, sem providers inline.
// Todos os providers cliente ficam isolados em ClientProviders para não contaminar o SSR.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <ClientProviders>
          {children}
        </ClientProviders>
      </body>
    </html>
  );
}
