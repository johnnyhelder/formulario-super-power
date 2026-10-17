-- Formulário Super Power: as tabelas. O site cria-as sozinho no primeiro acesso; este arquivo serve para
-- projetos que gerem o banco por conta própria (Prisma, migrações). Só cria, nunca apaga.
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
