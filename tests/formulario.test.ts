import { test } from 'node:test'
import assert from 'node:assert/strict'
import { FORMULARIO } from '../formulario'
import { FORMULARIO as EVENTOS } from '../exemplos/eventos'
import { problemasDa } from '../src/lib/validar'
import { esquemasJSON } from '../src/lib/ia'
import type { Config } from '../src/lib/tipos'

test('o formulario.ts está coerente', () => {
  assert.deepEqual(problemasDa(FORMULARIO), [])
})

test('o exemplo de eventos está coerente', () => {
  assert.deepEqual(problemasDa(EVENTOS), [])
})

test('os esquemas da IA montam-se a partir da configuração', () => {
  const e = esquemasJSON(FORMULARIO)
  assert.ok(e.empresa.properties.pais)
  assert.ok(e.notas.properties.niveis)
  assert.ok(e.aprofundar.properties.sugestoes && e.aprofundar.properties.pergunta)
  // Sem passo extra, a chamada de aprofundar não pede pergunta.
  const semExtra = esquemasJSON({ ...EVENTOS, passos: EVENTOS.passos.filter((p) => p.tipo !== 'extra') })
  assert.ok(semExtra.aprofundar.properties.sugestoes && !('pergunta' in semExtra.aprofundar.properties))
})

test('o verificador apanha os erros mais comuns', () => {
  const ruim: Config = {
    ...FORMULARIO,
    passos: [
      ...FORMULARIO.passos.filter((p) => p.tipo !== 'telefone'),
      { id: 'nome', tipo: 'texto', pergunta: 'De novo?', marcador: 'x' },
    ],
    contato: { nome: 'nome', email: 'empresa' },
    coerencia: [{ id: 'x', quando: () => true, pergunta: '?', corrigir: 'naoexiste' }],
  }
  const erros = problemasDa(ruim)
  assert.ok(erros.some((e) => e.includes('mais de um passo')))
  assert.ok(erros.some((e) => e.includes('contato.email')))
  assert.ok(erros.some((e) => e.includes('último passo')))
  assert.ok(erros.some((e) => e.includes('naoexiste')))
})
