import type { Config } from './tipos'

// Confere se o formulario.ts está coerente. Devolve a lista de problemas,
// em português, para a pessoa (ou a LLM) corrigir. Vazia = tudo certo.
// Usado por `npm test` e `npm run verificar`.
export function problemasDa(config: Config): string[] {
  const erros: string[] = []
  const ids = config.passos.map((p) => p.id)
  const porId = new Map(config.passos.map((p) => [p.id, p]))

  for (const id of ids) {
    if (!/^[a-zA-Z][a-zA-Z0-9_]{0,39}$/.test(id)) erros.push(`O id "${id}" só pode ter letras, números e _ (até 40, sem espaço nem acento).`)
  }
  for (const id of new Set(ids)) {
    if (ids.filter((x) => x === id).length > 1) erros.push(`O id "${id}" aparece em mais de um passo.`)
  }

  for (const tipo of ['empresa', 'problema', 'escala', 'extra', 'mapa'] as const) {
    if (config.passos.filter((p) => p.tipo === tipo).length > 1) erros.push(`Só pode haver um passo do tipo "${tipo}".`)
  }

  const { nome, email, telefone } = config.contato
  if (!porId.has(nome)) erros.push(`contato.nome aponta para "${nome}", que não é um passo.`)
  if (porId.get(email)?.tipo !== 'email') erros.push(`contato.email tem de apontar para um passo do tipo "email".`)
  if (telefone && porId.get(telefone)?.tipo !== 'telefone') erros.push(`contato.telefone tem de apontar para um passo do tipo "telefone".`)
  const ultimo = config.passos[config.passos.length - 1]
  if (ultimo && ultimo.id !== email && ultimo.id !== telefone) erros.push('O último passo tem de ser o e-mail ou o telefone (é nele que a conversa envia).')

  const posicao = (tipo: string) => config.passos.findIndex((p) => p.tipo === tipo)
  const problema = posicao('problema')
  for (const tipo of ['extra', 'mapa']) {
    const i = posicao(tipo)
    if (i >= 0 && (problema < 0 || i < problema)) erros.push(`O passo "${tipo}" precisa de vir depois do passo do tipo "problema" (a IA parte dele).`)
  }

  const empresa = config.passos.find((p) => p.tipo === 'empresa')
  if (empresa?.tipo === 'empresa') {
    for (const [campo, alvo] of [['passoPais', empresa.passoPais], ['passoSegmento', empresa.passoSegmento]] as const) {
      if (!alvo) continue
      const p = porId.get(alvo)
      if (!p || p.tipo !== 'escolha' || !Array.isArray(p.opcoes)) {
        erros.push(`${campo} aponta para "${alvo}", que tem de ser um passo "escolha" com uma lista fixa de opções.`)
      } else if (ids.indexOf(alvo) < ids.indexOf(empresa.id)) {
        erros.push(`O passo "${alvo}" tem de vir depois do passo da empresa.`)
      }
    }
  }

  for (const p of config.passos) {
    if ((p.tipo === 'escolha' && Array.isArray(p.opcoes)) || p.tipo === 'varias') {
      const opcoes = p.opcoes as string[]
      if (opcoes.length === 0) erros.push(`O passo "${p.id}" não tem opções.`)
      if (new Set(opcoes).size !== opcoes.length) erros.push(`O passo "${p.id}" tem opções repetidas.`)
      if (opcoes.some((o) => o.length > 80)) erros.push(`O passo "${p.id}" tem opções com mais de 80 caracteres.`)
    }
    if (p.tipo === 'escala' && p.opcoes.some((o) => o.bonecos < 1 || o.bonecos > 300)) {
      erros.push(`No passo "${p.id}", os bonecos vão de 1 a 300.`)
    }
  }

  if (config.ia.areas.length === 0) erros.push('ia.areas precisa de pelo menos uma área.')
  const eixos = config.radar?.eixos ?? []
  if (config.radar && (eixos.length < 3 || eixos.length > 8)) erros.push('O radar precisa de 3 a 8 eixos.')
  for (const e of eixos) {
    if (!e.ia && !e.valor) erros.push(`O eixo "${e.nome}" do radar precisa de "ia" ou de "valor".`)
  }
  if (new Set(eixos.map((e) => e.nome)).size !== eixos.length) erros.push('O radar tem eixos com o mesmo nome.')
  if (!/^#[0-9a-fA-F]{6}$/.test(config.marca.cor)) erros.push('marca.cor tem de ser uma cor em hexadecimal, ex. #F59E0B.')

  return erros
}
