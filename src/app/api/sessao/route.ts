import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { rateLimitOrReject } from '@/lib/rate-limit'
import { novaSessaoAssinada, turnstileLigado, turnstileOk } from '@/lib/sessao'

// Troca o token do Turnstile (5 minutos, uma validação) por uma sessão assinada de 2 horas.
export async function POST(request: NextRequest) {
  const limitado = rateLimitOrReject(request, 'sessao', 10, 10 * 60_000)
  if (limitado) return limitado
  if (!turnstileLigado()) return NextResponse.json({ ok: false }, { status: 404 })
  const parsed = z.object({ token: z.string().min(10).max(4000) }).safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ ok: false }, { status: 400 })
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null
  if (!(await turnstileOk(parsed.data.token, ip))) return NextResponse.json({ ok: false }, { status: 403 })
  return NextResponse.json({ ok: true, sessao: novaSessaoAssinada() })
}
