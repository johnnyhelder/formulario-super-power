import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readdirSync } from 'node:fs'

// A versão PHP: confere a sintaxe de cada ficheiro, se houver PHP nesta máquina.
let temPhp = true
try { execFileSync('php', ['-v'], { stdio: 'ignore' }) } catch { temPhp = false }

test('os ficheiros PHP não têm erros de sintaxe', { skip: !temPhp && 'sem PHP nesta máquina' }, () => {
  for (const f of readdirSync('php/api').filter((x) => x.endsWith('.php'))) {
    assert.doesNotThrow(() => execFileSync('php', ['-l', `php/api/${f}`], { stdio: 'pipe' }), f)
  }
})
