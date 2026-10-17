import { createHmac, timingSafeEqual } from 'node:crypto'

// Depois de a Cloudflare (Turnstile) confirmar que é uma pessoa, o servidor
// devolve esta sessão assinada. As chamadas à IA levam-na no cabeçalho
// x-sessao-ia. Sem TURNSTILE_SECRET_KEY, nada disto se aplica.

const DURACAO_MS = 2 * 60 * 60 * 1000

export const turnstileLigado = () => Boolean(process.env.TURNSTILE_SECRET_KEY)

function segredo(): string {
  return process.env.SESSAO_SEGREDO || process.env.TURNSTILE_SECRET_KEY || ''
}

const assinar = (dados: string) => createHmac('sha256', segredo()).update(dados).digest('base64url')

export function novaSessaoAssinada(): string {
  const dados = Buffer.from(JSON.stringify({ ate: Date.now() + DURACAO_MS })).toString('base64url')
  return `${dados}.${assinar(dados)}`
}

export function sessaoValida(valor: string | null): boolean {
  if (!valor) return false
  const [dados, assinatura] = valor.split('.')
  if (!dados || !assinatura) return false
  const esperada = Buffer.from(assinar(dados))
  const recebida = Buffer.from(assinatura)
  if (esperada.length !== recebida.length || !timingSafeEqual(esperada, recebida)) return false
  try {
    return JSON.parse(Buffer.from(dados, 'base64url').toString()).ate > Date.now()
  } catch {
    return false
  }
}

// Pergunta à Cloudflare se o token do Turnstile é bom (vale uma vez, 5 minutos).
export async function turnstileOk(token: string, ip: string | null): Promise<boolean> {
  const corpo = new URLSearchParams({ secret: process.env.TURNSTILE_SECRET_KEY ?? '', response: token })
  if (ip) corpo.set('remoteip', ip)
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: corpo,
      signal: AbortSignal.timeout(6000),
    })
    const j = (await res.json()) as { success?: boolean }
    return Boolean(j.success)
  } catch {
    return false
  }
}
