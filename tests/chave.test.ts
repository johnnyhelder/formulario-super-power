import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

// O script da chave já falhou em instalações reais por validar o prefixo (as chaves novas são sk-ant-usr-...).
// Quem decide se a chave serve é o teste à API, nunca o começo do texto.
const s = readFileSync('scripts/definir-chave.sh', 'utf8')

test('o script da chave não tem erros de sintaxe', () => {
  execFileSync('bash', ['-n', 'scripts/definir-chave.sh'])
})

test('a chave nunca é recusada pelo prefixo (só o token da assinatura sk-ant-oat)', () => {
  const recusas = s.split('\n').filter((l) => /sk-ant-/.test(l) && /(==|!=|=~)/.test(l))
  assert.deepEqual(recusas.map((l) => l.trim()).filter((l) => !l.includes('sk-ant-oat')), [])
})

test('o script trabalha na raiz do projeto, confere o dono e a Vercel antes de pedir a chave', () => {
  assert.match(s, /cd "\$RAIZ"/)
  assert.match(s, /sudo -iu \$DONO/)
  assert.ok(s.indexOf('vercel whoami') < s.indexOf('read -r -s'), 'a Vercel tem de ser conferida antes de pedir a chave')
  assert.match(s, /--prefixo/)
})
