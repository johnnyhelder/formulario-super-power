import { test } from 'node:test'
import assert from 'node:assert/strict'
import { FORMULARIO as C } from '../formulario'
import { CONFIRMAR, dadosParaIA, linhasResumo, proxima, radarValores } from '../src/lib/fluxo'
import type { EmpresaIA } from '../src/lib/ia'

const achada = (confianca: EmpresaIA['confianca']): EmpresaIA => ({
  encontrada: true, confianca, nome: 'Padaria Sol', descricao: 'Padaria artesanal', cidade: 'Porto',
  pais: 'Portugal', segmentos: ['Loja ou comércio'], site: '', fundada: '',
})

test('começa pelo primeiro passo', () => {
  assert.equal(proxima(C, null, {}, {}), 'nome')
})

test('só pergunta "É esta a sua empresa?" quando a pesquisa achou com confiança', () => {
  assert.equal(proxima(C, 'empresa', { empresa: 'Padaria Sol' }, {}), 'pais')
  assert.equal(proxima(C, 'empresa', { empresa: 'Padaria Sol' }, { empresa: achada('baixo') }), 'pais')
  assert.equal(proxima(C, 'empresa', { empresa: 'Padaria Sol' }, { empresa: achada('medio') }), 'empresa' + CONFIRMAR)
})

test('pula o país quando a empresa confirmada já o trouxe', () => {
  assert.equal(proxima(C, 'empresa' + CONFIRMAR, { empresa: 'Padaria Sol', pais: 'Portugal' }, {}), 'segmento')
})

test('a pergunta extra e o mapa só entram quando a IA os preparou', () => {
  assert.equal(proxima(C, 'ticket', {}, {}), 'momento')
  assert.equal(proxima(C, 'ticket', {}, { pergunta: { pergunta: 'Quem responde?', opcoes: ['Eu'], palpite: '' } }), 'extra')
  assert.equal(proxima(C, 'momento', {}, {}), 'email')
})

test('acaba depois do último passo', () => {
  assert.equal(proxima(C, 'whatsapp', {}, {}), null)
})

test('o radar fica sempre entre 0 e 1', () => {
  const v = radarValores(C, { contatos: 'Mais de 200', momento: 'Só curiosidade', canais: ['Instagram'] }, {})
  assert.equal(v.length, C.radar!.eixos.length)
  for (const x of v) assert.ok(x >= 0 && x <= 1)
})

test('o painel mostra o que foi respondido, com a cidade da empresa confirmada', () => {
  const l = linhasResumo(C, { empresa: 'Padaria Sol', segmento: 'Loja ou comércio' }, { empresa: achada('alto'), empresaConfirmada: true })
  assert.deepEqual(l.map(([k]) => k), ['Empresa', 'Onde', 'Segmento'])
})

test('a IA não recebe nome, e-mail nem telefone', () => {
  const d = dadosParaIA(C, { nome: 'Ana', email: 'ana@x.pt', whatsapp: '+351 900', empresa: 'Padaria Sol' }, {})
  assert.ok(d.includes('Padaria Sol'))
  assert.ok(!d.includes('Ana') && !d.includes('ana@x.pt') && !d.includes('+351'))
})
