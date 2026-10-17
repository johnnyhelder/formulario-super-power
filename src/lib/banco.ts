import { neon } from '@neondatabase/serverless'

// Uma tabela só: uma linha por conversa, atualizada a cada resposta.
// Assim dá para ver onde as pessoas desistem (coluna passo) e não só quem
// chegou ao fim. A tabela cria-se sozinha no primeiro acesso.
// Sem DATABASE_URL, nada é gravado e só o e-mail do fim chega.

export const TABELA_SQL = `
create table if not exists form_respostas (
  sessao        uuid primary key,
  passo         int not null default 0,
  concluido     boolean not null default false,
  suspeito      boolean not null default false,
  respostas     jsonb not null default '{}',
  ia            jsonb not null default '{}',
  nome          text,
  email         text,
  telefone      text,
  origem        text,
  duracao_seg   int,
  ip            text,
  user_agent    text,
  teste         boolean not null default false,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists form_respostas_criado on form_respostas (criado_em desc);
alter table form_respostas add column if not exists teste boolean not null default false;
create table if not exists form_ia_uso (
  dia       date primary key,
  chamadas  int not null default 0
);
`

let pronta: Promise<void> | null = null

export function banco() {
  const url = process.env.DATABASE_URL
  if (!url) return null
  const sql = neon(url)
  pronta ??= (async () => {
    for (const comando of TABELA_SQL.split(';').map((c) => c.trim()).filter(Boolean)) {
      await sql.query(comando)
    }
  })().catch((e) => {
    pronta = null
    throw e
  })
  return { sql, pronta }
}

export type Linha = {
  sessao: string
  passo: number
  concluido: boolean
  suspeito: boolean
  respostas: unknown
  ia: unknown
  nome: string | null
  email: string | null
  telefone: string | null
  origem: string | null
  duracaoSeg: number | null
  ip: string | null
  userAgent: string | null
  teste: boolean
}

// Grava a conversa. Devolve se ela já estava concluída antes (para avisar uma vez só).
export async function gravar(l: Linha): Promise<{ jaConcluida: boolean }> {
  const b = banco()
  if (!b) return { jaConcluida: false }
  await b.pronta
  const antes = (await b.sql.query('select concluido from form_respostas where sessao = $1', [l.sessao])) as {
    concluido: boolean
  }[]
  await b.sql.query(
    `insert into form_respostas (sessao, passo, concluido, suspeito, respostas, ia, nome, email, telefone, origem, duracao_seg, ip, user_agent, teste)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
     on conflict (sessao) do update set
       passo = excluded.passo, concluido = form_respostas.concluido or excluded.concluido,
       suspeito = excluded.suspeito, respostas = excluded.respostas, ia = excluded.ia,
       nome = coalesce(excluded.nome, form_respostas.nome), email = coalesce(excluded.email, form_respostas.email),
       telefone = coalesce(excluded.telefone, form_respostas.telefone), origem = coalesce(excluded.origem, form_respostas.origem),
       duracao_seg = excluded.duracao_seg, teste = form_respostas.teste or excluded.teste, atualizado_em = now()`,
    [
      l.sessao, l.passo, l.concluido, l.suspeito, JSON.stringify(l.respostas), JSON.stringify(l.ia),
      l.nome, l.email, l.telefone, l.origem, l.duracaoSeg, l.ip, l.userAgent, l.teste,
    ],
  )
  return { jaConcluida: Boolean(antes[0]?.concluido) }
}

// Conta mais uma chamada à IA hoje e devolve o total do dia. null = sem banco.
// Se o banco falhar, não trava a conversa: fica só o limite por IP.
export async function contarChamadaIA(): Promise<number | null> {
  const b = banco()
  if (!b) return null
  try {
    await b.pronta
    const linhas = (await b.sql.query(
      `insert into form_ia_uso (dia, chamadas) values (current_date, 1)
       on conflict (dia) do update set chamadas = form_ia_uso.chamadas + 1
       returning chamadas`,
    )) as { chamadas: number }[]
    return linhas[0]?.chamadas ?? null
  } catch (e) {
    console.error('[ia] não consegui contar a chamada no banco:', e)
    return null
  }
}
