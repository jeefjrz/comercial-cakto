'use client';
import { useEffect, useState } from 'react';
import { AuthProvider } from '@/lib/authContext';

export default function ClientProviders({ children }: { children: React.ReactNode }) {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) {
    return <div style={{ background: '#000', minHeight: '100vh' }} />;
  }

  return <AuthProvider>{children}</AuthProvider>;
}
