// @ts-nocheck
// Supabase Edge Function — schedule-call
// Cria evento no Google Calendar usando OAuth 2.0 com Refresh Token (em nome do admin).
// Secrets necessárias (Supabase Dashboard → Edge Functions → Secrets):
//   GOOGLE_CLIENT_ID      — OAuth client ID
//   GOOGLE_CLIENT_SECRET  — OAuth client secret
//   GOOGLE_REFRESH_TOKEN  — Refresh token do dono da agenda
//   GOOGLE_CALENDAR_ID    — ID do calendário (ou "primary")

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

async function getAccessToken(): Promise<string> {
  const clientId     = Deno.env.get('GOOGLE_CLIENT_ID')     ?? ''
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET') ?? ''
  const refreshToken = Deno.env.get('GOOGLE_REFRESH_TOKEN') ?? ''

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET ou GOOGLE_REFRESH_TOKEN não configurados.')
  }

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    new URLSearchParams({
      client_id:     clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type:    'refresh_token',
    }).toString(),
  })

  const json = await res.json()
  if (!json.access_token) throw new Error(`Token error: ${JSON.stringify(json)}`)
  return json.access_token
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const { title, date, time, closerName, closerEmail, clientEmail, notes } = await req.json() as {
      title: string; date: string; time?: string
      closerName: string; closerEmail: string; clientEmail?: string; notes?: string
    }

    const calendarId  = Deno.env.get('GOOGLE_CALENDAR_ID') || 'primary'
    const accessToken = await getAccessToken()
    const timeStr     = time || '09:00'
    const [h, m]      = timeStr.split(':').map(Number)
    const endH        = String(h + 1).padStart(2, '0')
    const tz          = '-03:00'

    const descLines = [
      `Closer: ${closerName}${closerEmail ? ` <${closerEmail}>` : ''}`,
      clientEmail ? `Cliente: ${clientEmail}` : '',
      notes ? `\n${notes}` : '',
    ].filter(Boolean).join('\n')

    const event = {
      summary:     title,
      description: descLines.trim(),
      start: { dateTime: `${date}T${timeStr}:00${tz}`, timeZone: 'America/Sao_Paulo' },
      end:   { dateTime: `${date}T${endH}:${String(m).padStart(2, '0')}:00${tz}`, timeZone: 'America/Sao_Paulo' },
    }

    const calRes = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
      {
        method:  'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body:    JSON.stringify(event),
      },
    )

    if (!calRes.ok) {
      const err = await calRes.text()
      console.error('[schedule-call] Calendar API error:', err)
      return new Response(JSON.stringify({ error: err }), {
        status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    const created = await calRes.json()
    return new Response(JSON.stringify({ eventId: created.id, htmlLink: created.htmlLink }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    console.error('[schedule-call] erro:', e)
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
