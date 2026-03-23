import './globals.css';
import { AuthProvider } from '@/lib/authContext';
import { ThemeProvider } from '@/components/ui/ThemeProvider';
import { ToastProvider } from '@/components/ui/Toast'; // <- Faltava importar isso

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <ThemeProvider>
          <ToastProvider> {/* <- Faltava colocar isso em volta do App */}
            <AuthProvider>
              {children}
            </AuthProvider>
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}