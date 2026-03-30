// Supabase Edge Function — schedule-call
// Cria evento no Google Calendar Mestre usando uma Service Account (sem OAuth individual).
// Vars de ambiente necessárias (Supabase Dashboard → Edge Functions → Secrets):
//   GOOGLE_SERVICE_ACCOUNT_EMAIL  — e-mail da service account
//   GOOGLE_PRIVATE_KEY            — chave privada PEM (\\n como separador de linha)
//   GOOGLE_CALENDAR_ID            — ID do calendário mestre (ou "primary")

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const CALENDAR_API     = 'https://www.googleapis.com/calendar/v3';

// ── Base64url sem padding ──────────────────────────────────────────────────
function base64url(data: Uint8Array | string): string {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const b64 = btoa(String.fromCharCode(...bytes));
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

// ── Gera JWT para a Service Account ───────────────────────────────────────
async function makeServiceAccountJwt(email: string, privateKeyPem: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header  = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify({
    iss: email,
    scope: 'https://www.googleapis.com/auth/calendar',
    aud: GOOGLE_TOKEN_URL,
    exp: now + 3600,
    iat: now,
  }));

  const signingInput = `${header}.${payload}`;

  // Importa chave PKCS8
  const pemBody = privateKeyPem
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s/g, '');
  const der = Uint8Array.from(atob(pemBody), c => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8', der,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['sign'],
  );

  const sigBytes = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5', cryptoKey,
    new TextEncoder().encode(signingInput),
  );

  return `${signingInput}.${base64url(new Uint8Array(sigBytes))}`;
}

// ── Obtém access_token do Google ──────────────────────────────────────────
async function getAccessToken(): Promise<string> {
  const email      = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_EMAIL') ?? '';
  const privateKey = (Deno.env.get('GOOGLE_PRIVATE_KEY') ?? '').replace(/\\n/g, '\n');

  if (!email || !privateKey) throw new Error('GOOGLE_SERVICE_ACCOUNT_EMAIL ou GOOGLE_PRIVATE_KEY não configurados.');

  const jwt = await makeServiceAccountJwt(email, privateKey);
  const res  = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  const json = await res.json();
  if (!json.access_token) throw new Error(`Token error: ${JSON.stringify(json)}`);
  return json.access_token;
}

// ── Handler principal ─────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type' } });
  }

  try {
    const { title, date, time, closerName, closerEmail, notes } = await req.json() as {
      title: string; date: string; time?: string;
      closerName: string; closerEmail: string; notes?: string;
    };

    const calendarId   = Deno.env.get('GOOGLE_CALENDAR_ID') || 'primary';
    const accessToken  = await getAccessToken();
    const timeStr      = time || '09:00';
    const [h, m]       = timeStr.split(':').map(Number);
    const endH         = String(h + 1).padStart(2, '0');
    const tz           = '-03:00';

    const event = {
      summary: title,
      description: `Agendado por: ${closerName} <${closerEmail}>\n\n${notes ?? ''}`.trim(),
      start: { dateTime: `${date}T${timeStr}:00${tz}`, timeZone: 'America/Sao_Paulo' },
      end:   { dateTime: `${date}T${endH}:${String(m).padStart(2, '0')}:00${tz}`, timeZone: 'America/Sao_Paulo' },
    };

    const calRes = await fetch(
      `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(event),
      },
    );

    if (!calRes.ok) {
      const err = await calRes.text();
      return new Response(JSON.stringify({ error: err }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    const created = await calRes.json();
    return new Response(
      JSON.stringify({ eventId: created.id, htmlLink: created.htmlLink }),
      { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});
