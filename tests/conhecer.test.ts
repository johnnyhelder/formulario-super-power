import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { FORMULARIO } from '../formulario'
import { NEGOCIO } from '../negocio'
import { instrucao, sistema } from '../src/lib/prompts'
import { problemasDoNegocio } from '../src/lib/validar'
import { descobrirSite, dominioPrincipal, escolherPaginas, funcaoDoFormulario, origemDe } from '../scripts/_conhecer'

test('o negocio.ts está dentro dos limites', () => {
  assert.deepEqual(problemasDoNegocio(NEGOCIO), [])
  assert.equal(problemasDoNegocio({ objetivo: 'x'.repeat(301), publico: '', interno: '' }).length, 1)
})

test('o interno só entra na ficha do lead', () => {
  const N = { objetivo: 'marcar visitas', publico: 'Vende casamentos no Douro.', interno: 'SEGREDO-INTERNO abaixo de 80 convidados não compensa' }
  assert.match(sistema(FORMULARIO, N), /marcar visitas/)
  assert.match(sistema(FORMULARIO, N), /Douro/)
  assert.doesNotMatch(sistema(FORMULARIO, N), /SEGREDO-INTERNO/)
  for (const tipo of ['notas', 'aprofundar', 'resumo', 'mapa'] as const) assert.doesNotMatch(instrucao(FORMULARIO, tipo, '<dados></dados>', '', N), /SEGREDO-INTERNO/)
  assert.match(instrucao(FORMULARIO, 'ficha', '<dados></dados>', '', N), /SEGREDO-INTERNO/)
  // Vazio, os textos ficam iguais aos de antes.
  assert.equal(sistema(FORMULARIO), sistema(FORMULARIO, { objetivo: '', publico: '', interno: '' }))
})

// O formulario.ts vai para o navegador. Se algum arquivo da página importar o negocio.ts, o `interno` vaza.
test('nenhum arquivo da página importa o negocio.ts', () => {
  const vistos = new Set<string>()
  const fila = ['src/app/page.tsx', 'src/app/layout.tsx'].map((f) => resolve(f))
  while (fila.length) {
    const arq = fila.pop()!
    if (vistos.has(arq)) continue
    vistos.add(arq)
    for (const [, alvo] of readFileSync(arq, 'utf8').matchAll(/from\s+'([^']+)'/g)) {
      if (!alvo.startsWith('.') && !alvo.startsWith('@/')) continue
      const base = alvo.startsWith('@/') ? resolve('src', alvo.slice(2)) : resolve(dirname(arq), alvo)
      const real = ['.ts', '.tsx', '/index.ts'].map((e) => base + e).find(existsSync)
      if (real) fila.push(real)
    }
  }
  assert.ok(vistos.has(resolve('formulario.ts')))
  assert.ok(!vistos.has(resolve('negocio.ts')), 'a página chega ao negocio.ts')
})

test('descobre onde o formulário mora', () => {
  assert.equal(origemDe('diagnostico.loja.com.br/x'), 'https://diagnostico.loja.com.br')
  assert.equal(origemDe('https://meu-form.vercel.app'), '')
  assert.equal(dominioPrincipal('https://diagnostico.loja.com.br'), 'loja.com.br')
  assert.equal(dominioPrincipal('https://www.quinta.pt'), 'quinta.pt')
  assert.equal(dominioPrincipal('https://pedido.quinta.pt'), 'quinta.pt')
  const C = { ...FORMULARIO, privacidade: { texto: '', link: 'https://www.exemplo.pt/privacidade' } }
  assert.deepEqual(descobrirSite(undefined, {}, C), { site: 'https://www.exemplo.pt', de: 'privacidade.link do formulario.ts' })
  assert.equal(descobrirSite(undefined, { FORMULARIO_SITE: 'a.com', VERCEL_PROJECT_PRODUCTION_URL: 'b.vercel.app' }, C).site, 'https://a.com')
  assert.equal(descobrirSite('c.com', { FORMULARIO_SITE: 'a.com' }, C).de, '--site')
})

test('escolhe as páginas que mais dizem do negócio', () => {
  const o = 'https://quinta.pt'
  const blog = Array.from({ length: 20 }, (_, i) => `${o}/blog/post-${i}`)
  const urls = [...blog, `${o}/carrinho`, `${o}/foto.jpg`, `${o}/sobre/`, `${o}/sobre`, `${o}/servicos`, `${o}/precos`, 'https://outro.com/sobre', `${o}/privacidade`]
  const p = escolherPaginas(urls, o, 10)
  assert.equal(p[0], o)
  assert.ok(p.includes(`${o}/sobre`) && p.includes(`${o}/servicos`) && p.includes(`${o}/precos`))
  assert.ok(!p.some((u) => /carrinho|jpg|outro\.com|privacidade/.test(u)))
  assert.equal(p.filter((u) => u.includes('/sobre')).length, 1)
  assert.ok(p.filter((u) => u.includes('/blog/')).length <= 6)
})

test('descreve ao Claude para que serve o formulário', () => {
  const t = funcaoDoFormulario(FORMULARIO)
  assert.match(t, /\[problema\]/)
  assert.match(t, /Até 10, 10 a 50/)
  assert.doesNotMatch(t, /undefined/)
})
