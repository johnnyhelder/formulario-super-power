import type { Config, Passo, Respostas, Texto } from './tipos'
import { DESCONHECIDO, NIVEL_VALOR, type IA } from './ia'

// A lógica da conversa, sem React: que pergunta vem a seguir, o que vai no
// painel, o desenho do radar e o resumo que a IA lê. Funções puras, testadas
// em tests/fluxo.test.ts.

// Cada passo do tipo 'empresa' ganha logo a seguir a etapa de confirmação
// ("É esta a sua empresa?"), que só aparece se a pesquisa achar alguma coisa.
export const CONFIRMAR = ':confirmar'

export function etapas(config: Config): string[] {
  return config.passos.flatMap((p) => (p.tipo === 'empresa' ? [p.id, p.id + CONFIRMAR] : [p.id]))
}

export function passoDe(config: Config, etapa: string): Passo | undefined {
  return config.passos.find((p) => p.id === etapa)
}

export function texto(t: Texto | undefined, r: Respostas): string {
  return typeof t === 'function' ? t(r) : (t ?? '')
}

export function opcoesDe(passo: Passo, r: Respostas): string[] {
  if (passo.tipo === 'escolha') return typeof passo.opcoes === 'function' ? passo.opcoes(r) : passo.opcoes
  if (passo.tipo === 'varias') return passo.opcoes
  if (passo.tipo === 'escala') return passo.opcoes.map((o) => o.rotulo)
  return []
}

// A etapa seguinte, pulando o que não faz sentido agora. null = acabou.
export function proxima(config: Config, atual: string | null, r: Respostas, ia: IA): string | null {
  const lista = etapas(config)
  for (let i = atual === null ? 0 : lista.indexOf(atual) + 1; i < lista.length; i++) {
    const e = lista[i]
    if (e.endsWith(CONFIRMAR)) {
      if (ia.empresa?.encontrada && ia.empresa.confianca !== 'baixo') return e
      continue
    }
    const p = passoDe(config, e)!
    if (p.pular?.(r)) continue
    if (p.tipo === 'extra' && !ia.pergunta) continue
    if (p.tipo === 'mapa' && !ia.mapa) continue
    return e
  }
  return null
}

// Linhas do painel "Resumo do seu caso".
export function linhasResumo(config: Config, r: Respostas, ia: IA): [string, string][] {
  const l: [string, string][] = []
  for (const p of config.passos) {
    const v = r[p.id]
    if (p.tipo === 'problema' && v) {
      const t = String(v)
      l.push([p.resumo ?? 'O que quer resolver', ia.notas?.notas[0] ?? (t.length > 90 ? `${t.slice(0, 90)}…` : t)])
      if (ia.notas?.area) l.push(['Área', ia.notas.area])
      continue
    }
    if (p.resumo && v && (!Array.isArray(v) || v.length)) l.push([p.resumo, Array.isArray(v) ? v.join(', ') : v])
    if (p.tipo === 'empresa' && ia.empresaConfirmada && ia.empresa?.cidade) {
      // Se há um passo de país, o país já tem a sua linha.
      const pais = ia.empresa.pais !== DESCONHECIDO && !p.passoPais ? ia.empresa.pais : ''
      l.push(['Onde', [ia.empresa.cidade, pais].filter(Boolean).join(' · ')])
    }
  }
  return l
}

// O radar: cada eixo de 0 a 1. Sem informação ainda, fica perto do centro.
export function radarValores(config: Config, r: Respostas, ia: IA): number[] {
  return (config.radar?.eixos ?? []).map((e) => {
    const v = e.valor?.(r) ?? (e.ia && ia.notas?.niveis[e.nome] ? NIVEL_VALOR[ia.notas.niveis[e.nome]] : undefined)
    return v === undefined || Number.isNaN(v) ? 0.15 : Math.max(0, Math.min(1, v))
  })
}

// O que a IA lê sobre a pessoa (entre <dados>, nunca como instrução).
export function dadosParaIA(config: Config, r: Respostas, ia: IA): string {
  const contato = new Set([config.contato.nome, config.contato.email, config.contato.telefone])
  const linhas: string[] = []
  for (const p of config.passos) {
    const v = r[p.id]
    if (!v || contato.has(p.id) || p.tipo === 'extra' || p.tipo === 'mapa') continue
    const rotulo = p.resumo ?? p.id
    linhas.push(`${rotulo}: ${Array.isArray(v) ? v.join(', ') : String(v).slice(0, 1500)}`)
  }
  const extra = config.passos.find((p) => p.tipo === 'extra')
  if (extra && ia.pergunta && r[extra.id]) {
    linhas.push(`Pergunta extra: ${ia.pergunta.pergunta}`, `Resposta extra: ${String(r[extra.id]).slice(0, 400)}`)
  }
  if (ia.empresaConfirmada && ia.empresa) linhas.push(`A empresa faz: ${ia.empresa.descricao}`)
  if (ia.ajusteMapa) linhas.push(`Pedido de ajuste ao mapa: ${ia.ajusteMapa.slice(0, 400)}`)
  return `<dados>\n${linhas.join('\n')}\n</dados>`
}
