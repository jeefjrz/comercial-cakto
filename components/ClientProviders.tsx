'use client';
import { useEffect, useState } from 'react';
import { AuthProvider } from '@/lib/authContext';
import { ThemeProvider } from '@/components/ui/ThemeProvider';
import { ToastProvider } from '@/components/ui/Toast';

// O placeholder que o SERVIDOR envia e que o cliente renderiza NO PRIMEIRO PAINT.
// Deve ser 100% estático — sem props dinâmicos, sem leitura de localStorage, sem tema.
// Isso garante que SSR HTML === cliente inicial → hydration sem divergência.
function AppShell() {
  return <div style={{ minHeight: '100vh', background: '#000' }} />;
}

export default function ClientProviders({ children }: { children: React.ReactNode }) {
  // mounted começa false no servidor E no primeiro render do cliente.
  // Só vira true depois que o useEffect roda — garantia de ser pós-hydratação.
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Antes da hydratação: servidor e cliente concordam com o AppShell vazio.
  if (!mounted) return <AppShell />;

  // Pós-hydratação: monta todos os providers e entrega os children reais.
  return (
    <AuthProvider>
      <ThemeProvider>
        <ToastProvider>
          {children}
        </ToastProvider>
      </ThemeProvider>
    </AuthProvider>
  );
}
