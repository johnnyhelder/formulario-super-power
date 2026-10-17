import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { FORMULARIO } from '../../../../formulario'
import { rateLimitOrReject } from '@/lib/rate-limit'
import { contarChamadaIA } from '@/lib/banco'
import { sessaoValida, turnstileLigado } from '@/lib/sessao'
import { dadosParaIA } from '@/lib/fluxo'
import { MODELO, esquemasJSON, esquemasZod, iaSchema, respostasSchema, type IA } from '@/lib/ia'
import { instrucao, instrucaoEmpresa, sistema } from '@/lib/prompts'

// As peças de IA da conversa, com Claude Haiku e saída estruturada (JSON
// Schema): a resposta é sempre um objeto com campos fechados, nunca texto
// livre para a página interpretar. Se faltar a chave ou a IA falhar, a
// página segue sem estes extras.
// A empresa é pesquisada na internet (Firecrawl, ~2 créditos por pesquisa).
// Sem FIRECRAWL_API_KEY, a IA não pesquisa e o cartão da empresa não aparece.
// Dois travões no gasto: limite por IP (em memória, por instância) e um teto
// diário de chamadas guardado no banco, que vale para o site inteiro.

const C = FORMULARIO
const TETO_DIARIO = Number(process.env.IA_TETO_DIARIO) || 1500

const pedidoSchema = z.discriminatedUnion('tipo', [
  z.object({ tipo: z.literal('empresa'), empresa: z.string().trim().min(2).max(120) }),
  z.object({ tipo: z.literal('notas'), respostas: respostasSchema, ia: iaSchema }),
  z.object({ tipo: z.literal('aprofundar'), respostas: respostasSchema, ia: iaSchema }),
  z.object({ tipo: z.literal('mapa'), respostas: respostasSchema, ia: iaSchema }),
  z.object({ tipo: z.literal('resumo'), respostas: respostasSchema, ia: iaSchema }),
])
type Pedido = z.infer<typeof pedidoSchema>

const SISTEMA = sistema(C)

const JSONS = esquemasJSON(C)
const ZODS = esquemasZod(C)

type Resultado = { title?: string; url?: string; description?: string }

// Pesquisa pública da empresa. Falha em silêncio: sem resultados, nada de cartão.
async function pesquisar(empresa: string): Promise<Resultado[]> {
  const chave = process.env.FIRECRAWL_API_KEY
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
  return instrucao(C, pedido.tipo, dadosParaIA(C, pedido.respostas, pedido.ia as IA))
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

  const chave = process.env.ANTHROPIC_API_KEY
  if (!chave) return NextResponse.json({ ok: false }, { status: 503 })

  try {
    // O teto diário só existe com banco. Sem ele, fica só o limite por IP.
    const hoje = await contarChamadaIA()
    if (hoje !== null && hoje > TETO_DIARIO) {
      console.error('[ia] teto diário atingido', hoje)
      return NextResponse.json({ ok: false }, { status: 429 })
    }
    const resultados = pedido.tipo === 'empresa' ? await pesquisar(pedido.empresa) : []
    // Sem resultados não há o que ler: o Haiku só adivinharia.
    if (pedido.tipo === 'empresa' && resultados.length === 0) {
      return NextResponse.json({ ok: false }, { status: 404 })
    }
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': chave,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
        // Chaves que não estão presas a um workspace precisam de o indicar.
        ...(process.env.ANTHROPIC_WORKSPACE_ID ? { 'anthropic-workspace-id': process.env.ANTHROPIC_WORKSPACE_ID } : {}),
      },
      body: JSON.stringify({
        model: MODELO,
        max_tokens: 700,
        thinking: { type: 'disabled' },
        output_config: { effort: 'low', format: { type: 'json_schema', schema: JSONS[pedido.tipo] } },
        system: SISTEMA,
        messages: [{ role: 'user', content: textoPedido(pedido, resultados) }],
      }),
      signal: AbortSignal.timeout(12_000),
    })
    if (!res.ok) {
      console.error('[ia]', pedido.tipo, res.status, (await res.text()).slice(0, 300))
      return NextResponse.json({ ok: false }, { status: 502 })
    }
    const corpo = await res.json()
    const bloco = (corpo.content as { type: string; text?: string }[]).find((b) => b.type === 'text')
    const valido = ZODS[pedido.tipo].safeParse(JSON.parse(bloco?.text ?? 'null'))
    if (!valido.success) {
      console.error('[ia] saída fora do esquema', pedido.tipo, valido.error.message.slice(0, 300))
      return NextResponse.json({ ok: false }, { status: 502 })
    }
    let dados: unknown = valido.data
    if (pedido.tipo === 'empresa') {
      const e = valido.data as z.infer<typeof ZODS.empresa>
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
