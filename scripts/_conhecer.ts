/**
 * Peças puras do `npm run conhecer` (testadas em tests/conhecer.test.ts):
 * descobrir onde o formulário mora, escolher que páginas ler e descrever ao Claude para que serve o formulário.
 */
import type { Config, Passo } from '../src/lib/tipos'

// Endereços que são da hospedagem, não do negócio.
const HOSPEDAGEM = /(^|\.)(vercel\.app|netlify\.app|github\.io|pages\.dev|onrender\.com|herokuapp\.com|localhost)$/i

/** https://host de um endereço, ou '' se não for um site do negócio. */
export function origemDe(endereco: string): string {
  const texto = endereco.trim()
  if (!texto) return ''
  try {
    const u = new URL(/^https?:\/\//i.test(texto) ? texto : `https://${texto}`)
    if (!u.hostname.includes('.') || HOSPEDAGEM.test(u.hostname)) return ''
    return `https://${u.hostname.toLowerCase()}`
  } catch {
    return ''
  }
}

/** O domínio principal: diagnostico.loja.com.br vira loja.com.br (o formulário costuma morar num subdomínio). */
export function dominioPrincipal(origem: string): string {
  const partes = new URL(origem).hostname.replace(/^www\./, '').split('.')
  const segundoNivel = partes.length >= 3 && /^(com|co|org|net|gov|edu|ac)$/.test(partes[partes.length - 2]) && partes[partes.length - 1].length === 2
  return partes.slice(segundoNivel ? -3 : -2).join('.')
}

/**
 * Onde o formulário mora, pela ordem: --site, as variáveis do projeto, o link da política de privacidade.
 * Devolve também de onde veio, para dizer à pessoa ("achei em FORMULARIO_SITE").
 */
export function descobrirSite(arg: string | undefined, env: Record<string, string | undefined>, C: Config): { site: string; de: string } {
  const candidatos: [string | undefined, string][] = [
    [arg, '--site'],
    [env.FORMULARIO_SITE, 'FORMULARIO_SITE'],
    [env.NEXT_PUBLIC_SITE_URL, 'NEXT_PUBLIC_SITE_URL'],
    [env.SITE_URL, 'SITE_URL'],
    [env.VERCEL_PROJECT_PRODUCTION_URL, 'VERCEL_PROJECT_PRODUCTION_URL'],
    [C.privacidade.link, 'privacidade.link do formulario.ts'],
  ]
  for (const [valor, de] of candidatos) {
    const site = origemDe(valor ?? '')
    if (site) return { site, de }
  }
  return { site: '', de: '' }
}

// Páginas que mais dizem sobre um negócio, da mais útil para a menos.
const PISTAS: [RegExp, number][] = [
  [/sobre|about|quem-somos|quem_somos|nossa-historia|empresa|equipa|equipe|team/, 9],
  [/servic|service|produto|product|solu[cç]|o-que-fazemos|tratamento|menu|cardapio|catalogo/, 9],
  [/pre[cç]o|pricing|planos|plans|tabela|orcamento|orçamento/, 8],
  [/faq|perguntas|duvidas|dúvidas/, 7],
  [/case|portfolio|portf[oó]lio|clientes|depoimento|testemunho|review/, 6],
  [/contato|contacto|contact|localiza/, 5],
  [/blog|artigo|article|noticia|news|post/, 3],
]
const DESCARTAR = /\.(pdf|jpe?g|png|gif|webp|svg|zip|mp4|xml)$|\/(wp-admin|wp-login|login|entrar|carrinho|cart|checkout|minha-conta|account|tag|categoria|category|author|feed|privacidade|privacy|cookies|termos|terms)\b/i

/** Escolhe as páginas a ler: a página inicial e as que mais dizem do negócio, sem repetir. */
export function escolherPaginas(urls: string[], origem: string, maximo = 25): string[] {
  const host = new URL(origem).hostname.replace(/^www\./, '')
  const vistos = new Set<string>()
  const pontuadas: { url: string; pontos: number }[] = []
  for (const bruto of urls) {
    let u: URL
    try {
      u = new URL(bruto)
    } catch {
      continue
    }
    if (u.hostname.replace(/^www\./, '') !== host || DESCARTAR.test(u.pathname)) continue
    const limpo = `${u.origin}${u.pathname.replace(/\/+$/, '')}`
    if (vistos.has(limpo)) continue
    vistos.add(limpo)
    const caminho = decodeURIComponent(u.pathname.toLowerCase())
    const profundidade = caminho.split('/').filter(Boolean).length
    let pontos = profundidade === 0 ? 100 : 0
    for (const [pista, valor] of PISTAS) if (pista.test(caminho)) pontos = Math.max(pontos, valor)
    // Páginas de primeiro nível dizem mais do que as escondidas lá no fundo.
    pontos += Math.max(0, 3 - profundidade)
    pontuadas.push({ url: limpo || u.origin, pontos })
  }
  // Blog: entra, mas sem ocupar a lista toda.
  const escolhidas: string[] = []
  let artigos = 0
  for (const { url, pontos } of pontuadas.sort((a, b) => b.pontos - a.pontos)) {
    if (escolhidas.length >= maximo) break
    const ehArtigo = pontos <= 6 && /blog|artigo|article|post|noticia|news/i.test(url)
    if (ehArtigo && ++artigos > 6) continue
    escolhidas.push(url)
  }
  if (!escolhidas.some((u) => new URL(u).pathname.replace(/\/+$/, '') === '')) escolhidas.unshift(origem)
  return escolhidas.slice(0, maximo)
}

function textoDe(valor: unknown): string {
  if (typeof valor === 'function') {
    try {
      return String(valor({})).replace(/undefined/g, '…')
    } catch {
      return '(depende das respostas)'
    }
  }
  return typeof valor === 'string' ? valor : ''
}

/** O formulário em texto: o Claude precisa de saber para que ele serve antes de pensar no negócio. */
export function funcaoDoFormulario(C: Config): string {
  const linhas = C.passos.map((p: Passo, i) => {
    const pergunta = textoDe(p.pergunta) || `(${p.tipo}: a IA cria)`
    const opcoes = listaDeOpcoes(p)
    // Opções escritas como função mudam com as respostas (ex. faixas em € ou R$ conforme o país).
    const rotulo = 'opcoes' in p && typeof p.opcoes === 'function' ? 'opções (mudam conforme as respostas anteriores; uma das versões)' : 'opções'
    return `${i + 1}. [${p.tipo}] ${pergunta}${opcoes ? ` | ${rotulo}: ${opcoes}` : ''}`
  })
  const catalogo = C.passos.flatMap((p) => (p.tipo === 'sugestao' ? p.catalogo.map((c) => c.nome) : []))
  return [
    `Língua do formulário: ${C.idioma}. Marca: ${C.marca.nome}.`,
    `Título da página: ${C.pagina.titulo}. ${C.pagina.descricao}`,
    `O que a IA sabe hoje (ia.sobre): ${C.ia.sobre}`,
    `Passos, pela ordem:\n${linhas.join('\n')}`,
    catalogo.length ? `Catálogo de serviços que a IA pode sugerir: ${catalogo.join('; ')}` : '',
    C.coerencia?.length ? `Regras de coerência já existentes: ${C.coerencia.map((r) => r.id).join(', ')}` : '',
  ].filter(Boolean).join('\n\n')
}

function listaDeOpcoes(p: Passo): string {
  if (!('opcoes' in p)) return ''
  const o = typeof p.opcoes === 'function' ? (() => { try { return p.opcoes({}) } catch { return [] } })() : p.opcoes
  return (o as unknown[]).map((x) => (typeof x === 'string' ? x : (x as { rotulo?: string }).rotulo ?? '')).filter(Boolean).join(', ')
}

/** Corta um texto num tamanho, sem partir a última palavra. */
export function cortar(texto: string, maximo: number): string {
  const t = texto.replace(/\n{3,}/g, '\n\n').trim()
  return t.length <= maximo ? t : `${t.slice(0, t.lastIndexOf(' ', maximo))} [...]`
}
