export const dynamic = 'force-dynamic';
export const revalidate = 0;

import './globals.css';
import { AuthProvider } from '@/lib/authContext';
import { ThemeProvider } from '@/components/ui/ThemeProvider';
import { ToastProvider } from '@/components/ui/Toast';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <ThemeProvider>
          <ToastProvider>
            <AuthProvider>
              {children}
            </AuthProvider>
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}