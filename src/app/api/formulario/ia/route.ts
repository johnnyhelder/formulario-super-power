import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { FORMULARIO } from '../../../../../formulario'
import { rateLimitOrReject } from '@/lib/rate-limit'
import { sessaoValida, turnstileLigado } from '@/lib/sessao'
import { chave as chaveDe } from '@/lib/env'
import { dadosParaIA } from '@/lib/fluxo'
import { iaSchema, respostasSchema, type EmpresaIA, type IA } from '@/lib/ia'
import { instrucao, instrucaoEmpresa } from '@/lib/prompts'
import { perguntarClaude } from '@/lib/claude'

// As peças de IA da conversa, com Claude Haiku e saída estruturada (JSON
// Schema): a resposta é sempre um objeto com campos fechados, nunca texto
// livre para a página interpretar. Se faltar a chave ou a IA falhar, a
// página segue sem estes extras.
// A empresa é pesquisada na internet (Firecrawl, ~2 créditos por pesquisa).
// Sem FIRECRAWL_API_KEY, a IA não pesquisa e o cartão da empresa não aparece.
// Dois travões no gasto: limite por IP (em memória, por instância) e um teto
// diário de chamadas guardado no banco, que vale para o site inteiro (src/lib/claude.ts).

const C = FORMULARIO

const pedidoSchema = z.discriminatedUnion('tipo', [
  z.object({ tipo: z.literal('empresa'), empresa: z.string().trim().min(2).max(120) }),
  z.object({ tipo: z.literal('notas'), respostas: respostasSchema, ia: iaSchema }),
  z.object({ tipo: z.literal('aprofundar'), respostas: respostasSchema, ia: iaSchema, futuras: z.array(z.string().max(200)).max(15).optional() }),
  z.object({ tipo: z.literal('mapa'), respostas: respostasSchema, ia: iaSchema }),
  z.object({ tipo: z.literal('resumo'), respostas: respostasSchema, ia: iaSchema }),
])
type Pedido = z.infer<typeof pedidoSchema>

type Resultado = { title?: string; url?: string; description?: string }

// Pesquisa pública da empresa. Falha em silêncio: sem resultados, nada de cartão.
async function pesquisar(empresa: string): Promise<Resultado[]> {
  const chave = chaveDe('FIRECRAWL_API_KEY')
  if (!chave) return []
  try {
    const res = await fetch('https://api.firecrawl.dev/v2/search', {
      method: 'POST',
      headers: { Authorization: `Bearer ${chave}`, 'content-type': 'application/json' },
      body: JSON.stringify({ query: `"${empresa.replace(/"/g, '')}" empresa`, limit: 5 }),
      signal: AbortSignal.timeout(6000),
    })
    if (!res.ok) return []
    const j = await res.json()
    return ((j.data?.web ?? []) as Resultado[]).slice(0, 5)
  } catch {
    return []
  }
}

function textoPedido(pedido: Pedido, resultados: Resultado[]): string {
  if (pedido.tipo === 'empresa') {
    const lista = resultados
      .map((r, i) => `[${i + 1}] ${r.title ?? ''}\nURL: ${r.url ?? ''}\n${(r.description ?? '').replace(/\s+/g, ' ').slice(0, 350)}`)
      .join('\n\n')
    return instrucaoEmpresa(pedido.empresa, lista)
  }
  const futuras = pedido.tipo === 'aprofundar' ? (pedido.futuras ?? []).map((f) => `- ${f.replace(/\s+/g, ' ')}`).join('\n') : ''
  return instrucao(C, pedido.tipo, dadosParaIA(C, pedido.respostas, pedido.ia as IA), futuras)
}

export async function POST(request: NextRequest) {
  const limitado = rateLimitOrReject(request, 'ia', 30, 10 * 60_000)
  if (limitado) return limitado

  // Com Turnstile ligado, só quem passou pela Cloudflare chega à IA.
  if (turnstileLigado() && !sessaoValida(request.headers.get('x-sessao-ia'))) {
    return NextResponse.json({ ok: false }, { status: 403 })
  }

  const parsed = pedidoSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ ok: false }, { status: 400 })
  const pedido = parsed.data

  if (!chaveDe('ANTHROPIC_API_KEY')) return NextResponse.json({ ok: false }, { status: 503 })

  try {
    const resultados = pedido.tipo === 'empresa' ? await pesquisar(pedido.empresa) : []
    // Sem resultados não há o que ler: o Haiku só adivinharia.
    if (pedido.tipo === 'empresa' && resultados.length === 0) {
      return NextResponse.json({ ok: false }, { status: 404 })
    }
    const valido = await perguntarClaude(pedido.tipo, textoPedido(pedido, resultados))
    if (!valido.ok) return NextResponse.json({ ok: false }, { status: valido.estado })
    let dados: unknown = valido.dados
    if (pedido.tipo === 'empresa') {
      const e = valido.dados as EmpresaIA
      // O site só passa se o domínio estiver mesmo num dos resultados.
      const dominio = (url: string) => {
        try { return new URL(url.startsWith('http') ? url : `https://${url}`).hostname.replace(/^www\./, '') } catch { return '' }
      }
      const host = e.site ? dominio(e.site) : ''
      const site = host && resultados.some((r) => dominio(r.url ?? '') === host) ? `https://${host}` : ''
      dados = { ...e, site }
    }
    return NextResponse.json({ ok: true, dados })
  } catch (error) {
    console.error('[ia] erro', pedido.tipo, error)
    return NextResponse.json({ ok: false }, { status: 502 })
  }
}
