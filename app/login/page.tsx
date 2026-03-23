'use client';
import dynamic from 'next/dynamic';

const LoginForm = dynamic(() => import('./login-form'), { ssr: false });

export default function LoginPage() {
  return <LoginForm />;
}
