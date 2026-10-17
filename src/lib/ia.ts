import { z } from 'zod'
import type { Config, Nivel, Passo } from './tipos'

// O que a IA devolve em cada momento da conversa. Cada resposta tem um
// JSON Schema (para a saída estruturada do Claude: o modelo só consegue
// responder neste formato) e um zod (para conferir de novo antes de usar).
// As listas fechadas (país, segmentos, áreas) vêm do formulario.ts.

// O modelo de todas as chamadas (a rota, o `npm run verificar` e o `npm run chave` leem daqui).
export const MODELO = 'claude-haiku-5-5'

export const NIVEIS = ['baixo', 'medio', 'alto'] as const
export const NIVEL_VALOR: Record<Nivel, number> = { baixo: 0.25, medio: 0.55, alto: 0.9 }

// Ícones que a IA pode escolher para desenhar o cenário (mapeados para lucide em pecas.tsx).
export const ICONES = [
  'conversa', 'vendas', 'marketing', 'documentos', 'agenda', 'equipe', 'tempo', 'crescimento',
  'ia', 'dados', 'telefone', 'email', 'financeiro', 'estoque', 'loja', 'automacao', 'alvo', 'alerta',
] as const

export const DESCONHECIDO = 'Desconhecido'

export type EmpresaIA = {
  encontrada: boolean
  confianca: Nivel
  nome: string
  descricao: string
  cidade: string
  pais: string
  segmentos: string[]
  site: string
  fundada: string
}

export type NotasIA = {
  notas: string[]
  area: string
  cenario: string
  trava: string
  chegar: string
  iconeCenario: string
  iconeTrava: string
  iconeChegar: string
  niveis: Record<string, Nivel>
  // false = o texto não parece ter a ver com o negócio (ou está numa língua estranha): rever à mão.
  relacionado: boolean
}

export type PerguntaIA = { pergunta: string; opcoes: string[]; palpite: string }

export type SugestaoIA = { nome: string; motivo: string }

// Uma chamada só, depois do texto principal: a pergunta extra e as sugestões do catálogo.
export type AprofundarIA = Partial<PerguntaIA> & { sugestoes?: SugestaoIA[] }

export type MapaIA = {
  problema: string
  causas: { texto: string; ligacao: string }[]
  objetivo: string
  primeiroPasso: string
  ajustes: string[]
}

// Tudo o que a IA já disse nesta conversa. Vai para o banco junto com as respostas.
export type IA = {
  empresa?: EmpresaIA
  empresaConfirmada?: boolean
  notas?: NotasIA
  notasTexto?: string
  pergunta?: PerguntaIA
  sugestoes?: SugestaoIA[]
  mapa?: MapaIA
  ajusteMapa?: string
  resumo?: string
}

function opcoesDoPasso(config: Config, id: string | undefined): string[] {
  const p = config.passos.find((x) => x.id === id)
  return p && p.tipo === 'escolha' && Array.isArray(p.opcoes) ? p.opcoes : []
}

export function passoEmpresa(config: Config): Extract<Passo, { tipo: 'empresa' }> | undefined {
  return config.passos.find((p): p is Extract<Passo, { tipo: 'empresa' }> => p.tipo === 'empresa')
}

export function paisesDe(config: Config): string[] {
  return opcoesDoPasso(config, passoEmpresa(config)?.passoPais)
}

export function segmentosDe(config: Config): string[] {
  return opcoesDoPasso(config, passoEmpresa(config)?.passoSegmento)
}

export function passoSugestao(config: Config): Extract<Passo, { tipo: 'sugestao' }> | undefined {
  return config.passos.find((p): p is Extract<Passo, { tipo: 'sugestao' }> => p.tipo === 'sugestao')
}

const temExtra = (config: Config) => config.passos.some((p) => p.tipo === 'extra')

// Os eixos do radar que a IA mede (os outros, o código mede pelas respostas).
export function eixosIA(config: Config) {
  return (config.radar?.eixos ?? []).filter((e) => e.ia)
}

// ── JSON Schemas (saída estruturada) ─────────────────────────────────────

const texto = { type: 'string' } as const
const enumDe = (valores: readonly string[]) =>
  valores.length ? { type: 'string', enum: [...valores] } : { type: 'string' }
const objeto = (properties: Record<string, unknown>) => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
})

export function esquemasJSON(config: Config) {
  const segmentos = segmentosDe(config)
  return {
    empresa: objeto({
      encontrada: { type: 'boolean' },
      confianca: enumDe(NIVEIS),
      nome: texto,
      descricao: texto,
      cidade: texto,
      pais: enumDe([...paisesDe(config), DESCONHECIDO]),
      segmentos: { type: 'array', items: segmentos.length ? enumDe(segmentos) : texto },
      site: texto,
      fundada: texto,
    }),
    notas: objeto({
      notas: { type: 'array', items: texto },
      area: enumDe(config.ia.areas),
      cenario: texto,
      trava: texto,
      chegar: texto,
      iconeCenario: enumDe(ICONES),
      iconeTrava: enumDe(ICONES),
      iconeChegar: enumDe(ICONES),
      niveis: objeto(Object.fromEntries(eixosIA(config).map((e) => [e.nome, enumDe(NIVEIS)]))),
      relacionado: { type: 'boolean' },
    }),
    aprofundar: objeto({
      ...(temExtra(config) ? { pergunta: texto, opcoes: { type: 'array', items: texto }, palpite: texto } : {}),
      ...(passoSugestao(config)
        ? { sugestoes: { type: 'array', items: objeto({ nome: enumDe(passoSugestao(config)!.catalogo.map((c) => c.nome)), motivo: texto }) } }
        : {}),
    }),
    resumo: objeto({ frase: texto }),
    mapa: objeto({
      problema: texto,
      causas: { type: 'array', items: objeto({ texto, ligacao: texto }) },
      objetivo: texto,
      primeiroPasso: texto,
      ajustes: { type: 'array', items: texto },
    }),
  }
}

// ── zod (conferência depois da resposta) ─────────────────────────────────

const umDe = (valores: readonly string[]) =>
  valores.length ? z.string().refine((v) => valores.includes(v)) : z.string()

export function esquemasZod(config: Config) {
  const nivel = z.enum(NIVEIS)
  return {
    empresa: z.object({
      encontrada: z.boolean(),
      confianca: nivel,
      nome: z.string().max(120),
      descricao: z.string().max(200),
      cidade: z.string().max(80),
      pais: umDe([...paisesDe(config), DESCONHECIDO]),
      segmentos: z.array(umDe(segmentosDe(config))).transform((s) => s.slice(0, 3)),
      site: z.string().max(200),
      fundada: z.string().max(20),
    }),
    notas: z.object({
      notas: z.array(z.string().max(80)).max(4),
      area: umDe(config.ia.areas),
      cenario: z.string().max(60),
      trava: z.string().max(60),
      chegar: z.string().max(60),
      iconeCenario: umDe(ICONES),
      iconeTrava: umDe(ICONES),
      iconeChegar: umDe(ICONES),
      niveis: z.record(z.string(), nivel),
      relacionado: z.boolean(),
    }),
    aprofundar: z.object({
      pergunta: z.string().max(160).optional(),
      opcoes: z.array(z.string().max(60)).max(5).optional(),
      palpite: z.string().max(200).optional(),
      sugestoes: z
        .array(z.object({ nome: umDe(passoSugestao(config)?.catalogo.map((c) => c.nome) ?? []), motivo: z.string().max(140) }))
        .transform((s) => s.slice(0, passoSugestao(config)?.maximo ?? 3))
        .optional(),
    }),
    resumo: z.object({ frase: z.string().max(300) }),
    mapa: z.object({
      problema: z.string().max(70),
      causas: z.array(z.object({ texto: z.string().max(60), ligacao: z.string().max(30) })).max(3),
      objetivo: z.string().max(70),
      primeiroPasso: z.string().max(70),
      ajustes: z.array(z.string().max(60)).max(3),
    }),
  }
}

// ── O que a página manda às APIs ─────────────────────────────────────────

export const respostasSchema = z.record(
  z.string().max(40),
  z.union([z.string().max(2000), z.array(z.string().max(80)).max(20)]),
)

// O que a IA já disse vai para o banco como está, mas com tamanho limitado.
export const iaSchema = z
  .record(z.string(), z.unknown())
  .refine((v) => JSON.stringify(v).length < 20_000, 'grande demais')
