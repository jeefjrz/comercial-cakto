import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

function isMainDomain(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname.startsWith('localhost:') ||
    hostname.endsWith('.vercel.app') ||
    hostname === (process.env.NEXT_PUBLIC_APP_DOMAIN ?? '')
  );
}

export function middleware(request: NextRequest) {
  try {
    const hostname = (request.headers.get('host') ?? '').split(':')[0];

    // Custom domain → rewrite to public form page
    if (!isMainDomain(hostname)) {
      const url = request.nextUrl.clone();
      url.pathname = '/f';
      url.searchParams.set('domain', hostname);
      return NextResponse.rewrite(url);
    }
  } catch {
    // On any error, let the request pass through untouched
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico).*)'],
};
