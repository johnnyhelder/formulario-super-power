<?php
// Cada resposta grava a conversa (para medir onde as pessoas desistem).
// O último passo traz o contato, marca como concluída e avisa: e-mail (Resend),
// Telegram e/ou webhook. As conversas ficam em dados/respostas/<sessao>.json.
declare(strict_types=1);
define('FD', true);
require __DIR__ . '/_base.php';

// Menos do que isto do primeiro clique ao envio é robô, não pessoa.
const DURACAO_MINIMA_SEG = 25;

fd_limitar('respostas', 40, 60);
$e = fd_corpo();

$sessao = (string) ($e['sessao'] ?? '');
$respostas = fd_respostas_validas($e['respostas'] ?? null);
$ia = fd_ia_valida($e['ia'] ?? []);
$passo = $e['passo'] ?? null;
if (!preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/', $sessao) || $respostas === null || $ia === null
    || !is_int($passo) || $passo < 0 || $passo > 60) {
    fd_responder(['ok' => false], 400);
}

$contato = null;
if (isset($e['contato'])) {
    $c = $e['contato'];
    $nome = trim((string) ($c['nome'] ?? ''));
    $email = trim((string) ($c['email'] ?? ''));
    $telefone = trim((string) ($c['telefone'] ?? ''));
    if ($nome === '' || strlen($nome) > 160 || !filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($telefone) > 40) {
        fd_responder(['ok' => false], 400);
    }
    $contato = ['nome' => $nome, 'email' => $email, 'telefone' => $telefone];
}

$teste = ($e['teste'] ?? false) === true;
$duracao = is_int($e['duracaoSeg'] ?? null) ? $e['duracaoSeg'] : null;
$concluido = $contato !== null;
// Campo escondido preenchido, sem Turnstile (quando ligado) ou depressa demais: fica gravado, mas sem aviso.
$suspeito = !empty($e['site']) || (fd_turnstile_ligado() && !fd_sessao_valida()) || ($concluido && ($duracao ?? 0) < DURACAO_MINIMA_SEG);

$ficheiro = fd_dados('respostas') . '/' . $sessao . '.json';
$antes = is_readable($ficheiro) ? (json_decode((string) file_get_contents($ficheiro), true) ?: []) : [];
$agora = date('c');
$linha = [
    'sessao' => $sessao,
    'passo' => $passo,
    'concluido' => $concluido || !empty($antes['concluido']),
    'suspeito' => $suspeito,
    'teste' => $teste || !empty($antes['teste']),
    'respostas' => $respostas,
    'ia' => $ia,
    'nome' => $contato['nome'] ?? ($antes['nome'] ?? null),
    'email' => $contato['email'] ?? ($antes['email'] ?? null),
    'telefone' => $contato['telefone'] ?? ($antes['telefone'] ?? null),
    'origem' => fd_cortar((string) ($e['origem'] ?? ($antes['origem'] ?? '')), 120),
    'duracaoSeg' => $duracao,
    'ip' => fd_ip(),
    'userAgent' => fd_cortar((string) ($_SERVER['HTTP_USER_AGENT'] ?? ''), 300),
    'criadoEm' => $antes['criadoEm'] ?? $agora,
    'atualizadoEm' => $agora,
];
if (file_put_contents($ficheiro, json_encode($linha, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT), LOCK_EX) === false) {
    error_log('[formulario-super-power] não consegui gravar em ' . $ficheiro);
    fd_responder(['ok' => false], 500);
}
// Dados pessoais: só o utilizador do PHP lê.
@chmod($ficheiro, 0600);

// Avisa só na primeira conclusão, e nunca por um envio suspeito.
if ($contato !== null && !$suspeito && empty($antes['concluido'])) {
    avisar($e['aviso'] ?? [], $contato, $teste, $linha);
}
fd_responder(['ok' => true]);

function esc(string $s): string
{
    return htmlspecialchars($s, ENT_QUOTES, 'UTF-8');
}

// O aviso chega montado pela página (assunto e linhas, na língua do formulário).
function avisar(mixed $aviso, array $contato, bool $teste, array $linha): void
{
    $assunto = trim((string) preg_replace('/\s+/', ' ', fd_cortar((string) ($aviso['assunto'] ?? 'Novo lead'), 300)));
    $linhas = [];
    foreach (array_slice((array) ($aviso['linhas'] ?? []), 0, 60) as $l) {
        if (is_array($l) && count($l) === 2) {
            $linhas[] = [fd_cortar((string) $l[0], 200), fd_cortar((string) $l[1], 2000)];
        }
    }
    $titulo = fd_cortar((string) ($aviso['tituloProblema'] ?? ''), 200);
    $problema = fd_cortar((string) ($aviso['problema'] ?? ''), 4000);

    // E-mail pelo Resend. Em teste, vai para AVISO_TESTE_PARA (se existir).
    $para = ($teste && fd_segredo('AVISO_TESTE_PARA')) ? fd_segredo('AVISO_TESTE_PARA') : fd_segredo('AVISO_PARA');
    if (fd_segredo('RESEND_API_KEY') !== '' && $para !== '') {
        $tabela = '';
        foreach ($linhas as [$k, $v]) {
            $tabela .= '<tr><td style="padding:6px 12px 6px 0;color:#6b6b75;white-space:nowrap;vertical-align:top">' . esc($k)
                . '</td><td style="padding:6px 0">' . esc($v) . '</td></tr>';
        }
        $html = '<!DOCTYPE html><html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;padding:24px 16px;margin:0;color:#111">'
            . '<div style="max-width:600px;margin:0 auto"><h1 style="font-weight:500;font-size:22px;margin:0 0 16px">' . esc($assunto) . '</h1>'
            . '<table style="border-collapse:collapse;font-size:15px">' . $tabela . '</table>'
            . ($problema !== '' ? '<h2 style="font-weight:500;font-size:17px;margin:24px 0 8px">' . esc($titulo) . '</h2><p style="white-space:pre-wrap;line-height:1.6;margin:0">' . esc($problema) . '</p>' : '')
            . '</div></body></html>';
        [$estado] = fd_post('https://api.resend.com/emails', [
            'Authorization: Bearer ' . fd_segredo('RESEND_API_KEY'),
            'content-type: application/json',
        ], (string) json_encode([
            'from' => fd_segredo('AVISO_DE') ?: 'Formulário <onboarding@resend.dev>',
            'to' => array_map('trim', explode(',', $para)),
            'reply_to' => $contato['email'],
            'subject' => $assunto,
            'html' => $html,
        ], JSON_UNESCAPED_UNICODE), 8);
        if ($estado !== 200) {
            error_log('[formulario-super-power] e-mail falhou: HTTP ' . $estado);
        }
    }
    // Pedidos de teste não vão para o Telegram nem para o CRM.
    if ($teste) {
        return;
    }
    if (fd_segredo('AVISO_TELEGRAM_TOKEN') !== '' && fd_segredo('AVISO_TELEGRAM_CHAT') !== '') {
        $texto = $assunto . "\n\n" . implode("\n", array_map(fn($l) => $l[0] . ': ' . $l[1], $linhas)) . ($problema !== '' ? "\n\n" . $problema : '');
        fd_post('https://api.telegram.org/bot' . fd_segredo('AVISO_TELEGRAM_TOKEN') . '/sendMessage', ['content-type: application/json'],
            (string) json_encode(['chat_id' => fd_segredo('AVISO_TELEGRAM_CHAT'), 'text' => fd_cortar($texto, 4000), 'disable_web_page_preview' => true], JSON_UNESCAPED_UNICODE), 8);
    }
    if (fd_segredo('AVISO_WEBHOOK_URL') !== '') {
        unset($linha['ip'], $linha['userAgent']);
        fd_post(fd_segredo('AVISO_WEBHOOK_URL'), ['content-type: application/json'], (string) json_encode($linha + ['contato' => $contato], JSON_UNESCAPED_UNICODE), 8);
    }
}
