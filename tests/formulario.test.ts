import { test } from 'node:test'
import assert from 'node:assert/strict'
import { FORMULARIO } from '../formulario'
import { problemasDa } from '../src/lib/validar'
import { esquemasJSON } from '../src/lib/ia'
import type { Config } from '../src/lib/tipos'

test('o formulario.ts está coerente', () => {
  assert.deepEqual(problemasDa(FORMULARIO), [])
})

test('os esquemas da IA montam-se a partir do formulario.ts', () => {
  const e = esquemasJSON(FORMULARIO)
  assert.ok(e.empresa.properties.pais)
  assert.ok(e.notas.properties.niveis)
})

test('o verificador apanha os erros mais comuns', () => {
  const ruim: Config = {
    ...FORMULARIO,
    passos: [
      ...FORMULARIO.passos.filter((p) => p.tipo !== 'telefone'),
      { id: 'nome', tipo: 'texto', pergunta: 'De novo?', marcador: 'x' },
    ],
    contato: { nome: 'nome', email: 'empresa' },
  }
  const erros = problemasDa(ruim)
  assert.ok(erros.some((e) => e.includes('mais de um passo')))
  assert.ok(erros.some((e) => e.includes('contato.email')))
  assert.ok(erros.some((e) => e.includes('último passo')))
})
