# Instalar dentro de um site Next.js que já existe

Para pôr o formulário numa página de um site que já tem visual, rotas, banco e chaves próprios, sem mexer no resto.
(Site em PHP, WordPress ou cPanel: veja [PHP.md](PHP.md).)

## 1. Copiar os arquivos

| Do formulário | Para o seu site |
|---|---|
| `formulario.ts` e `negocio.ts` | a raiz do projeto (ou ajuste o caminho nos imports). O `negocio.ts` só pode ser importado por código do servidor (`src/lib/claude.ts`, a rota das respostas), nunca pela página. |
| `scripts/conhecer.ts`, `scripts/_conhecer.ts`, `scripts/_env.ts` | `scripts/`, com `"conhecer": "tsx scripts/conhecer.ts"` no `package.json`. Rode `npm run conhecer -- --site seudominio.com` |
| `src/lib/*` | a mesma pasta, ou `src/lib/formulario/` (ajuste os imports `@/lib/...`) |
| `src/app/conversa.tsx`, `src/app/pecas.tsx`, `src/app/formulario.css` | a pasta da página, ex. `src/app/diagnostico/` |
| `src/app/api/formulario/` (ia, respostas, sessao) | `src/app/api/formulario/` |
| `scripts/definir-chave.sh` | `scripts/` (sem reescrever, ver AGENTS.md) |

As rotas ficam em `/api/formulario/ia`, `/api/formulario/respostas` e `/api/formulario/sessao`, para não chocar com as rotas do site.

## 2. A página

Importe só o `formulario.css` (o `globals.css` do formulário é para a página própria e não vai) e embrulhe a conversa num elemento com a classe `fd-raiz`. Tudo o que o formulário desenha fica dentro dessa classe, por isso o resto do site não muda.

```tsx
import './formulario.css'
import { Conversa } from './conversa'
import { FORMULARIO as C } from '@/../formulario'

export default function Pagina() {
  return (
    <div className="fd-raiz" data-tema={C.marca.tema} style={{ '--acao': C.marca.cor } as React.CSSProperties}>
      <Conversa />
    </div>
  )
}
```

As fontes: o formulário usa `--fonte-texto` e `--fonte-mono`. Defina-as com as fontes do seu site (no `.fd-raiz`) ou carregue Archivo e JetBrains Mono como no `src/app/layout.tsx`.

Cores: todas são tokens no `.fd-raiz` de `formulario.css` (`--fundo`, `--tinta`, `--cor-a` a `--cor-d`, `--cena-*` para o desenho). Para casar com a marca, sobrescreva os tokens numa classe sua, sem editar o arquivo.

## 3. Chaves sem pisar as do site

Se o site já tem `ANTHROPIC_API_KEY` (para outra função), grave a do formulário com prefixo:

```bash
npm run chave -- ANTHROPIC_API_KEY --prefixo FORMULARIO_
npm run chave -- FIRECRAWL_API_KEY --prefixo FORMULARIO_
```

O formulário lê primeiro `FORMULARIO_ANTHROPIC_API_KEY`, `FORMULARIO_ANTHROPIC_WORKSPACE_ID` e `FORMULARIO_FIRECRAWL_API_KEY`. Use uma chave num workspace próprio, com limite, para ver o gasto do formulário à parte.

## 4. Banco

O formulário usa duas tabelas, `form_respostas` e `form_ia_uso`, e por defeito cria-as sozinho no primeiro acesso (Neon/Postgres).

**Se o projeto usa Prisma**, isso faz o banco divergir do `schema.prisma`, e um `prisma db push` pode querer apagar as tabelas. Faça assim:

1. Copie os dois models de `db/prisma.prisma` para o seu `schema.prisma`.
2. Ponha `FORMULARIO_CRIAR_TABELAS=0` no `.env.local` e na Vercel (o formulário deixa de criar tabelas).
3. Crie as tabelas pelo caminho normal do projeto (`prisma db push` ou uma migração).

**Se o projeto usa migrações SQL**, use `db/schema.sql` (só cria, nunca apaga) e ponha também `FORMULARIO_CRIAR_TABELAS=0`.

## 5. Pixel e testes

Se o site já tem o Pixel da Meta, o formulário dispara `Lead` no fim, exceto com `?teste=1` no endereço (os testes não estragam a otimização dos anúncios). Teste sempre com `?teste=1`.
