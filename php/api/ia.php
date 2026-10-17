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
    // As perguntas fixas que ainda vêm (a pergunta extra não pode repetir nenhuma).
    $futuras = [];
    foreach (array_slice((array) ($pedido['futuras'] ?? []), 0, 15) as $f) {
        if (is_string($f) && $f !== '') {
            $futuras[] = '- ' . fd_cortar((string) preg_replace('/\s+/', ' ', $f), 200);
        }
    }
    $texto = str_replace(['{{DADOS}}', '{{FUTURAS}}'], [dados_para_ia($C, $respostas, $ia), $futuras ? implode("\n", $futuras) : '(nenhuma)'], $C['instrucoes'][$tipo]);
}

$saida = fd_claude($C, $tipo, $texto);
if ($saida === null) {
    fd_responder(['ok' => false], 502);
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
