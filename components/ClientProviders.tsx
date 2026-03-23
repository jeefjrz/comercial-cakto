'use client';
import { useEffect, useState } from 'react';
import { AuthProvider } from '@/lib/authContext';

function AppShell() {
  return <div style={{ minHeight: '100vh', background: '#000' }} />;
}

export default function ClientProviders({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return <AppShell />;

  return (
    <AuthProvider>
      {children}
    </AuthProvider>
  );
}
