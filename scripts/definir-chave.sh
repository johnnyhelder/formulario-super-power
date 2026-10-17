#!/usr/bin/env bash
# Grava uma chave secreta sem ela aparecer na tela nem passar pelo chat.
#   npm run chave                       (ANTHROPIC_API_KEY, com teste real)
#   npm run chave -- FIRECRAWL_API_KEY  (qualquer outra variável)
# Rode num terminal a sério (não com o "!" do Claude Code: lá não há teclado para a leitura escondida).
# 1. Lê a chave escondida e limpa o que a colagem acrescenta.  2. Se for a da Anthropic, testa com uma mensagem mínima.
# 3. Grava no .env.local (só o seu utilizador lê).  4. Se o projeto estiver ligado à Vercel (.vercel/), grava também lá.
set -euo pipefail
umask 077
NOME="${1:-ANTHROPIC_API_KEY}"
ENV=.env.local
[[ "$NOME" =~ ^[A-Z][A-Z0-9_]*$ ]] || { echo "Nome de variável inválido: $NOME"; exit 1; }

if [[ ! -t 0 ]]; then
  echo "Este comando precisa de um terminal a sério, onde possa colar a chave."
  echo "Abra um terminal (fora do Claude Code), entre na pasta do projeto e rode: npm run chave${1:+ -- $1}"
  exit 1
fi

read -r -s -p "Cole o valor de $NOME (não aparece) e tecle Enter: " BRUTO || true
echo
# Alguns terminais embrulham a colagem em marcas invisíveis (ESC[200~ ... ESC[201~) e o Windows junta \r.
VALOR="$(printf '%s' "$BRUTO" | sed $'s/\e\\[20[01]~//g' | tr -cd '[:graph:]')"
REMOVIDOS=$(( ${#BRUTO} - ${#VALOR} ))
unset BRUTO
if [[ -z "$VALOR" ]]; then
  echo "Não chegou nada. No Windows, cole com o botão direito do rato (ou Ctrl+Shift+V). Nada foi gravado."
  exit 1
fi

# Para perceber o que chegou sem mostrar a chave: só o começo, o tamanho e o que foi limpo.
diagnostico() {
  echo "Recebi ${#VALOR} caracteres, a começar por \"${VALOR:0:7}\" (tirei $REMOVIDOS espaços ou caracteres invisíveis da colagem)."
}

WORKSPACE=""
if [[ "$NOME" == "ANTHROPIC_API_KEY" ]]; then
  if [[ "$VALOR" == sk-ant-oat* ]]; then
    echo "Isto é o token de login da assinatura do Claude, não uma chave da API. Crie a chave em platform.claude.com > API Keys. Nada foi gravado."
    exit 1
  fi
  # O mesmo modelo da rota da IA, lido de um sítio só.
  MODELO="$(sed -n "s/^export const MODELO = '\([^']*\)'.*/\1/p" src/lib/ia.ts)"
  # O cabeçalho com a chave vai por stdin, para não aparecer na lista de processos.
  # Há vários formatos de chave (sk-ant-api..., sk-ant-usr...): quem decide é este teste, nunca o prefixo.
  testar() {
    local extra=()
    [[ -n "${1:-}" ]] && extra=(-H "anthropic-workspace-id: $1")
    RESP="$(printf 'x-api-key: %s\n' "$VALOR" | curl -s -H @- "${extra[@]}" \
      -H 'anthropic-version: 2023-06-01' -H 'content-type: application/json' \
      -w '\n%{http_code}' https://api.anthropic.com/v1/messages \
      -d "{\"model\":\"$MODELO\",\"max_tokens\":5,\"messages\":[{\"role\":\"user\",\"content\":\"ok\"}]}")" || true
    CODIGO="$(printf '%s' "$RESP" | tail -n1)"
    MOTIVO="$(printf '%s' "$RESP" | sed '$d' | sed -n 's/.*"message"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n1)"
    MOTIVO="${MOTIVO:-sem detalhe}"
  }
  echo "A testar a chave com a Anthropic..."
  testar
  if [[ "$CODIGO" != "200" && "$MOTIVO" == *workspace* ]]; then
    echo "Esta chave não está presa a um workspace. Encontre o ID em platform.claude.com > Settings > Workspaces (não é segredo)."
    read -r -p "Cole o ID do workspace e tecle Enter: " WORKSPACE || true
    WORKSPACE="$(printf '%s' "$WORKSPACE" | sed $'s/\e\\[20[01]~//g' | tr -cd '[:graph:]')"
    [[ -n "$WORKSPACE" ]] || { echo "Não chegou nenhum ID. Nada foi gravado."; exit 1; }
    testar "$WORKSPACE"
  fi
  if [[ "$CODIGO" != "200" ]]; then
    if [[ "$MOTIVO" == *credit* ]]; then
      echo "A chave é válida, mas a conta não tem créditos. Carregue créditos em platform.claude.com > Billing. Nada foi gravado."
    else
      echo "A Anthropic recusou a chave (HTTP $CODIGO: $MOTIVO). Nada foi gravado."
      diagnostico
    fi
    exit 1
  fi
  echo "Chave válida e com créditos."
fi

# .env.local: escreve ao lado e troca de uma vez, com permissão só para o seu utilizador.
touch "$ENV"
TMP="$(mktemp "$ENV.XXXXXX")"
if [[ -n "$WORKSPACE" ]]; then
  grep -v -e "^$NOME=" -e '^ANTHROPIC_WORKSPACE_ID=' "$ENV" > "$TMP" || true
else
  grep -v -e "^$NOME=" "$ENV" > "$TMP" || true
fi
printf '%s=%s\n' "$NOME" "$VALOR" >> "$TMP"
if [[ -n "$WORKSPACE" ]]; then printf 'ANTHROPIC_WORKSPACE_ID=%s\n' "$WORKSPACE" >> "$TMP"; fi
chmod 600 "$TMP"
mv "$TMP" "$ENV"
echo "Gravada no .env.local."

# Vercel, se o projeto estiver ligado (vercel link). O valor entra por stdin.
if [[ -d .vercel ]]; then
  read -r -p "Gravar também na Vercel (Production)? [s/N] " SIM || true
  if [[ "${SIM:-}" =~ ^[sS]$ ]]; then
    printf '%s' "$VALOR" | npx -y vercel env add "$NOME" production --sensitive --force >/dev/null
    if [[ -n "$WORKSPACE" ]]; then printf '%s' "$WORKSPACE" | npx -y vercel env add ANTHROPIC_WORKSPACE_ID production --force >/dev/null; fi
    echo "Gravada na Vercel. Para valer no site, publique de novo: npx vercel --prod"
  fi
fi
unset VALOR
