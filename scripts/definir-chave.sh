#!/usr/bin/env bash
# Grava uma chave secreta sem ela aparecer na tela nem passar pelo chat.
#   npm run chave                       (ANTHROPIC_API_KEY, com teste real)
#   npm run chave -- FIRECRAWL_API_KEY  (qualquer outra variável)
# Versão PHP, no servidor (como root, por ssh -t), grava no segredos.ini fora da pasta pública:
#   bash definir-chave.sh ANTHROPIC_API_KEY --ini /etc/formulario-super-power/segredos.ini
# Num site que já tem a sua ANTHROPIC_API_KEY (para outra coisa), grave a do formulário à parte:
#   npm run chave -- ANTHROPIC_API_KEY --prefixo FORMULARIO_   (vira FORMULARIO_ANTHROPIC_API_KEY)
# --sem-vercel grava só no .env.local, mesmo com o projeto ligado à Vercel.
# Rode num terminal a sério (não com o "!" do Claude Code: lá não há teclado para a leitura escondida).
# 1. Lê a chave escondida e limpa o que a colagem acrescenta.  2. Se for a da Anthropic, testa com uma mensagem mínima.
# 3. Grava no .env.local (só o seu utilizador lê).  4. Se o projeto estiver ligado à Vercel (.vercel/), grava também lá.
set -euo pipefail
umask 077
NOME=ANTHROPIC_API_KEY
INI=""
PREFIXO=""
SEM_VERCEL=""
ARGS=("$@")
while [[ $# -gt 0 ]]; do
  case "$1" in
    --ini) INI="${2:-}"; shift 2 ;;
    --prefixo) PREFIXO="${2:-}"; shift 2 ;;
    --sem-vercel) SEM_VERCEL=1; shift ;;
    *) NOME="$1"; shift ;;
  esac
done
[[ -z "$PREFIXO" || "$PREFIXO" =~ ^[A-Z][A-Z0-9_]*_$ ]] || { echo "Prefixo inválido: $PREFIXO (ex. FORMULARIO_)"; exit 1; }
GRAVAR="${PREFIXO}${NOME}"
WSVAR="${PREFIXO}ANTHROPIC_WORKSPACE_ID"
ENV="${INI:-.env.local}"
# Funciona a partir de qualquer pasta: trabalha sempre na raiz do projeto (a pasta acima de scripts/).
SCRIPT="$(cd "$(dirname "$0")" && pwd)/$(basename "$0")"
RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
if [[ -z "$INI" ]]; then
  cd "$RAIZ"
  # Em servidores com vários utilizadores, o .env.local tem de ser do dono do projeto.
  DONO="$(stat -c %U "$RAIZ" 2>/dev/null || stat -f %Su "$RAIZ")"
  if [[ "$DONO" != "$(id -un)" ]]; then
    echo "Este projeto ($RAIZ) é do utilizador $DONO, e você está como $(id -un). Rode assim:"
    echo "  sudo -iu $DONO bash $SCRIPT ${ARGS[*]:-}"
    echo "Nada foi pedido nem gravado."
    exit 1
  fi
fi
# Quem corre o PHP no servidor (para poder ler o segredos.ini e escrever na pasta dados).
WEB="${WEB_USER:-www-data}"
[[ "$NOME" =~ ^[A-Z][A-Z0-9_]*$ ]] || { echo "Nome de variável inválido: $NOME"; exit 1; }

if [[ ! -t 0 ]]; then
  echo "Este comando precisa de um terminal a sério, onde possa colar a chave."
  echo "Abra um terminal (fora do Claude Code) e rode: bash $SCRIPT ${ARGS[*]:-}"
  echo "Num servidor, entre com ssh -t (o -t dá o terminal)."

  exit 1
fi

# A Vercel confere-se ANTES de pedir a chave, para ninguém ter de colar duas vezes.
if [[ -z "$INI" && -d .vercel && -z "$SEM_VERCEL" ]]; then
  echo "A conferir o login na Vercel..."
  if ! npx -y vercel whoami >/dev/null 2>&1; then
    echo "Este projeto está ligado à Vercel, mas não há login. Rode primeiro: npx vercel login"
    echo "(Ou acrescente --sem-vercel para gravar só no .env.local.) Nada foi pedido nem gravado."
    exit 1
  fi
fi

read -r -s -p "Cole o valor de $GRAVAR (não aparece) e tecle Enter: " BRUTO || true
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
if [[ "$NOME" == *ANTHROPIC_API_KEY ]]; then
  if [[ "$VALOR" == sk-ant-oat* ]]; then
    echo "Isto é o token de login da assinatura do Claude, não uma chave da API. Crie a chave em platform.claude.com > API Keys. Nada foi gravado."
    exit 1
  fi
  # O mesmo modelo da rota da IA, lido de um sítio só.
  MODELO="$(sed -n "s/^export const MODELO = '\([^']*\)'.*/\1/p" src/lib/ia.ts 2>/dev/null || true)"
  MODELO="${MODELO:-claude-haiku-5-5}"
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

# .env.local (ou segredos.ini): escreve ao lado e troca de uma vez, com permissão só para o seu utilizador.
[[ -n "$INI" ]] && mkdir -p "$(dirname "$INI")"
touch "$ENV"
TMP="$(mktemp "$ENV.XXXXXX")"
if [[ -n "$WORKSPACE" ]]; then
  grep -v -e "^$GRAVAR=" -e "^$WSVAR=" "$ENV" > "$TMP" || true
else
  grep -v -e "^$GRAVAR=" "$ENV" > "$TMP" || true
fi
printf '%s=%s\n' "$GRAVAR" "$VALOR" >> "$TMP"
if [[ -n "$WORKSPACE" ]]; then printf '%s=%s\n' "$WSVAR" "$WORKSPACE" >> "$TMP"; fi
chmod 600 "$TMP"
mv "$TMP" "$ENV"
if [[ -n "$INI" ]]; then
  # No servidor: o PHP lê (grupo), ninguém mais. A pasta dados é só do PHP.
  mkdir -p "$(dirname "$INI")/dados"
  if [[ $EUID -eq 0 ]] && id "$WEB" >/dev/null 2>&1; then
    chown "root:$WEB" "$INI" "$(dirname "$INI")"
    chown "$WEB:$WEB" "$(dirname "$INI")/dados"
  fi
  chmod 640 "$INI"
  chmod 750 "$(dirname "$INI")"
  chmod 700 "$(dirname "$INI")/dados"
  echo "Gravada em $INI como $GRAVAR."
  unset VALOR
  exit 0
fi
echo "Gravada no .env.local de $RAIZ como $GRAVAR."

# Vercel, se o projeto estiver ligado (vercel link). O valor entra por stdin.
if [[ -d .vercel && -z "$SEM_VERCEL" ]]; then
  read -r -p "Gravar também na Vercel (Production)? [s/N] " SIM || true
  if [[ "${SIM:-}" =~ ^[sS]$ ]]; then
    printf '%s' "$VALOR" | npx -y vercel env add "$GRAVAR" production --sensitive --force >/dev/null
    if [[ -n "$WORKSPACE" ]]; then printf '%s' "$WORKSPACE" | npx -y vercel env add "$WSVAR" production --force >/dev/null; fi
    echo "Gravada na Vercel. Para valer no site, publique de novo: npx vercel --prod"
  fi
fi
unset VALOR
