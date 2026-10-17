<?php
// Só no terminal do servidor: as últimas conversas e onde as pessoas desistem.
//   php leads.php
//   php leads.php apagar-testes
declare(strict_types=1);
if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}
define('FD', true);
require __DIR__ . '/_base.php';

$ficheiros = glob(fd_dados('respostas') . '/*.json') ?: [];
$todas = array_filter(array_map(fn($f) => json_decode((string) file_get_contents($f), true), $ficheiros));
if (($argv[1] ?? '') === 'apagar-testes') {
    $n = 0;
    foreach ($ficheiros as $f) {
        if (!empty(json_decode((string) file_get_contents($f), true)['teste'])) {
            unlink($f);
            $n++;
        }
    }
    echo "\n✓ {$n} conversa(s) de teste apagada(s).\n\n";
    exit;
}
$reais = array_filter($todas, fn($c) => empty($c['teste']) && empty($c['suspeito']));
usort($reais, fn($a, $b) => strcmp($b['criadoEm'], $a['criadoEm']));
$leads = array_slice(array_values(array_filter($reais, fn($c) => !empty($c['concluido']))), 0, 20);
echo "\nÚltimos leads (" . count($leads) . ")\n";
foreach ($leads as $l) {
    echo '  ' . substr($l['criadoEm'], 0, 16) . '  ' . $l['nome'] . ' · ' . $l['email'] . ($l['telefone'] ? ' · ' . $l['telefone'] : '') . ($l['origem'] ? '  [' . $l['origem'] . ']' : '') . "\n";
}
$passos = array_map(fn($p) => $p['id'], fd_config()['passos'] ?? []);
$funil = [];
foreach ($reais as $c) {
    if (strtotime($c['criadoEm']) > time() - 30 * 86400) {
        $funil[$c['passo']] = ($funil[$c['passo']] ?? 0) + 1;
    }
}
ksort($funil);
echo "\nOnde pararam, últimos 30 dias (" . array_sum($funil) . " conversas)\n";
foreach ($funil as $passo => $n) {
    $onde = $passo >= (int) (fd_config()['totalEtapas'] ?? 999) ? 'concluíram' : 'pararam depois do passo ' . $passo;
    echo '  ' . str_pad((string) $n, 4, ' ', STR_PAD_LEFT) . "  {$onde}\n";
}
echo "\n";
