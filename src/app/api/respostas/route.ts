import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { FORMULARIO } from '../../../../formulario'
import { rateLimitOrReject } from '@/lib/rate-limit'
import { gravar } from '@/lib/banco'
import { iaSchema, respostasSchema, type IA } from '@/lib/ia'
import { linhasResumo } from '@/lib/fluxo'
import type { Respostas } from '@/lib/tipos'

// Cada resposta grava a conversa (para medir onde as pessoas desistem).
// O último passo traz o contato, marca como concluída e avisa por e-mail.

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
  // Armadilha para robôs: campo escondido que uma pessoa nunca preenche.
  site: z.string().max(200).optional(),
})

export async function POST(request: NextRequest) {
  const limitado = rateLimitOrReject(request, 'respostas', 40, 60_000)
  if (limitado) return limitado

  const parsed = envioSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ ok: false }, { status: 400 })
  const { sessao, passo, respostas, ia, contato, origem, duracaoSeg, site } = parsed.data

  const concluido = Boolean(contato)
  const suspeito = Boolean(site) || (concluido && (duracaoSeg ?? 0) < DURACAO_MINIMA_SEG)

  try {
    const { jaConcluida } = await gravar({
      sessao, passo, concluido, suspeito, respostas, ia,
      nome: contato?.nome ?? null,
      email: contato?.email ?? null,
      telefone: contato?.telefone ?? null,
      origem: origem ?? null,
      duracaoSeg: duracaoSeg ?? null,
      ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
      userAgent: request.headers.get('user-agent')?.slice(0, 300) || null,
    })
    // Avisa só na primeira conclusão, e nunca por um envio suspeito.
    if (contato && !suspeito && !jaConcluida) {
      await avisar(respostas, ia as IA, contato.email, origem, duracaoSeg)
    }
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[respostas] erro:', error)
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}

const escapar = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

// O e-mail para quem recebe os leads (Resend). Sem RESEND_API_KEY ou AVISO_PARA, não envia.
async function avisar(r: Respostas, ia: IA, email: string, origem?: string, duracaoSeg?: number) {
  const chave = process.env.RESEND_API_KEY
  const para = process.env.AVISO_PARA
  if (!chave || !para) return
  const C = FORMULARIO
  const problema = C.passos.find((p) => p.tipo === 'problema')
  const extra = C.passos.find((p) => p.tipo === 'extra')
  const linhas: [string, string | undefined][] = [
    ['Nome', String(r[C.contato.nome] ?? '')],
    ['E-mail', email],
    ...(C.contato.telefone ? [['Telefone', String(r[C.contato.telefone] ?? '')] as [string, string]] : []),
    ...linhasResumo(C, r, ia).filter(([k]) => k !== problema?.resumo),
    ...(extra && ia.pergunta ? [[ia.pergunta.pergunta, String(r[extra.id] ?? '')] as [string, string]] : []),
    ['Mapa: problema', ia.mapa?.problema],
    ['Mapa: objetivo', ia.mapa?.objetivo],
    ['Mapa: primeiro passo', ia.mapa?.primeiroPasso],
    ['Ajuste pedido ao mapa', ia.ajusteMapa],
    ['Origem', origem],
    ['Tempo no formulário', duracaoSeg ? `${Math.max(1, Math.round(duracaoSeg / 60))} min` : undefined],
  ]
  const tabela = linhas
    .filter(([, v]) => v)
    .map(([k, v]) => `<tr><td style="padding:6px 12px 6px 0;color:#6b6b75;white-space:nowrap;vertical-align:top">${escapar(k)}</td><td style="padding:6px 0">${escapar(v)}</td></tr>`)
    .join('')
  const html = `<!DOCTYPE html><html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;padding:24px 16px;margin:0;color:#111">
<div style="max-width:600px;margin:0 auto">
<h1 style="font-weight:500;font-size:22px;margin:0 0 16px">${escapar(C.aviso.assunto(r))}</h1>
<table style="border-collapse:collapse;font-size:15px">${tabela}</table>
${problema ? `<h2 style="font-weight:500;font-size:17px;margin:24px 0 8px">O que quer resolver</h2><p style="white-space:pre-wrap;line-height:1.6;margin:0">${escapar(r[problema.id])}</p>` : ''}
</div></body></html>`

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${chave}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from: process.env.AVISO_DE || 'Formulário <onboarding@resend.dev>',
      to: para.split(',').map((s) => s.trim()),
      reply_to: email,
      subject: C.aviso.assunto(r),
      html,
    }),
  })
  if (!res.ok) console.error('[respostas] e-mail falhou:', res.status, (await res.text()).slice(0, 200))
}
