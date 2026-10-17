import { NextResponse } from 'next/server'

// Rate limit in-memory simples: cada instancia serverless mantem seu proprio
// contador. Suficiente para bloquear spam/abuse comum onde o atacante
// dispara muitas requests do mesmo IP em curto periodo. Para attack
// distribuido ou muito agressivo, migrar para Upstash Ratelimit + Redis.

type Bucket = { count: number; resetAt: number }

const buckets = new Map<string, Bucket>()
const MAX_BUCKETS = 5000 // ceiling para evitar memory leak em traffic alto

function cleanup() {
  if (buckets.size <= MAX_BUCKETS) return
  const now = Date.now()
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt < now) buckets.delete(key)
  }
  if (buckets.size > MAX_BUCKETS) {
    // ainda acima do limite mesmo apos limpar expirados: descarta os mais antigos
    const excess = buckets.size - MAX_BUCKETS
    const keys = Array.from(buckets.keys()).slice(0, excess)
    for (const key of keys) buckets.delete(key)
  }
}

export type RateLimitResult = {
  ok: boolean
  limit: number
  remaining: number
  resetAt: number
}

/**
 * Verifica e incrementa contador de rate limit para a chave.
 * @param key Identificador (ex: `contact:${ip}`)
 * @param limit Numero maximo de requests por janela
 * @param windowMs Janela em milissegundos
 */
export function checkRateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now()
  const bucket = buckets.get(key)

  if (!bucket || bucket.resetAt < now) {
    const newBucket = { count: 1, resetAt: now + windowMs }
    buckets.set(key, newBucket)
    cleanup()
    return { ok: true, limit, remaining: limit - 1, resetAt: newBucket.resetAt }
  }

  bucket.count++
  const remaining = Math.max(0, limit - bucket.count)
  return { ok: bucket.count <= limit, limit, remaining, resetAt: bucket.resetAt }
}

/** Extrai o IP do request (Vercel popula x-forwarded-for / x-real-ip). */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  const real = request.headers.get('x-real-ip')
  if (real) return real
  return 'anonymous'
}

/**
 * Helper de uso em rotas: retorna NextResponse 429 se rate limited,
 * ou null se OK. Tambem injeta headers padrao de rate limit.
 */
export function rateLimitOrReject(
  request: Request,
  bucketName: string,
  limit: number,
  windowMs: number
): NextResponse | null {
  const ip = getClientIp(request)
  const key = `${bucketName}:${ip}`
  const result = checkRateLimit(key, limit, windowMs)

  if (!result.ok) {
    const retryAfterSec = Math.ceil((result.resetAt - Date.now()) / 1000)
    return NextResponse.json(
      { success: false, message: 'Muitas tentativas. Tente novamente em alguns minutos.' },
      {
        status: 429,
        headers: {
          'Retry-After': String(retryAfterSec),
          'X-RateLimit-Limit': String(result.limit),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(Math.floor(result.resetAt / 1000)),
        },
      }
    )
  }

  return null
}
