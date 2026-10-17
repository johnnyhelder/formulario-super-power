import type { Config, Respostas } from './tipos'
import type { FichaIA, IA } from './ia'
import { linhasResumo, motivosParaRever } from './fluxo'
import { textosDe } from './textos'

// O conteúdo do aviso de lead novo (assunto e linhas), igual no e-mail, no
// Telegram e na versão PHP (que o recebe já montado da página).

export type Aviso = {
  assunto: string
  linhas: [string, string][]
  tituloProblema: string
  problema: string
  // Da ficha do lead: a primeira mensagem já com o nome e o link do WhatsApp com ela escrita.
  mensagem?: string
  whatsapp?: string
}

// A IA escreve {nome}; o nome só entra aqui, no servidor (a IA nunca recebe dados pessoais).
export function mensagemComNome(mensagem: string, nome: string): string {
  return mensagem.replaceAll('{nome}', nome.trim().split(/\s+/)[0] || '')
}

export function linkWhatsapp(telefone: string | undefined, mensagem: string): string | undefined {
  const n = (telefone ?? '').replace(/\D/g, '')
  return n.length >= 8 ? `https://wa.me/${n}?text=${encodeURIComponent(mensagem)}` : undefined
}

export function montarAviso(
  C: Config,
  e: { respostas: Respostas; ia: IA; contato: { nome: string; email: string; telefone?: string }; origem?: string; duracaoSeg?: number },
  teste: boolean,
  ficha?: FichaIA,
): Aviso {
  const T = textosDe(C)
  const { respostas: r, ia, contato } = e
  const problema = C.passos.find((p) => p.tipo === 'problema')
  const extra = C.passos.find((p) => p.tipo === 'extra')
  const resumo = C.passos.find((p) => p.tipo === 'resumo')
  // Pedido incoerente ou sem relação com o negócio: chega marcado, para ninguém responder no automático.
  const motivos = motivosParaRever(C, r, ia)
  const correcao = resumo && r[resumo.id] !== T.estaCerto ? String(r[resumo.id] ?? '') : undefined
  const tituloProblema = problema?.resumo ?? T.oQueQuer
  const linhas = ([
    ...motivos.map((m) => [T.rever, m]),
    ...(ficha
      ? [
          [T.temperatura, `${T.temperaturas[ficha.temperatura]} · ${ficha.porque}`],
          [T.abordagem, ficha.abordagem],
          [T.proximoPasso, ficha.proximoPasso],
        ]
      : []),
    [T.nome, contato.nome],
    [T.email, contato.email],
    [T.telefone, contato.telefone],
    ...linhasResumo(C, r, ia).filter(([k]) => k !== tituloProblema),
    ...(extra && ia.pergunta ? [[ia.pergunta.pergunta, String(r[extra.id] ?? '')]] : []),
    [T.resumoIA, ia.resumo],
    [T.correcao, correcao],
    [T.mapaProblema, ia.mapa?.problema],
    [T.mapaObjetivo, ia.mapa?.objetivo],
    [T.mapaPasso, ia.mapa?.primeiroPasso],
    [T.mapaAjuste, ia.ajusteMapa],
    [T.origem, e.origem],
    [T.tempo, e.duracaoSeg ? `${Math.max(1, Math.round(e.duracaoSeg / 60))} min` : undefined],
  ] as [string, string | undefined][]).filter((l): l is [string, string] => Boolean(l[1]))
  const mensagem = ficha ? mensagemComNome(ficha.mensagem, contato.nome) : undefined
  return {
    mensagem,
    whatsapp: mensagem ? linkWhatsapp(contato.telefone, mensagem) : undefined,
    assunto: `${teste ? '[TESTE] ' : ''}${motivos.length ? `[${T.rever.toUpperCase()}] ` : ''}${ficha ? `[${T.temperaturas[ficha.temperatura]}] ` : ''}${C.aviso.assunto(r)}`,
    linhas,
    tituloProblema,
    problema: problema ? String(r[problema.id] ?? '') : '',
  }
}
