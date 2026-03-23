'use client';
import { AuthProvider } from '@/lib/authContext';

export default function ClientProviders({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}
