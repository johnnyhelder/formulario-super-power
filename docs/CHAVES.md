# Chaves e contas

Nenhuma é obrigatória para ver o formulário a funcionar no seu computador. Para publicar, precisa de **pelo menos o banco ou o e-mail** (senão os leads perdem-se). As outras ligam os extras de IA.

Grave cada chave com o comando abaixo. Ela não aparece na tela, não passa pelo chat e vai direto para o `.env.local` (e para a Vercel, se o projeto já estiver ligado).

```bash
npm run chave -- NOME_DA_VARIAVEL
```

No Claude Code, escreva com `!` na frente (`! npm run chave`), para o comando rodar no seu terminal.

| Variável | Onde criar | Para quê | Sem ela |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | [platform.claude.com](https://platform.claude.com) > API Keys. Carregue alguns dólares de crédito em Billing. | Anotações, cenário, pergunta extra, mapa, leitura da pesquisa. | A conversa funciona, sem os extras de IA. |
| `FIRECRAWL_API_KEY` | [firecrawl.dev](https://firecrawl.dev) > API Keys | Pesquisar a empresa na internet. | Não aparece o cartão "É esta a sua empresa?". |
| `DATABASE_URL` | [neon.tech](https://neon.tech) > projeto novo > Connect > connection string | Gravar cada conversa, inclusive quem desistiu a meio (`npm run leads`). | Só o e-mail do fim chega. |
| `RESEND_API_KEY` | [resend.com](https://resend.com) > API Keys | E-mail a cada lead novo. | Ninguém é avisado; os leads ficam só no banco. |
| `AVISO_PARA` | (não é segredo) | Quem recebe o e-mail. Vários, separados por vírgula. | |
| `AVISO_DE` | (não é segredo) Domínio verificado no Resend > Domains | Quem envia, ex. `Formulário <form@seudominio.com>`. | Usa `onboarding@resend.dev`, que só entrega ao dono da conta Resend. |

`AVISO_PARA` e `AVISO_DE` não são segredo: pode escrevê-las direto no `.env.local`.

Depois, confira tudo:

```bash
npm run verificar
```

## Chave da Anthropic "não presa a um workspace"

Algumas chaves novas pedem também o ID do workspace. O `npm run chave` percebe sozinho, explica onde encontrar o ID (platform.claude.com > Settings > Workspaces) e grava `ANTHROPIC_WORKSPACE_ID`.

## Montando para um cliente

Cada cliente tem **as próprias contas e as próprias chaves**. Nunca reaproveite a sua. Os custos ficam misturados e, se um cliente sair, você não consegue desligar só a parte dele.
