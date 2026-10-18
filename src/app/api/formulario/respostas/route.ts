import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { FORMULARIO } from '../../../../../formulario'
import { NEGOCIO } from '../../../../../negocio'
import { rateLimitOrReject } from '@/lib/rate-limit'
import { gravar } from '@/lib/banco'
import { iaSchema, respostasSchema, type FichaIA, type IA } from '@/lib/ia'
import { montarAviso, type Aviso } from '@/lib/aviso'
import { perguntarClaude } from '@/lib/claude'
import { chave as chaveDe } from '@/lib/env'
import { dadosParaIA } from '@/lib/fluxo'
import { instrucao } from '@/lib/prompts'
import { textosDe } from '@/lib/textos'
import { sessaoValida, turnstileLigado } from '@/lib/sessao'

// Cada resposta grava a conversa (para medir onde as pessoas desistem).
// O último passo traz o contato, marca como concluída e avisa: e-mail,
// Telegram e/ou um webhook (n8n, Make, CRM), conforme o que estiver configurado.

// Menos do que isto do primeiro clique ao envio é robô, não pessoa.
const DURACAO_MINIMA_SEG = 25

const envioSchema = z.object({
  sessao: z.string().uuid(),
  passo: z.number().int().min(0).max(60),
  respostas: respostasSchema,
  ia: iaSchema,
  contato: z
    .object({
      nome: z.string().trim().min(1).max(80),
      email: z.string().trim().email().max(120),
      telefone: z.string().trim().max(25).optional(),
    })
    .optional(),
  origem: z.string().max(120).optional(),
  duracaoSeg: z.number().int().min(0).max(86_400).optional(),
  // Aberto com ?teste=1: fica marcado e o aviso vai só por e-mail, com [TESTE].
  teste: z.boolean().optional(),
  // Armadilha para robôs: campo escondido que uma pessoa nunca preenche.
  site: z.string().max(200).optional(),
})

type Envio = z.infer<typeof envioSchema>

export async function POST(request: NextRequest) {
  const limitado = rateLimitOrReject(request, 'respostas', 40, 60_000)
  if (limitado) return limitado

  const parsed = envioSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ ok: false }, { status: 400 })
  const envio = parsed.data
  const { sessao, passo, respostas, ia, contato, origem, duracaoSeg, site } = envio
  const teste = Boolean(envio.teste)

  const concluido = Boolean(contato)
  // Com Turnstile ligado, quem não passou pela Cloudflare fica gravado, mas como suspeito (sem aviso).
  const semTurnstile = turnstileLigado() && !sessaoValida(request.headers.get('x-sessao-ia'))
  const suspeito = Boolean(site) || semTurnstile || (concluido && (duracaoSeg ?? 0) < DURACAO_MINIMA_SEG)

  try {
    const { jaConcluida } = await gravar({
      sessao, passo, concluido, suspeito, respostas, ia, teste,
      nome: contato?.nome ?? null,
      email: contato?.email ?? null,
      telefone: contato?.telefone ?? null,
      origem: origem ?? null,
      duracaoSeg: duracaoSeg ?? null,
      ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
      userAgent: request.headers.get('user-agent')?.slice(0, 300) || null,
    })
    // Avisa só na primeira conclusão, e nunca por um envio suspeito.
    if (contato && !suspeito && !jaConcluida) await avisar(envio, teste)
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[respostas] erro:', error)
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}

const escapar = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

// Cada canal falha sozinho: um Telegram em baixo não impede o e-mail.
async function avisar(envio: Envio, teste: boolean) {
  const C = FORMULARIO
  const ia = envio.ia as IA
  // A ficha do lead: mais uma chamada ao Haiku, só quando o pedido chega. Se falhar, o aviso sai sem ela.
  let ficha: FichaIA | undefined
  if (chaveDe('ANTHROPIC_API_KEY')) {
    const res = await perguntarClaude('ficha', instrucao(C, 'ficha', dadosParaIA(C, envio.respostas, ia), '', NEGOCIO)).catch(() => null)
    if (res?.ok) ficha = res.dados
  }
  const a = montarAviso(C, { ...envio, ia, contato: envio.contato! }, teste, ficha)
  const canais: Promise<void>[] = [email(a, envio.contato!.email, teste)]
  // Pedidos de teste não vão para o Telegram nem para o CRM.
  if (!teste) canais.push(telegram(a), webhook(envio, ficha, a))
  await Promise.allSettled(canais)
}

// E-mail pelo Resend. Sem RESEND_API_KEY ou AVISO_PARA, não envia.
// Em teste, vai para AVISO_TESTE_PARA (se existir) em vez de AVISO_PARA.
async function email(a: Aviso, responderA: string, teste: boolean) {
  const chave = process.env.RESEND_API_KEY
  const para = (teste && process.env.AVISO_TESTE_PARA) || process.env.AVISO_PARA
  if (!chave || !para) return
  const T = textosDe(FORMULARIO)
  const tabela = a.linhas
    .map(([k, v]) => `<tr><td style="padding:6px 12px 6px 0;color:#6b6b75;white-space:nowrap;vertical-align:top">${escapar(k)}</td><td style="padding:6px 0">${escapar(v)}</td></tr>`)
    .join('')
  const mensagem = a.mensagem
    ? `<h2 style="font-weight:500;font-size:17px;margin:24px 0 8px">${escapar(T.mensagemPronta)}</h2>
<p style="white-space:pre-wrap;line-height:1.6;margin:0;padding:14px 16px;background:#f1f5f2;border-radius:10px">${escapar(a.mensagem)}</p>
${a.whatsapp ? `<p style="margin:14px 0 0"><a href="${escapar(a.whatsapp)}" style="display:inline-block;background:#25D366;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600">${escapar(T.abrirWhatsapp)}</a></p>` : ''}`
    : ''
  const html = `<!DOCTYPE html><html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;padding:24px 16px;margin:0;color:#111">
<div style="max-width:600px;margin:0 auto">
<h1 style="font-weight:500;font-size:22px;margin:0 0 16px">${escapar(a.assunto)}</h1>
<table style="border-collapse:collapse;font-size:15px">${tabela}</table>
${mensagem}
${a.problema ? `<h2 style="font-weight:500;font-size:17px;margin:24px 0 8px">${escapar(a.tituloProblema)}</h2><p style="white-space:pre-wrap;line-height:1.6;margin:0">${escapar(a.problema)}</p>` : ''}
</div></body></html>`
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${chave}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        from: process.env.AVISO_DE || 'Formulário <onboarding@resend.dev>',
        to: para.split(',').map((s) => s.trim()),
        reply_to: responderA,
        subject: a.assunto,
        html,
      }),
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) console.error('[respostas] e-mail falhou:', res.status, (await res.text()).slice(0, 200))
  } catch (e) {
    console.error('[respostas] e-mail falhou:', e)
  }
}

// Telegram (opcional): AVISO_TELEGRAM_TOKEN (do @BotFather) e AVISO_TELEGRAM_CHAT (o seu chat id).
// Duas mensagens: o pedido com a ficha e, à parte, só a mensagem pronta para copiar e mandar.
async function telegram(a: Aviso) {
  const token = process.env.AVISO_TELEGRAM_TOKEN
  const chat = process.env.AVISO_TELEGRAM_CHAT
  if (!token || !chat) return
  const textos = [
    [a.assunto, '', ...a.linhas.map(([k, v]) => `${k}: ${v}`), ...(a.problema ? ['', a.problema] : []), ...(a.whatsapp ? ['', a.whatsapp] : [])].join('\n'),
    ...(a.mensagem ? [a.mensagem] : []),
  ]
  for (const texto of textos) {
    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: chat, text: texto.slice(0, 4000), disable_web_page_preview: true }),
        signal: AbortSignal.timeout(8000),
      })
      if (!res.ok) console.error('[respostas] Telegram falhou:', res.status)
    } catch (e) {
      console.error('[respostas] Telegram falhou:', e)
    }
  }
}

// Webhook (opcional): AVISO_WEBHOOK_URL recebe o pedido inteiro em JSON, com a ficha (n8n, Make, Zapier, CRM).
async function webhook(envio: Envio, ficha: FichaIA | undefined, a: Aviso) {
  const url = process.env.AVISO_WEBHOOK_URL
  if (!url) return
  const { site: _armadilha, ...dados } = envio
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...dados, ficha: ficha ? { ...ficha, mensagem: a.mensagem, whatsapp: a.whatsapp } : undefined }),
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) console.error('[respostas] webhook falhou:', res.status)
  } catch (e) {
    console.error('[respostas] webhook falhou:', e)
  }
}
