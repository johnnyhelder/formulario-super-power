/**
 * Mostra no terminal as últimas conversas e onde as pessoas desistem.
 *   npm run leads
 */
import { neon } from '@neondatabase/serverless'
import { exigir } from './_env'
import { etapas } from '../src/lib/fluxo'
import { FORMULARIO } from '../formulario'

const sql = neon(exigir('DATABASE_URL', 'Copie a connection string do Neon (Dashboard > Connect).'))
const ETAPAS = etapas(FORMULARIO)

async function main() {
  const leads = (await sql.query(
    `select nome, email, telefone, origem, duracao_seg, criado_em from form_respostas
     where concluido and not suspeito order by criado_em desc limit 20`,
  )) as { nome: string; email: string; telefone: string | null; origem: string | null; duracao_seg: number | null; criado_em: string }[]
  console.log(`\nÚltimos leads (${leads.length})`)
  for (const l of leads) {
    const quando = new Date(l.criado_em).toLocaleString('pt-BR')
    console.log(`  ${quando}  ${l.nome} · ${l.email}${l.telefone ? ` · ${l.telefone}` : ''}${l.origem ? `  [${l.origem}]` : ''}`)
  }

  const funil = (await sql.query(
    `select passo, count(*)::int as n from form_respostas where not suspeito and criado_em > now() - interval '30 days' group by passo order by passo`,
  )) as { passo: number; n: number }[]
  const total = funil.reduce((s, f) => s + f.n, 0)
  console.log(`\nOnde pararam, últimos 30 dias (${total} conversas)`)
  for (const f of funil) {
    const onde = f.passo >= ETAPAS.length ? 'concluíram' : `pararam depois de "${ETAPAS[f.passo - 1] ?? 'abrir a página'}"`
    console.log(`  ${String(f.n).padStart(4)}  ${onde}`)
  }
  console.log('')
}

main().catch((e: unknown) => {
  console.error('\n✗', e instanceof Error ? e.message : e, '\n')
  process.exit(1)
})
