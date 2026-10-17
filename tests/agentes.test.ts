import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// As instruções para LLMs vivem só no AGENTS.md; o CLAUDE.md importa-o.
test('o CLAUDE.md importa o AGENTS.md', () => {
  assert.match(readFileSync('CLAUDE.md', 'utf8'), /^@AGENTS\.md$/m)
})
