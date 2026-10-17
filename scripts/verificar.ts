/**
 * Confere tudo o que dá para conferir sem sair do terminal. Rode sempre que mudar alguma coisa.
 *   npm run verificar
 * Nunca mostra segredos inteiros e não gasta créditos (a chamada de teste à IA custa uma fração de cêntimo).
 */
import './_env'
import { neon } from '@neondatabase/serverless'
import { FORMULARIO } from '../formulario'
import { problemasDa } from '../src/lib/validar'
import { mascarar } from './_env'

const env = (n: string) => (process.env[n] ?? '').trim()
let erros = 0
const ok = (t: string) => console.log(`  ✓ ${t}`)
const erro = (t: string) => (erros++, console.log(`  ✗ ${t}`))
const aviso = (t: string) => console.log(`  ! ${t}`)
const secao = (t: string) => console.log(`\n${t}`)

async function main() {
  secao('1. Formulário (formulario.ts)')
  const problemas = problemasDa(FORMULARIO)
  if (problemas.length === 0) ok(`${FORMULARIO.passos.length} passos, tudo coerente`)
  else problemas.forEach(erro)
  if (FORMULARIO.marca.nome === 'Sua Marca') aviso('marca.nome ainda é "Sua Marca". Troque pelo nome real.')

  secao('2. IA (Anthropic)')
  const chave = env('ANTHROPIC_API_KEY')
  if (!chave) {
    aviso('ANTHROPIC_API_KEY vazia: o formulário funciona, mas sem pesquisa da empresa, anotações, pergunta extra e mapa.')
  } else {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': chave,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
        ...(env('ANTHROPIC_WORKSPACE_ID') ? { 'anthropic-workspace-id': env('ANTHROPIC_WORKSPACE_ID') } : {}),
      },
      body: JSON.stringify({ model: 'claude-haiku-5-5', max_tokens: 5, messages: [{ role: 'user', content: 'ok' }] }),
    })
    const j = (await r.json().catch(() => ({}))) as { error?: { message?: string } }
    if (r.ok) ok(`chave válida e com créditos (${mascarar(chave)})`)
    else erro(`a Anthropic recusou a chave (HTTP ${r.status}: ${j.error?.message ?? 'sem detalhe'})`)
  }

  secao('3. Pesquisa da empresa (Firecrawl)')
  if (!env('FIRECRAWL_API_KEY')) aviso('FIRECRAWL_API_KEY vazia: a conversa não pesquisa a empresa na internet.')
  else ok(`FIRECRAWL_API_KEY = ${mascarar(env('FIRECRAWL_API_KEY'))}`)

  secao('4. Banco (Neon)')
  if (!env('DATABASE_URL')) {
    aviso('DATABASE_URL vazia: nada é gravado; só o e-mail do fim chega.')
  } else {
    try {
      await neon(env('DATABASE_URL')).query('select 1')
      ok('ligação ao banco ok (a tabela form_respostas cria-se sozinha na primeira resposta)')
    } catch (e) {
      erro(`não consegui ligar ao banco: ${e instanceof Error ? e.message : e}`)
    }
  }

  secao('5. Aviso por e-mail (Resend)')
  if (!env('RESEND_API_KEY') || !env('AVISO_PARA')) aviso('RESEND_API_KEY ou AVISO_PARA vazia: ninguém recebe e-mail quando chega um lead.')
  else ok(`avisa ${env('AVISO_PARA')} a partir de ${env('AVISO_DE') || 'onboarding@resend.dev (só entrega ao dono da conta Resend)'}`)

  if (!env('DATABASE_URL') && !(env('RESEND_API_KEY') && env('AVISO_PARA'))) {
    erro('Sem banco e sem e-mail, os leads perdem-se. Configure pelo menos um dos dois.')
  }

  console.log(erros ? `\n✗ ${erros} problema(s) para corrigir.\n` : '\n✓ Tudo pronto.\n')
  process.exit(erros ? 1 : 0)
}

main()
