/**
 * Carrega o .env.local (e o .env, se existir) para os scripts de terminal.
 * O Next.js já faz isso sozinho no dev e no build; aqui é só para `npm run <script>`.
 */
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

export const ARQUIVO_ENV = resolve(process.cwd(), '.env.local')

for (const nome of ['.env.local', '.env']) {
  const caminho = resolve(process.cwd(), nome)
  if (!existsSync(caminho)) continue
  for (const linha of readFileSync(caminho, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(linha)
    if (!m || process.env[m[1]] !== undefined) continue
    process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2')
  }
}

/** Lê uma variável obrigatória ou encerra com uma mensagem clara. */
export function exigir(nome: string, dica: string): string {
  const v = (process.env[nome] ?? '').trim()
  if (!v) {
    console.error(`\n✗ Falta ${nome} no .env.local. ${dica}\n`)
    process.exit(1)
  }
  return v
}

/** Mostra só o começo e o fim de um segredo. */
export function mascarar(valor: string): string {
  return valor.length <= 12 ? '***' : `${valor.slice(0, 6)}...${valor.slice(-4)} (${valor.length} caracteres)`
}
