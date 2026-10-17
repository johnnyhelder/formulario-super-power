<?php
// Só no terminal do servidor: confere a instalação. Nunca mostra as chaves.
//   php verificar.php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}
define('FD', true);
require __DIR__ . '/_base.php';

$erros = 0;
$ok = fn(string $t) => print("  ✓ {$t}\n");
$aviso = fn(string $t) => print("  ! {$t}\n");
$erro = function (string $t) use (&$erros) { $erros++; print("  ✗ {$t}\n"); };
$mascarar = fn(string $v) => strlen($v) <= 12 ? '***' : substr($v, 0, 6) . '...' . substr($v, -4) . ' (' . strlen($v) . ' caracteres)';

echo "\n1. PHP\n";
extension_loaded('curl') ? $ok('extensão curl') : $erro('falta a extensão curl (php-curl)');
fd_config() ? $ok('config.json lido (' . count(fd_config()['passos']) . ' passos)') : $erro('config.json em falta: rode npm run exportar e publique a pasta inteira');

echo "\n2. Segredos\n";
$caminho = fd_segredos_caminho();
if ($caminho === '') {
    $erro('não encontrei o segredos.ini (FD_SEGREDOS, /etc/form-dinamico/segredos.ini ou form-dinamico/segredos.ini ao lado da pasta pública)');
} else {
    $ok("segredos.ini em {$caminho}");
    if ((fileperms($caminho) & 0004) !== 0) {
        $erro('o segredos.ini pode ser lido por qualquer utilizador da máquina: chmod 640');
    }
}
$dados = fd_dados();
is_writable($dados) ? $ok("pasta de dados {$dados}") : $erro("o PHP não consegue escrever em {$dados}");

echo "\n3. IA\n";
$chave = fd_segredo('ANTHROPIC_API_KEY');
if ($chave === '') {
    $aviso('ANTHROPIC_API_KEY vazia: o formulário funciona, mas sem os extras de IA.');
} else {
    $cab = ['x-api-key: ' . $chave, 'anthropic-version: 2023-06-01', 'content-type: application/json'];
    if (fd_segredo('ANTHROPIC_WORKSPACE_ID') !== '') {
        $cab[] = 'anthropic-workspace-id: ' . fd_segredo('ANTHROPIC_WORKSPACE_ID');
    }
    [$estado, $bruto] = fd_post((fd_segredo('ANTHROPIC_BASE_URL') ?: 'https://api.anthropic.com') . '/v1/messages', $cab,
        (string) json_encode(['model' => fd_config()['modelo'] ?? '', 'max_tokens' => 5, 'messages' => [['role' => 'user', 'content' => 'ok']]]), 15);
    $estado === 200 ? $ok('chave válida e com créditos (' . $mascarar($chave) . ')')
        : $erro("a Anthropic recusou a chave (HTTP {$estado}: " . (json_decode($bruto, true)['error']['message'] ?? 'sem detalhe') . ')');
    $ok('teto de ' . ((int) (fd_segredo('IA_TETO_DIARIO') ?: 1500)) . ' chamadas à IA por dia');
}
fd_segredo('FIRECRAWL_API_KEY') !== '' ? $ok('pesquisa da empresa ligada') : $aviso('FIRECRAWL_API_KEY vazia: a conversa não pesquisa a empresa.');
fd_turnstile_ligado() ? $ok('Turnstile ligado') : $aviso('Turnstile desligado. Recomendado antes de pôr anúncios.');

echo "\n4. Avisos\n";
$temEmail = fd_segredo('RESEND_API_KEY') !== '' && fd_segredo('AVISO_PARA') !== '';
$temEmail ? $ok('e-mail para ' . fd_segredo('AVISO_PARA')) : $aviso('sem e-mail de aviso (RESEND_API_KEY e AVISO_PARA). Os leads ficam só na pasta de dados.');
if (fd_segredo('AVISO_TELEGRAM_TOKEN') !== '') $ok('Telegram ligado');
if (fd_segredo('AVISO_WEBHOOK_URL') !== '') $ok('webhook ligado');

echo $erros ? "\n✗ {$erros} problema(s) para corrigir.\n\n" : "\n✓ Tudo pronto.\n\n";
exit($erros ? 1 : 0);
