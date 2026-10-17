<?php
// Troca o token do Turnstile (5 minutos, uma validação) por uma sessão assinada de 2 horas.
declare(strict_types=1);
define('FD', true);
require __DIR__ . '/_base.php';

fd_limitar('sessao', 10, 600);
if (!fd_turnstile_ligado()) {
    fd_responder(['ok' => false], 404);
}
$token = (string) (fd_corpo()['token'] ?? '');
if (strlen($token) < 10 || strlen($token) > 4000) {
    fd_responder(['ok' => false], 400);
}
[$estado, $bruto] = fd_post('https://challenges.cloudflare.com/turnstile/v0/siteverify', [],
    http_build_query(['secret' => fd_segredo('TURNSTILE_SECRET_KEY'), 'response' => $token, 'remoteip' => fd_ip()]), 6);
if ($estado !== 200 || empty(json_decode($bruto, true)['success'])) {
    fd_responder(['ok' => false], 403);
}
fd_responder(['ok' => true, 'sessao' => fd_sessao_nova()]);
