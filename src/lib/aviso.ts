import type { Config, Respostas } from './tipos'
import type { IA } from './ia'
import { linhasResumo, motivosParaRever } from './fluxo'
import { TEXTOS } from './textos'

// O conteúdo do aviso de lead novo (assunto e linhas), igual no e-mail, no
// Telegram e na versão PHP (que o recebe já montado da página).

export type Aviso = { assunto: string; linhas: [string, string][]; tituloProblema: string; problema: string }

export function montarAviso(
  C: Config,
  e: { respostas: Respostas; ia: IA; contato: { nome: string; email: string; telefone?: string }; origem?: string; duracaoSeg?: number },
  teste: boolean,
): Aviso {
  const T = TEXTOS[C.idioma]
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
  return {
    assunto: `${teste ? '[TESTE] ' : ''}${motivos.length ? `[${T.rever.toUpperCase()}] ` : ''}${C.aviso.assunto(r)}`,
    linhas,
    tituloProblema,
    problema: problema ? String(r[problema.id] ?? '') : '',
  }
}
