<?php
// As peças de IA da conversa: pesquisa da empresa, anotações, pergunta extra e
// sugestões, mapa e resumo. Claude Haiku com saída estruturada (JSON Schema).
// Os textos que vão à IA vêm do config.json, gerado do formulario.ts.
declare(strict_types=1);
define('FD', true);
require __DIR__ . '/_base.php';

$C = fd_config();
fd_limitar('ia', 30, 600);
// Com Turnstile ligado, só quem passou pela Cloudflare chega à IA.
if (fd_turnstile_ligado() && !fd_sessao_valida()) {
    fd_responder(['ok' => false], 403);
}

$pedido = fd_corpo();
$tipo = (string) ($pedido['tipo'] ?? '');
if (!in_array($tipo, ['empresa', 'notas', 'aprofundar', 'mapa', 'resumo'], true)) {
    fd_responder(['ok' => false], 400);
}
$chave = fd_segredo('ANTHROPIC_API_KEY');
if ($chave === '') {
    fd_responder(['ok' => false], 503);
}

// Teto diário para o site inteiro: é o que segura o pior caso da fatura.
$teto = (int) (fd_segredo('IA_TETO_DIARIO') ?: 1500);
if (fd_contar(fd_dados('uso') . '/' . date('Y-m-d') . '.json', 86400) > $teto) {
    error_log('[form-dinamico] teto diário de chamadas à IA atingido');
    fd_responder(['ok' => false], 429);
}

$resultados = [];
if ($tipo === 'empresa') {
    $nome = trim((string) ($pedido['empresa'] ?? ''));
    if (strlen($nome) < 2 || strlen($nome) > 240) {
        fd_responder(['ok' => false], 400);
    }
    $resultados = pesquisar($nome);
    // Sem resultados não há o que ler: o Haiku só adivinharia.
    if (!$resultados) {
        fd_responder(['ok' => false], 404);
    }
    $lista = [];
    foreach ($resultados as $i => $r) {
        $lista[] = '[' . ($i + 1) . '] ' . ($r['title'] ?? '') . "\nURL: " . ($r['url'] ?? '') . "\n"
            . fd_cortar((string) preg_replace('/\s+/', ' ', (string) ($r['description'] ?? '')), 350);
    }
    $texto = str_replace(['{{NOME}}', '{{RESULTADOS}}'], [$nome, implode("\n\n", $lista)], $C['empresa']);
} else {
    $respostas = fd_respostas_validas($pedido['respostas'] ?? null);
    $ia = fd_ia_valida($pedido['ia'] ?? []);
    if ($respostas === null || $ia === null) {
        fd_responder(['ok' => false], 400);
    }
    $texto = str_replace('{{DADOS}}', dados_para_ia($C, $respostas, $ia), $C['instrucoes'][$tipo]);
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
    error_log('[form-dinamico] IA ' . $tipo . ' HTTP ' . $estado . ': ' . substr($bruto, 0, 300));
    fd_responder(['ok' => false], 502);
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
        error_log('[form-dinamico] IA ' . $tipo . ': saída fora do esquema');
        fd_responder(['ok' => false], 502);
    }
}

if ($tipo === 'empresa') {
    // O site só passa se o domínio estiver mesmo num dos resultados.
    $host = dominio((string) $saida['site']);
    $saida['site'] = '';
    foreach ($resultados as $r) {
        if ($host !== '' && dominio((string) ($r['url'] ?? '')) === $host) {
            $saida['site'] = 'https://' . $host;
        }
    }
    $saida['segmentos'] = array_slice((array) $saida['segmentos'], 0, 3);
}
if ($tipo === 'aprofundar' && isset($saida['sugestoes'])) {
    $saida['sugestoes'] = array_slice((array) $saida['sugestoes'], 0, (int) ($C['sugestaoMaximo'] ?? 3));
}
fd_responder(['ok' => true, 'dados' => $saida]);

// Pesquisa pública da empresa (Firecrawl). Falha em silêncio.
function pesquisar(string $empresa): array
{
    $chave = fd_segredo('FIRECRAWL_API_KEY');
    if ($chave === '') {
        return [];
    }
    [$estado, $bruto] = fd_post('https://api.firecrawl.dev/v2/search', [
        'Authorization: Bearer ' . $chave,
        'content-type: application/json',
    ], (string) json_encode(['query' => '"' . str_replace('"', '', $empresa) . '" empresa', 'limit' => 5]), 6);
    if ($estado !== 200) {
        return [];
    }
    return array_slice((array) (json_decode($bruto, true)['data']['web'] ?? []), 0, 5);
}

function dominio(string $url): string
{
    $host = parse_url(str_starts_with($url, 'http') ? $url : 'https://' . $url, PHP_URL_HOST);
    return is_string($host) ? (string) preg_replace('/^www\./', '', strtolower($host)) : '';
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
