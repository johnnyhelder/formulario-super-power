<?php
// Formulário Super Power, versão PHP: as peças comuns aos endereços da API.
// Não guarda nada na pasta pública: as chaves vivem num segredos.ini fora dela
// e as conversas numa pasta "dados" ao lado desse ficheiro.
// Só precisa das extensões curl e json (vêm em quase todos os alojamentos).
declare(strict_types=1);

if (!defined('FD')) {
    http_response_code(404);
    exit;
}

// A configuração gerada pelo `npm run exportar` a partir do formulario.ts (textos da IA, esquemas, passos).
function fd_config(): array
{
    static $c = null;
    return $c ??= json_decode((string) file_get_contents(__DIR__ . '/config.json'), true) ?: [];
}

// Onde está o segredos.ini. Por ordem: a variável FD_SEGREDOS, /etc/formulario-super-power/,
// ou a pasta formulario-super-power ao lado da pasta pública do site (ex. /home/conta/formulario-super-power/).
function fd_segredos_caminho(): string
{
    $raiz = dirname((string) ($_SERVER['DOCUMENT_ROOT'] ?? '') ?: __DIR__);
    foreach ([(string) getenv('FD_SEGREDOS'), '/etc/formulario-super-power/segredos.ini', $raiz . '/formulario-super-power/segredos.ini'] as $c) {
        if ($c !== '' && is_readable($c)) {
            return $c;
        }
    }
    return '';
}

// Aceita o prefixo FORMULARIO_ (ex. FORMULARIO_ANTHROPIC_API_KEY), como a versão Next (src/lib/env.ts).
function fd_segredo(string $nome): string
{
    static $s = null;
    if ($s === null) {
        $caminho = fd_segredos_caminho();
        $s = $caminho ? (parse_ini_file($caminho, false, INI_SCANNER_RAW) ?: []) : [];
    }
    return trim((string) ($s['FORMULARIO_' . $nome] ?? $s[$nome] ?? ''));
}

// A pasta das conversas e dos contadores: "dados", ao lado do segredos.ini.
function fd_dados(string $sub = ''): string
{
    $base = fd_segredos_caminho() ? dirname(fd_segredos_caminho()) . '/dados' : sys_get_temp_dir() . '/formulario-super-power';
    $dir = $base . ($sub !== '' ? '/' . $sub : '');
    if (!is_dir($dir)) {
        @mkdir($dir, 0700, true);
    }
    return $dir;
}

function fd_responder(array $dados, int $estado = 200): never
{
    http_response_code($estado);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($dados, JSON_UNESCAPED_UNICODE);
    exit;
}

function fd_corpo(): array
{
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
        fd_responder(['ok' => false], 405);
    }
    $bruto = (string) file_get_contents('php://input', false, null, 0, 100_000);
    $j = json_decode($bruto, true);
    return is_array($j) ? $j : [];
}

// O IP de quem pede. Atrás da Cloudflare ou de outro proxy, ponha FD_CONFIAR_PROXY=1 no segredos.ini.
function fd_ip(): string
{
    if (fd_segredo('FD_CONFIAR_PROXY') === '1') {
        $proxy = $_SERVER['HTTP_CF_CONNECTING_IP'] ?? explode(',', (string) ($_SERVER['HTTP_X_FORWARDED_FOR'] ?? ''))[0];
        if (trim((string) $proxy) !== '') {
            return trim((string) $proxy);
        }
    }
    return (string) ($_SERVER['REMOTE_ADDR'] ?? 'desconhecido');
}

// Soma 1 a um contador guardado num ficheiro, com trinco (dois pedidos ao mesmo tempo não se perdem).
function fd_contar(string $ficheiro, int $validadeSeg): int
{
    $f = fopen($ficheiro, 'c+');
    if (!$f) {
        return 0;
    }
    flock($f, LOCK_EX);
    $j = json_decode((string) stream_get_contents($f), true) ?: [];
    $agora = time();
    $n = (($j['ate'] ?? 0) > $agora) ? (int) $j['n'] + 1 : 1;
    $ate = (($j['ate'] ?? 0) > $agora) ? (int) $j['ate'] : $agora + $validadeSeg;
    ftruncate($f, 0);
    rewind($f);
    fwrite($f, json_encode(['n' => $n, 'ate' => $ate]));
    flock($f, LOCK_UN);
    fclose($f);
    return $n;
}

function fd_limitar(string $balde, int $maximo, int $janelaSeg): void
{
    $n = fd_contar(fd_dados('limites') . '/' . hash('sha256', $balde . '|' . fd_ip()) . '.json', $janelaSeg);
    if ($n > $maximo) {
        fd_responder(['ok' => false], 429);
    }
}

// Corta um texto em caracteres (não em bytes), sem precisar do mbstring.
function fd_cortar(string $s, int $n): string
{
    return preg_match('/^.{0,' . $n . '}/su', $s, $m) ? $m[0] : '';
}

// ── Turnstile e sessão assinada ─────────────────────────────────────────

function fd_turnstile_ligado(): bool
{
    return fd_segredo('TURNSTILE_SECRET_KEY') !== '';
}

function fd_b64(string $s): string
{
    return rtrim(strtr(base64_encode($s), '+/', '-_'), '=');
}

function fd_assinar(string $dados): string
{
    $segredo = fd_segredo('SESSAO_SEGREDO') ?: fd_segredo('TURNSTILE_SECRET_KEY');
    return fd_b64(hash_hmac('sha256', $dados, $segredo, true));
}

function fd_sessao_nova(): string
{
    $dados = fd_b64((string) json_encode(['ate' => (time() + 7200) * 1000]));
    return $dados . '.' . fd_assinar($dados);
}

function fd_sessao_valida(): bool
{
    $valor = (string) ($_SERVER['HTTP_X_SESSAO_IA'] ?? '');
    $partes = explode('.', $valor);
    if (count($partes) !== 2 || !hash_equals(fd_assinar($partes[0]), $partes[1])) {
        return false;
    }
    $j = json_decode((string) base64_decode(strtr($partes[0], '-_', '+/')), true);
    return is_array($j) && ($j['ate'] ?? 0) > time() * 1000;
}

// ── Pedidos HTTP ────────────────────────────────────────────────────────

function fd_post(string $url, array $cabecalhos, string $corpo, int $timeoutSeg): array
{
    $c = curl_init($url);
    curl_setopt_array($c, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => $corpo,
        CURLOPT_HTTPHEADER => $cabecalhos,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => $timeoutSeg,
        CURLOPT_CONNECTTIMEOUT => 5,
    ]);
    $resposta = curl_exec($c);
    $estado = (int) curl_getinfo($c, CURLINFO_RESPONSE_CODE);
    curl_close($c);
    return [$estado, is_string($resposta) ? $resposta : ''];
}

// ── Validação do que a página manda ─────────────────────────────────────

// Respostas: id => texto, ou id => lista de textos. Qualquer coisa fora disso, recusa.
function fd_respostas_validas(mixed $r): ?array
{
    if (!is_array($r) || count($r) > 80) {
        return null;
    }
    foreach ($r as $k => $v) {
        if (!is_string($k) || strlen($k) > 40) {
            return null;
        }
        if (is_string($v)) {
            if (strlen($v) > 6000) {
                return null;
            }
        } elseif (is_array($v) && array_is_list($v) && count($v) <= 20) {
            foreach ($v as $x) {
                if (!is_string($x) || strlen($x) > 320) {
                    return null;
                }
            }
        } else {
            return null;
        }
    }
    return $r;
}

function fd_ia_valida(mixed $ia): ?array
{
    if (!is_array($ia) || strlen((string) json_encode($ia)) >= 20000) {
        return null;
    }
    return $ia;
}

// ── Claude ───────────────────────────────────────────────────────────────

// Uma chamada ao Claude Haiku com saída estruturada (o esquema e o modelo vêm do config.json).
// Conta para o teto diário do site inteiro. Devolve o objeto, ou null se falhar.
function fd_claude(array $C, string $tipo, string $texto): ?array
{
    $chave = fd_segredo('ANTHROPIC_API_KEY');
    if ($chave === '') {
        return null;
    }
    // Teto diário para o site inteiro: é o que segura o pior caso da fatura.
    $teto = (int) (fd_segredo('IA_TETO_DIARIO') ?: 1500);
    if (fd_contar(fd_dados('uso') . '/' . date('Y-m-d') . '.json', 86400) > $teto) {
        error_log('[formulario-super-power] teto diário de chamadas à IA atingido');
        return null;
    }
    $cabecalhos = ['x-api-key: ' . $chave, 'anthropic-version: 2023-06-01', 'content-type: application/json'];
    // Chaves que não estão presas a um workspace precisam de o indicar.
    if (fd_segredo('ANTHROPIC_WORKSPACE_ID') !== '') {
        $cabecalhos[] = 'anthropic-workspace-id: ' . fd_segredo('ANTHROPIC_WORKSPACE_ID');
    }
    $base = fd_segredo('ANTHROPIC_BASE_URL') ?: 'https://api.anthropic.com';
    [$estado, $bruto] = fd_post($base . '/v1/messages', $cabecalhos, (string) json_encode([
        'model' => $C['modelo'],
        'max_tokens' => 700,
        'thinking' => ['type' => 'disabled'],
        'output_config' => ['effort' => 'low', 'format' => ['type' => 'json_schema', 'schema' => $C['esquemas'][$tipo]]],
        'system' => $C['sistema'],
        'messages' => [['role' => 'user', 'content' => $texto]],
    ], JSON_UNESCAPED_UNICODE), 12);
    if ($estado !== 200) {
        error_log('[formulario-super-power] IA ' . $tipo . ' HTTP ' . $estado . ': ' . substr($bruto, 0, 300));
        return null;
    }
    $saida = null;
    foreach ((json_decode($bruto, true)['content'] ?? []) as $bloco) {
        if (($bloco['type'] ?? '') === 'text') {
            $saida = json_decode((string) $bloco['text'], true);
            break;
        }
    }
    // A saída estruturada garante o formato; confere-se na mesma que os campos pedidos vieram.
    foreach ($C['esquemas'][$tipo]['required'] ?? [] as $campo) {
        if (!is_array($saida) || !array_key_exists($campo, $saida)) {
            error_log('[formulario-super-power] IA ' . $tipo . ': saída fora do esquema');
            return null;
        }
    }
    return $saida;
}

// O que a IA lê sobre a pessoa, igual ao dadosParaIA da versão Next.
// Nunca leva nome, e-mail nem telefone.
function dados_para_ia(array $C, array $r, array $ia): string
{
    $contato = array_filter([$C['contato']['nome'] ?? '', $C['contato']['email'] ?? '', $C['contato']['telefone'] ?? '']);
    $linhas = [];
    $extra = null;
    foreach ($C['passos'] as $p) {
        if ($p['tipo'] === 'extra') {
            $extra = $p['id'];
        }
        $v = $r[$p['id']] ?? null;
        if ($v === null || $v === '' || $v === [] || in_array($p['id'], $contato, true) || in_array($p['tipo'], ['extra', 'mapa', 'resumo'], true)) {
            continue;
        }
        $linhas[] = ($p['resumo'] ?? $p['id']) . ': ' . (is_array($v) ? implode(', ', $v) : fd_cortar((string) $v, 1500));
    }
    if ($extra !== null && !empty($ia['pergunta']['pergunta']) && !empty($r[$extra])) {
        $linhas[] = 'Pergunta extra: ' . $ia['pergunta']['pergunta'];
        $linhas[] = 'Resposta extra: ' . fd_cortar((string) $r[$extra], 400);
    }
    if (!empty($ia['empresaConfirmada']) && !empty($ia['empresa']['descricao'])) {
        $linhas[] = 'A empresa faz: ' . $ia['empresa']['descricao'];
    }
    if (!empty($ia['ajusteMapa'])) {
        $linhas[] = 'Pedido de ajuste ao mapa: ' . fd_cortar((string) $ia['ajusteMapa'], 400);
    }
    return "<dados>\n" . implode("\n", $linhas) . "\n</dados>";
}
