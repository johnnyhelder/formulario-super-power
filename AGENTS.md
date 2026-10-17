# AGENTS.md

Instruções para qualquer agente de código (Claude Code, Codex, Cursor, Gemini CLI, Copilot e outros) que abrir este repositório. **Este arquivo é a fonte única.** O `CLAUDE.md` só importa este arquivo; um teste (`tests/agentes.test.ts`) garante que continue assim. Mude as regras aqui.

Quando a pessoa disser "me ajuda a configurar" (ou algo parecido), comece pelo **Roteiro** abaixo. Não explique o projeto inteiro antes; faça as perguntas do diagnóstico.

## Quem você está ajudando

Quase sempre alguém **que não é programador**: dono de negócio, gestor de tráfego, agência montando para um cliente. Fale em português do Brasil, trate por "você", frases curtas, sem jargão. Quando um termo técnico for inevitável (deploy, variável de ambiente), explique em uma frase na primeira vez.

## O que é este projeto

Um formulário que conversa. Uma pergunta de cada vez, como num chat, com IA em segundo plano que:

- pesquisa a empresa na internet assim que a pessoa escreve o nome e pergunta "É esta a sua empresa?";
- anota o problema enquanto a pessoa escreve e desenha o cartão do cenário;
- cria uma pergunta extra a partir do que ela contou;
- desenha o mapa do caso no fim, que a pessoa confirma ou ajusta.

Next.js (App Router, TypeScript) na Vercel, Postgres no Neon, e-mail pelo Resend, IA pelo Claude Haiku, pesquisa pelo Firecrawl. **Tudo o que muda de um negócio para outro está no `formulario.ts`.** O resto do código não precisa de ser tocado para adaptar o formulário.

Mapa do código:

| Arquivo | O que faz |
|---|---|
| `formulario.ts` | Língua, perguntas, opções, textos, cores, o que a IA sabe do negócio, regras de coerência, radar, assunto do e-mail. |
| `exemplos/eventos.ts` | Um segundo exemplo, bem diferente (pedidos de orçamento de eventos, PT-PT, tema claro). Para partir dele, copie-o por cima do `formulario.ts`. |
| `src/lib/textos.ts` | Os textos fixos da conversa em pt-BR, pt-PT, es e en. |
| `src/lib/tipos.ts` | O que cada tipo de passo aceita (leia antes de editar o `formulario.ts`). |
| `src/lib/fluxo.ts` | Que pergunta vem a seguir, painel, radar, o que a IA lê. Funções puras, testadas. |
| `src/lib/validar.ts` | Confere se o `formulario.ts` está coerente. |
| `src/lib/ia.ts` | Formatos das respostas da IA (JSON Schema + zod). |
| `src/app/conversa.tsx` | O chat. `src/app/pecas.tsx`: os cartões. `src/app/globals.css`: o visual. |
| `src/app/api/ia/route.ts` | Chamadas à IA e à pesquisa. `src/app/api/respostas/route.ts`: grava e avisa por e-mail. |
| `src/lib/banco.ts` | A tabela `form_respostas` (cria-se sozinha). |
| `src/lib/prompts.ts` | Os textos que vão à IA (usados pela rota e, via `npm run exportar`, pela versão PHP). |
| `php/api/` e `scripts/exportar.ts` | A versão PHP: a mesma página, estática, com três endereços PHP. Guia em `docs/PHP.md`. Mudou a lógica da IA ou do aviso? Mude nas duas (`src/app/api/` e `php/api/`). |

## Regras de segurança (inegociáveis)

1. **Segredos só no `.env.local` e nas variáveis da Vercel.** `ANTHROPIC_API_KEY`, `FIRECRAWL_API_KEY`, `DATABASE_URL` e `RESEND_API_KEY` nunca vão para código, commit, README, issue ou log.
2. **Peça para a pessoa gravar cada chave com `npm run chave -- NOME`**, que lê o valor escondido, testa a da Anthropic e grava no `.env.local` com permissão só para ela (e na Vercel, se o projeto estiver ligado). **Ela tem de rodar num terminal a sério, aberto à parte, na pasta do projeto.** O `!` do Claude Code não serve: não tem teclado para a leitura escondida (o script avisa e não grava nada). Avise antes que o script pode pedir o **ID do workspace** da Anthropic (algumas chaves novas precisam dele; está em platform.claude.com > Settings > Workspaces e não é segredo). Nunca peça que cole uma chave no chat. Se ela colar mesmo assim, não repita o valor, grave no `.env.local` e recomende criar outra chave e apagar a exposta.
3. **Nunca imprima segredos.** Não rode `cat .env.local`, `env` ou `printenv`. Para conferir, `npm run verificar`, que mascara os valores.
4. **Uma chave por projeto.** Se a pessoa monta para vários clientes, cada cliente tem a própria conta (ou, no mínimo, o próprio workspace na Anthropic, com limite de gasto mensal) e as próprias chaves. Se a chave sair da conta de quem instala, os custos do cliente caem no cartão errado. Nunca copie a chave de um projeto para outro.
5. **O token de login da assinatura do Claude (`sk-ant-oat...`) não serve aqui.** Só chaves da API, criadas em platform.claude.com.
6. **Antes de qualquer commit**, confirme que `.env.local` está ignorado (`git check-ignore .env.local`). Nunca use `git add -A` sem olhar o `git status`.
7. **Dados de quem responde são pessoais.** Não exporte nem mostre a lista de leads fora do terminal da pessoa. A IA nunca recebe nome, e-mail ou telefone (o `dadosParaIA` tira-os; mantenha assim).

## Roteiro

Comece com um diagnóstico curto, em **uma** mensagem:

1. Para que negócio é o formulário? O que ele vende, para quem, em que país e em que língua (pt-BR, pt-PT, es, en)?
2. O que quer saber de quem responde para decidir se é um bom cliente? (porte, orçamento, urgência, região...)
3. Para onde vão os leads: e-mail, banco, os dois?
4. O formulário vai ser um site à parte (ex. `diagnostico.seudominio.com`), uma página dentro de um site Next.js que já existe, ou vai morar num alojamento PHP (cPanel, WordPress, servidor próprio sem Node)? No último caso, siga `docs/PHP.md` (`npm run exportar`).

Depois, siga as etapas e marque o progresso ("etapa 2 de 6").

| Etapa | O que fazer | Prova de que deu certo |
|---|---|---|
| 1. Perguntas | Reescrever o `formulario.ts` com a pessoa (ver **Como escrever as perguntas**). Mostre a lista de perguntas em texto simples antes de editar e espere o ok. | `npm test` passa. |
| 2. Ver a funcionar | `npm run dev` e abrir http://localhost:3000. Sem chaves, a conversa já funciona (sem os extras de IA). | A pessoa respondeu até ao fim. |
| 3. Chaves | `npm run chave` (Anthropic), `npm run chave -- FIRECRAWL_API_KEY`, e o banco e o e-mail (`docs/CHAVES.md`). | `npm run verificar` sem ✗. |
| 4. Publicar | `docs/PUBLICAR.md`: GitHub, Vercel, variáveis, domínio. | O site publicado, aberto com `?teste=1`, responde até ao fim e o e-mail chega com [TESTE] no assunto. |
| 5. Medir | Ligar o Pixel ou o Google Tag (já dispara `Lead` no fim se o `fbq` existir na página). Mostrar `npm run leads`. | A pessoa vê o lead de teste. |
| 6. Fechamento | Os testes feitos com `?teste=1` no endereço ficam marcados e apagam-se com `npm run leads -- apagar-testes`. Lembrar de olhar o funil (`npm run leads`) depois da primeira semana. | Ela confirma. |

## Como escrever as perguntas

O que faz este formulário dar prazer em responder (e filtrar bem) é o desenho das perguntas, não o código.

- **Código para o que tem resposta certa, IA para o resto.** Faixas, países, segmentos e prazos são opções fechadas (`escolha`, `varias`, `escala`). A IA entra onde a pessoa escreve com as palavras dela (`problema`) e para mostrar que entendeu (cenário, pergunta extra, mapa).
- **Uma ideia por pergunta**, curta, no tom de conversa. Use as respostas anteriores no texto (`(r) => \`E onde fica a ${r.empresa}?\``).
- **Comece fácil** (nome, empresa) e deixe o contato para o fim, quando a pessoa já investiu e já viu o mapa.
- **Cada pergunta tem de mudar alguma coisa**: o que você faz com o lead, o preço, a prioridade. Se não muda nada, corte.
- **Cada negócio tem as suas perguntas.** Não force o exemplo do diagnóstico: um buffet pergunta data e convidados, uma clínica pergunta o tratamento, uma loja pergunta o produto. Use `exemplos/eventos.ts` como segundo modelo e `pular` para ramos (perguntas só para empresas, só para casamentos).
- **Catálogo (`sugestao`)** quando o negócio tem serviços ou planos: a IA escolhe os que encaixam no que a pessoa contou, com o porquê, e a pessoa confirma. É aqui que nasce a venda de dois serviços em vez de um.
- **Data (`data`)** para eventos, reservas e prazos. Se houver agenda, ligue `disponibilidade` (a pessoa sabe na hora se a data está livre).
- **Resumo (`resumo`)** antes do contato, para a pessoa confirmar que entendemos bem.
- **Coerência (`coerencia`)**: combinações que parecem engano (300 convidados com 200 € de orçamento) fazem a conversa perguntar com educação se está certo, e deixam corrigir. Se a pessoa confirmar, o pedido chega marcado [REVER À MÃO]. A IA também marca pedidos sem relação com o negócio.
- **De 10 a 16 passos** no total. O progresso e o "faltam ~N" mostram que está a acabar; mais do que isso cansa.
- **Faixas de dinheiro na moeda da pessoa** (`opcoes: (r) => ...` a partir do país) e sempre com "Prefiro não dizer".
- **`pular`** para não perguntar o que já se sabe (o país que a pesquisa da empresa trouxe, por exemplo).
- **`ia.sobre`** é o que a IA sabe do negócio: o que vende, para quem, o que o diagnóstico procura. Duas ou três frases concretas mudam muito a qualidade das anotações e do mapa.
- **`ia.ligacao`** é a etiqueta na seta do cartão do cenário. "com IA" para quem vende IA; "com a nossa ajuda", "com o tratamento", "com o novo site", conforme o negócio.

Os tipos de passo e o que cada um aceita estão comentados em `src/lib/tipos.ts`. Regras que o `npm test` confere: ids únicos, sem espaço nem acento; no máximo um passo de cada tipo especial (`empresa`, `problema`, `escala`, `extra`, `mapa`); `extra` e `mapa` depois do `problema`; o último passo é o e-mail ou o telefone; `passoPais` e `passoSegmento` apontam para passos `escolha` com lista fixa, depois da empresa.

## Pedidos comuns depois do setup

- **"Quero mudar uma pergunta."** Editar o `formulario.ts`, `npm test`, commit só desse arquivo, push. A Vercel publica sozinha.
- **"Quero noutra cor / tema claro."** `marca.cor` e `marca.tema: 'claro'`.
- **"O meu cliente é de Portugal / Espanha."** `idioma: 'pt-PT'` (ou `es`, `en`) e reescreva as perguntas nessa língua. Os botões, avisos e a IA mudam sozinhos.
- **"Recebo pedidos de robôs."** Ligar o Turnstile da Cloudflare (`NEXT_PUBLIC_TURNSTILE_SITE_KEY` e `TURNSTILE_SECRET_KEY`, ver `docs/CHAVES.md`). Com ele, a IA só responde a quem passou pela Cloudflare, e o pedido de quem não passou fica gravado como suspeito, sem aviso.
- **"Quero a minha foto no topo."** Pôr a imagem em `public/` e `marca.foto: '/nome.jpg'`.
- **"Quanta gente desiste?"** `npm run leads` mostra o funil dos últimos 30 dias.
- **"A IA não pesquisou a empresa."** Empresas pequenas ou nomes comuns às vezes não aparecem, e de propósito o cartão só aparece com confiança média ou alta. Confira `FIRECRAWL_API_KEY` e os logs da Vercel com `[ia]`.
- **"Quanto custa?"** Ver `docs/CUSTOS.md`. Na prática, cêntimos por lead.
- **"Quero receber o lead no Telegram, CRM ou planilha."** Telegram: `AVISO_TELEGRAM_TOKEN` e `AVISO_TELEGRAM_CHAT`. CRM, planilha, n8n, Make ou Zapier: `AVISO_WEBHOOK_URL` recebe o pedido inteiro em JSON. WhatsApp direto não existe (passe pelo webhook). Pedidos de teste não vão para estes canais.
- **"Quero testar sem sujar os leads."** Abrir o endereço com `?teste=1`. O pedido fica marcado, o e-mail vai com [TESTE] (para `AVISO_TESTE_PARA`, se existir) e `npm run leads -- apagar-testes` limpa tudo.
- **"E se alguém abusar da IA?"** Há limite por pessoa (30 chamadas a cada 10 minutos, em memória) e um teto diário para o site inteiro, guardado no banco (`IA_TETO_DIARIO`, padrão 1500). Sem banco, só o limite por pessoa: nesse caso, ponha também um limite de gasto na conta da Anthropic.
- **"As anotações ao vivo gastam muito."** Subir `ia.pausaMs` e `ia.letrasNovas` no `formulario.ts`.

## Ao mudar código

- Mantenha o estilo. TypeScript estrito, nomes em português, comentários curtos explicando o **porquê**.
- Rode `npm run typecheck`, `npm test` e `npm run build` antes de dizer que terminou.
- Se a IA falhar, a conversa tem de seguir sem os extras. Não transforme nenhuma chamada à IA num passo obrigatório.
- Não adicione dependências para o que o projeto já resolve.
- O modelo da IA está numa constante só (`MODELO` em `src/lib/ia.ts`); a rota, o `npm run verificar` e o `npm run chave` leem dali.
- O limite por pessoa usa o primeiro IP do cabeçalho `x-forwarded-for`, que a Vercel preenche. Fora da Vercel (servidor próprio), confirme que o proxy (nginx) substitui esse cabeçalho, senão qualquer um o falsifica.

## Estilo dos textos públicos

Textos que a pessoa final lê (perguntas, opções, fim, e-mail): na língua do `idioma` (pt-BR com "você"; pt-PT com o vocabulário de Portugal), frases curtas, sem travessão (—) e com o mínimo de dois-pontos.
