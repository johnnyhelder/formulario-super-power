/**
 * Versão para alojamento PHP (sem Node no servidor): gera a pasta publicar/
 * com a página estática e a API em PHP, pronta para enviar por FTP, SFTP ou rsync.
 *   npm run exportar                       (o formulário fica na raiz do domínio)
 *   npm run exportar -- --caminho /pedido  (o formulário fica em seudominio.com/pedido/)
 * As chaves NÃO vão na pasta: ficam num segredos.ini no servidor (docs/PHP.md).
 */
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { FORMULARIO as C } from '../formulario'
import { problemasDa } from '../src/lib/validar'
import { MODELO, esquemasJSON, passoSugestao } from '../src/lib/ia'
import { etapas } from '../src/lib/fluxo'
import { instrucao, instrucaoEmpresa, sistema } from '../src/lib/prompts'

const raiz = resolve(process.cwd())
const i = process.argv.indexOf('--caminho')
const caminho = i > 0 ? process.argv[i + 1].replace(/\/+$/, '') : ''
if (caminho && !/^\/[a-z0-9/_-]+$/i.test(caminho)) {
  console.error('\n✗ O caminho tem de ser algo como /pedido (letras, números, - e _).\n')
  process.exit(1)
}
const problemas = problemasDa(C)
if (problemas.length) {
  console.error('\n✗ O formulario.ts tem problemas. Rode npm test.\n')
  process.exit(1)
}

// Só as variáveis públicas (NEXT_PUBLIC_*) do .env.local vão para a página. As chaves nunca.
const publicas: Record<string, string> = {}
if (existsSync(join(raiz, '.env.local'))) {
  for (const linha of readFileSync(join(raiz, '.env.local'), 'utf8').split(/\r?\n/)) {
    const m = /^\s*(NEXT_PUBLIC_[A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(linha)
    if (m && m[2]) publicas[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2')
  }
}

// O Next não exporta rotas de API: compila-se uma cópia do projeto sem elas.
const copia = join(tmpdir(), `form-dinamico-exportar-${process.pid}`)
rmSync(copia, { recursive: true, force: true })
cpSync(raiz, copia, {
  recursive: true,
  filter: (f) => !/[/\\](node_modules|\.next|\.git|publicar|out|\.vercel)([/\\]|$)/.test(f.slice(raiz.length)) &&
    !f.startsWith(join(raiz, 'src/app/api')) && !/\.env/.test(f.slice(raiz.length)),
})
symlinkSync(join(raiz, 'node_modules'), join(copia, 'node_modules'))
console.log('A compilar a página estática...')
execSync('npx next build --webpack', {
  cwd: copia,
  stdio: 'inherit',
  env: { ...process.env, ...publicas, FD_EXPORTAR: '1', NEXT_PUBLIC_FD_PHP: '1', NEXT_PUBLIC_FD_CAMINHO: caminho },
})

const destino = join(raiz, 'publicar')
rmSync(destino, { recursive: true, force: true })
mkdirSync(destino)
cpSync(join(copia, 'out'), destino, { recursive: true })
cpSync(join(raiz, 'php', 'api'), join(destino, 'api'), { recursive: true })
rmSync(copia, { recursive: true, force: true })

// O que o PHP precisa do formulario.ts, já pronto (não corre TypeScript).
const DADOS = '{{DADOS}}'
writeFileSync(
  join(destino, 'api', 'config.json'),
  JSON.stringify(
    {
      modelo: MODELO,
      sistema: sistema(C),
      empresa: instrucaoEmpresa('{{NOME}}', '{{RESULTADOS}}'),
      instrucoes: {
        notas: instrucao(C, 'notas', DADOS),
        aprofundar: instrucao(C, 'aprofundar', DADOS),
        mapa: instrucao(C, 'mapa', DADOS),
        resumo: instrucao(C, 'resumo', DADOS),
      },
      esquemas: esquemasJSON(C),
      passos: C.passos.map((p) => ({ id: p.id, tipo: p.tipo, resumo: p.resumo })),
      contato: C.contato,
      sugestaoMaximo: passoSugestao(C)?.maximo ?? 3,
      totalEtapas: etapas(C).length,
    },
    null,
    2,
  ),
)
console.log(`\n✓ Pasta publicar/ pronta${caminho ? ` para ${caminho}/` : ''}. Envie o conteúdo para o servidor e siga docs/PHP.md.\n`)
