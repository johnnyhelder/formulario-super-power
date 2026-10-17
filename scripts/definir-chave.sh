#!/usr/bin/env bash
# Grava uma chave secreta sem ela aparecer na tela nem passar pelo chat.
#   npm run chave                       (ANTHROPIC_API_KEY, com teste real)
#   npm run chave -- FIRECRAWL_API_KEY  (qualquer outra variável)
# 1. Lê a chave escondida.  2. Se for a da Anthropic, testa com uma mensagem mínima.
# 3. Grava no .env.local.  4. Se o projeto estiver ligado à Vercel (.vercel/), grava também lá.
set -euo pipefail
NOME="${1:-ANTHROPIC_API_KEY}"
ENV=.env.local
[[ "$NOME" =~ ^[A-Z][A-Z0-9_]*$ ]] || { echo "Nome de variável inválido: $NOME"; exit 1; }

read -r -s -p "Cole o valor de $NOME (não aparece) e tecle Enter: " VALOR
echo
VALOR="$(printf '%s' "$VALOR" | tr -d '[:space:]')"
if [[ -z "$VALOR" ]]; then
  echo "Não chegou nada. No Windows, cole com o botão direito do rato (ou Ctrl+Shift+V). Nada foi gravado."
  exit 1
fi

WORKSPACE=""
if [[ "$NOME" == "ANTHROPIC_API_KEY" ]]; then
  if [[ "$VALOR" == sk-ant-oat* ]]; then
    echo "Isto é o token de login da assinatura do Claude, não uma chave da API. Crie a chave em platform.claude.com > API Keys. Nada foi gravado."
    exit 1
  fi
  # O cabeçalho com a chave vai por stdin, para não aparecer na lista de processos.
  testar() {
    local extra=()
    [[ -n "${1:-}" ]] && extra=(-H "anthropic-workspace-id: $1")
    RESP="$(printf 'x-api-key: %s\n' "$VALOR" | curl -s -H @- "${extra[@]}" \
      -H 'anthropic-version: 2023-06-01' -H 'content-type: application/json' \
      -w '\n%{http_code}' https://api.anthropic.com/v1/messages \
      -d '{"model":"claude-haiku-5-5","max_tokens":5,"messages":[{"role":"user","content":"ok"}]}')"
    CODIGO="$(printf '%s' "$RESP" | tail -n1)"
    MOTIVO="$(printf '%s' "$RESP" | sed '$d' | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s).error.message)}catch{console.log("sem detalhe")}})')"
  }
  echo "A testar a chave com a Anthropic..."
  testar
  if [[ "$CODIGO" != "200" && "$MOTIVO" == *workspace* ]]; then
    echo "Esta chave não está presa a um workspace. Encontre o ID em platform.claude.com > Settings > Workspaces (não é segredo)."
    read -r -p "Cole o ID do workspace e tecle Enter: " WORKSPACE
    WORKSPACE="$(printf '%s' "$WORKSPACE" | tr -d '[:space:]')"
    [[ -n "$WORKSPACE" ]] || { echo "Não chegou nenhum ID. Nada foi gravado."; exit 1; }
    testar "$WORKSPACE"
  fi
  if [[ "$CODIGO" != "200" ]]; then
    if [[ "$MOTIVO" == *credit* ]]; then
      echo "A chave é válida, mas a conta não tem créditos. Carregue créditos em platform.claude.com > Billing. Nada foi gravado."
    else
      echo "A Anthropic recusou a chave (HTTP $CODIGO: $MOTIVO). Nada foi gravado."
    fi
    exit 1
  fi
  echo "Chave válida e com créditos."
fi

# .env.local (troca a linha antiga, se houver)
touch "$ENV"
TMP="$(mktemp)"
if [[ -n "$WORKSPACE" ]]; then
  grep -v -e "^$NOME=" -e '^ANTHROPIC_WORKSPACE_ID=' "$ENV" > "$TMP" || true
else
  grep -v -e "^$NOME=" "$ENV" > "$TMP" || true
fi
printf '%s=%s\n' "$NOME" "$VALOR" >> "$TMP"
[[ -n "$WORKSPACE" ]] && printf 'ANTHROPIC_WORKSPACE_ID=%s\n' "$WORKSPACE" >> "$TMP"
cat "$TMP" > "$ENV"
rm -f "$TMP"
echo "Gravada no .env.local."

# Vercel, se o projeto estiver ligado (vercel link). O valor entra por stdin.
if [[ -d .vercel ]]; then
  read -r -p "Gravar também na Vercel (Production)? [s/N] " SIM
  if [[ "$SIM" =~ ^[sS]$ ]]; then
    printf '%s' "$VALOR" | npx -y vercel env add "$NOME" production --sensitive --force >/dev/null
    [[ -n "$WORKSPACE" ]] && printf '%s' "$WORKSPACE" | npx -y vercel env add ANTHROPIC_WORKSPACE_ID production --force >/dev/null
    echo "Gravada na Vercel. Para valer no site, publique de novo: npx vercel --prod"
  fi
fi
unset VALOR
