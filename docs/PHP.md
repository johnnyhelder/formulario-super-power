# Versão PHP (alojamento sem Node)

Para sites em PHP, WordPress, cPanel ou servidor próprio com nginx. O visual e a conversa são **os mesmos** da versão Next. Muda só o servidor: três ficheiros PHP pequenos, que precisam apenas das extensões `curl` e `json` (vêm em quase todos os alojamentos). Sem banco de dados: cada conversa fica num ficheiro, numa pasta fora da parte pública do site.

A página é gerada no **seu** computador (onde há Node) e enviada pronta. O servidor não precisa de Node.

## 1. Gerar a pasta

No seu computador, na pasta do projeto, depois de ajustar o `formulario.ts` e correr `npm test`:

```bash
npm run exportar                         # o formulário fica na raiz do domínio
npm run exportar -- --caminho /pedido    # o formulário fica em seudominio.com/pedido/
```

Sai a pasta `publicar/`, com a página (`index.html`, `_next/`) e a API (`api/*.php`, `api/config.json`). Se usar o Turnstile, ponha antes a `NEXT_PUBLIC_TURNSTILE_SITE_KEY` no seu `.env.local` (é pública; vai dentro da página).

**Mudou uma pergunta?** Volte a correr `npm run exportar` e envie a pasta de novo. Os segredos e as conversas guardadas no servidor não são tocados.

## 2. Enviar para o servidor

Envie **o conteúdo** de `publicar/` para a pasta do formulário no servidor (a raiz pública, ou a subpasta do `--caminho`). Por FTP ou pelo gestor de ficheiros do cPanel, ou:

```bash
rsync -av --delete publicar/ utilizador@servidor:/var/www/seusite/pedido/
```

## 3. Segredos (fora da pasta pública)

As chaves vivem num `segredos.ini`, num destes sítios (o PHP procura por esta ordem):

1. o caminho na variável de ambiente `FD_SEGREDOS`;
2. `/etc/form-dinamico/segredos.ini` (servidor próprio);
3. `form-dinamico/segredos.ini` **ao lado** da pasta pública. No cPanel, se o site está em `/home/conta/public_html`, fica em `/home/conta/form-dinamico/segredos.ini`.

Ao lado do `segredos.ini` nasce a pasta `dados/`, com as conversas e os contadores. O PHP tem de conseguir escrever lá.

**Servidor próprio (com acesso root):** copie o script e grave cada chave por SSH. O `-t` é obrigatório (dá o terminal para colar a chave escondida):

```bash
scp scripts/definir-chave.sh root@servidor:/tmp/
ssh -t root@servidor bash /tmp/definir-chave.sh ANTHROPIC_API_KEY --ini /etc/form-dinamico/segredos.ini
ssh -t root@servidor bash /tmp/definir-chave.sh FIRECRAWL_API_KEY --ini /etc/form-dinamico/segredos.ini
```

O script testa a chave da Anthropic, grava com dono `root:www-data` e permissão 640 (o PHP lê, mais ninguém) e cria `dados/` só para o PHP. Se o PHP corre com outro utilizador, use `WEB_USER=nginx bash /tmp/definir-chave.sh ...`.

**cPanel (sem root):** crie a pasta `form-dinamico` ao lado de `public_html` e, dentro, o ficheiro `segredos.ini` pelo gestor de ficheiros, com permissão 640. Uma variável por linha:

```ini
ANTHROPIC_API_KEY=cole-aqui
FIRECRAWL_API_KEY=cole-aqui
RESEND_API_KEY=cole-aqui
AVISO_PARA=voce@seudominio.com
AVISO_DE=Formulario <form@seudominio.com>
```

As variáveis são as mesmas da versão Next (ver `docs/CHAVES.md`), menos `DATABASE_URL` (aqui não há banco) e `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (vai na página, no passo 1). Duas a mais, só para a versão PHP:

| Variável | Para quê |
|---|---|
| `FD_CONFIAR_PROXY=1` | Se o site está atrás da Cloudflare ou de outro proxy. Sem isto, o limite por pessoa usa o IP direto da ligação (o certo quando não há proxy). |
| `ANTHROPIC_BASE_URL` | Só para testes ou proxy próprio. Deixe vazia. |

## 4. Bloquear o que não é público

Em Apache (cPanel), o `api/.htaccess` já bloqueia `_base.php`, `leads.php`, `verificar.php` e `config.json`. Em **nginx**, acrescente ao bloco do site (ajuste o caminho):

```nginx
location ~ ^/pedido/api/(_base\.php|leads\.php|verificar\.php|config\.json)$ { deny all; }
```

## 5. Conferir e testar

No servidor:

```bash
php /var/www/seusite/pedido/api/verificar.php
```

Depois abra o formulário com `?teste=1` no fim do endereço e faça a conversa inteira. O e-mail chega com [TESTE] no assunto.

```bash
php /var/www/seusite/pedido/api/leads.php                 # últimos leads e onde as pessoas desistem
php /var/www/seusite/pedido/api/leads.php apagar-testes   # apaga as conversas de teste
```

(No cPanel sem terminal, os leads chegam por e-mail e ficam em `form-dinamico/dados/respostas/`, um ficheiro por conversa.)

## Diferenças em relação à versão Next

- Sem banco: as conversas ficam em ficheiros JSON. Para levar para um CRM ou planilha, use `AVISO_WEBHOOK_URL`.
- O limite por pessoa e o teto diário ficam em ficheiros na pasta `dados/` (valem para o site inteiro, não por instância).
- Na IA, as datas seguem no formato AAAA-MM-DD (na versão Next vão por extenso). Não muda o resultado.

## Erros comuns

- **"Permission denied (publickey)" ao entrar por SSH a partir do WSL**, com a chave criada no Windows e usada a partir de `/mnt/c/...`: o SSH recusa chaves com permissões abertas, e o `/mnt/c` não guarda permissões. Copie a chave para dentro do WSL e feche as permissões:
  ```bash
  mkdir -p ~/.ssh && cp /mnt/c/Users/SEU_UTILIZADOR/.ssh/id_ed25519 ~/.ssh/ && chmod 600 ~/.ssh/id_ed25519
  ```
- **O script da chave fecha sem gravar nada**: faltou o `-t` no `ssh` (ou correu sem terminal). O script avisa.
- **A IA não responde e o `verificar.php` diz que está tudo bem**: confira se o `config.json` foi enviado (está em `api/`) e veja o registo de erros do PHP, com as linhas `[form-dinamico]`.
