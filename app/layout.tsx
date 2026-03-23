import type { Metadata } from 'next';
import './globals.css';
import ClientProviders from '@/components/ClientProviders';

export const metadata: Metadata = {
  title: 'Comercial Cakto',
  description: 'Sistema Comercial Interno',
};

// Server Component puro: sem 'use client', sem estado, sem lógica condicional no JSX.
// suppressHydrationWarning em <html> e <body> silencia mismatches de atributos
// injetados por extensões de browser (ex: dark-mode extensions, password managers).
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <ClientProviders>{children}</ClientProviders>
      </body>
    </html>
  );
}
