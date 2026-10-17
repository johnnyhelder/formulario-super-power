import type { Coerencia, Config, Passo, Respostas, Texto } from './tipos'
import { DESCONHECIDO, NIVEL_VALOR, type IA } from './ia'
import { TEXTOS } from './textos'

// A lógica da conversa, sem React: que pergunta vem a seguir, o que vai no
// painel, o desenho do radar, as regras de coerência e o resumo que a IA lê.
// Funções puras, testadas em tests/fluxo.test.ts.

// Cada passo do tipo 'empresa' ganha logo a seguir a etapa de confirmação
// ("É esta a sua empresa?"), que só aparece se a pesquisa achar alguma coisa.
export const CONFIRMAR = ':confirmar'
// A resposta "Está certo" a uma regra de coerência fica em r['ok_<id da regra>'].
export const OK_REGRA = 'ok_'
// Se a data está livre fica em r['<id do passo>_livre'] ('sim' ou 'não').
export const LIVRE = '_livre'

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
  if (passo.tipo === 'sugestao') return passo.catalogo.map((c) => c.nome)
  return []
}

// A etapa seguinte, pulando o que não faz sentido agora e o que já foi
// respondido (assim, depois de corrigir uma resposta antiga, a conversa
// retoma onde estava). null = acabou.
export function proxima(config: Config, atual: string | null, r: Respostas, ia: IA): string | null {
  const lista = etapas(config)
  for (let i = atual === null ? 0 : lista.indexOf(atual) + 1; i < lista.length; i++) {
    const e = lista[i]
    if (e.endsWith(CONFIRMAR)) {
      if (ia.empresaConfirmada === undefined && ia.empresa?.encontrada && ia.empresa.confianca !== 'baixo') return e
      continue
    }
    const p = passoDe(config, e)!
    if (r[p.id] !== undefined) continue
    if (p.pular?.(r)) continue
    if (p.tipo === 'extra' && !ia.pergunta) continue
    if (p.tipo === 'mapa' && !ia.mapa) continue
    return e
  }
  return null
}

// A primeira regra de coerência que dispara e ainda não foi confirmada.
export function regraPendente(config: Config, r: Respostas): Coerencia | undefined {
  return config.coerencia?.find((g) => r[OK_REGRA + g.id] === undefined && r[g.corrigir] !== undefined && g.quando(r))
}

// Porque este pedido merece um olhar humano antes de qualquer resposta automática.
export function motivosParaRever(config: Config, r: Respostas, ia: IA): string[] {
  const motivos = (config.coerencia ?? []).filter((g) => r[OK_REGRA + g.id] === 'sim').map((g) => texto(g.pergunta, r))
  if (ia.notas?.relacionado === false) motivos.push(TEXTOS[config.idioma].semRelacao)
  return motivos
}

// "2027-06-14" → "14 de junho de 2027" na língua do formulário.
export function dataLegivel(config: Config, v: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return v
  const [a, m, d] = v.split('-').map(Number)
  return new Date(Date.UTC(a, m - 1, d)).toLocaleDateString(config.idioma, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
}

function valorLegivel(config: Config, p: Passo, v: string | string[]): string {
  if (Array.isArray(v)) return v.join(', ')
  return p.tipo === 'data' ? dataLegivel(config, v) : v
}

// Linhas do painel "Resumo do seu caso".
export function linhasResumo(config: Config, r: Respostas, ia: IA): [string, string][] {
  const T = TEXTOS[config.idioma]
  const l: [string, string][] = []
  for (const p of config.passos) {
    const v = r[p.id]
    if (p.tipo === 'problema' && v) {
      const t = String(v)
      l.push([p.resumo ?? T.oQueQuer, ia.notas?.notas[0] ?? (t.length > 90 ? `${t.slice(0, 90)}…` : t)])
      if (ia.notas?.area) l.push([T.area, ia.notas.area])
      continue
    }
    if (p.resumo && v && (!Array.isArray(v) || v.length)) l.push([p.resumo, valorLegivel(config, p, v)])
    if (p.tipo === 'empresa' && ia.empresaConfirmada && ia.empresa?.cidade) {
      // Se há um passo de país, o país já tem a sua linha.
      const pais = ia.empresa.pais !== DESCONHECIDO && !p.passoPais ? ia.empresa.pais : ''
      l.push([T.onde, [ia.empresa.cidade, pais].filter(Boolean).join(' · ')])
    }
  }
  return l
}

// A frase de resumo quando a IA não responde: as linhas do painel, seguidas.
export function fraseResumo(config: Config, r: Respostas, ia: IA): string {
  return linhasResumo(config, r, ia).map(([k, v]) => `${k}: ${v}`).join(' · ')
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
    if (!v || contato.has(p.id) || p.tipo === 'extra' || p.tipo === 'mapa' || p.tipo === 'resumo') continue
    const rotulo = p.resumo ?? p.id
    linhas.push(`${rotulo}: ${Array.isArray(v) ? v.join(', ') : valorLegivel(config, p, v).slice(0, 1500)}`)
  }
  const extra = config.passos.find((p) => p.tipo === 'extra')
  if (extra && ia.pergunta && r[extra.id]) {
    linhas.push(`Pergunta extra: ${ia.pergunta.pergunta}`, `Resposta extra: ${String(r[extra.id]).slice(0, 400)}`)
  }
  if (ia.empresaConfirmada && ia.empresa) linhas.push(`A empresa faz: ${ia.empresa.descricao}`)
  if (ia.ajusteMapa) linhas.push(`Pedido de ajuste ao mapa: ${ia.ajusteMapa.slice(0, 400)}`)
  return `<dados>\n${linhas.join('\n')}\n</dados>`
}
