'use client';
import dynamic from 'next/dynamic';

// ssr: false garante que LoginForm NUNCA seja renderizado no servidor.
// O servidor envia HTML vazio para esta rota — zero risco de hydration mismatch (#418).
const LoginForm = dynamic(() => import('./login-form'), { ssr: false });

export default function LoginPage() {
  return <LoginForm />;
}
