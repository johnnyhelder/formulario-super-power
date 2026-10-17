'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowUp, Sparkles, Pencil, ChevronDown, Undo2, RotateCcw } from 'lucide-react'
import { FORMULARIO as C } from '../../formulario'
import type { Passo, Respostas, Valor } from '@/lib/tipos'
import { DESCONHECIDO, passoEmpresa, type EmpresaIA, type IA, type MapaIA, type NotasIA, type PerguntaIA } from '@/lib/ia'
import { CONFIRMAR, etapas, linhasResumo, opcoesDe, passoDe, proxima, radarValores, texto as textoDe } from '@/lib/fluxo'
import { Bolha, CartaoCenario, CartaoEmpresa, CartaoEscala, CartaoMapa, Digitando, Radar, Resumo } from './pecas'

// A conversa. Uma pergunta de cada vez, como num chat: a resposta vira
// balão, o painel "Resumo do seu caso" escreve-se sozinho e, pelo caminho,
// aparecem a empresa, o cenário, a equipe em bonequinhos e o mapa do caso.
// A IA corre sempre em segundo plano, antes de a pessoa precisar dela: a
// empresa é pesquisada assim que chega o nome, as notas enquanto ela escreve,
// a pergunta extra e o mapa enquanto responde ao resto. Se a IA falhar, a
// conversa segue sem esses extras.
// As perguntas e as opções vêm do formulario.ts.

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void
  }
}

type Item =
  | { id: number; tipo: 'bot'; texto: string; rotulo?: string; nota?: string }
  | { id: number; tipo: 'eu'; texto: string }
  | { id: number; tipo: 'empresa'; empresa: EmpresaIA }
  | { id: number; tipo: 'cenario'; notas: NotasIA }
  | { id: number; tipo: 'escala'; titulo: string; destaque?: string; pessoas: string; bonecos: number; sub?: string }
  | { id: number; tipo: 'mapa'; mapa: MapaIA }
  | { id: number; tipo: 'fim' }

// Omit que respeita cada variante da união.
type SemId<T> = T extends unknown ? Omit<T, 'id'> : never

// O estado da conversa antes de cada resposta, para o botão Voltar.
type Foto = { itens: Item[]; etapa: string | null; r: Respostas; ia: IA; feitas: number; marcadas: string[] }

const ETAPAS = etapas(C)
const EMPRESA = passoEmpresa(C)
const ULTIMA = ETAPAS[ETAPAS.length - 1]
const CHAVE_SESSAO = 'form-dinamico-sessao'

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function pedirIA<T>(corpo: object, limiteMs = 9000): Promise<T | undefined> {
  try {
    const res = await fetch('/api/ia', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
      signal: AbortSignal.timeout(limiteMs),
    })
    if (!res.ok) return undefined
    const j = await res.json()
    return j.ok ? (j.dados as T) : undefined
  } catch {
    return undefined
  }
}

function novaSessao(): string {
  try {
    const guardada = sessionStorage.getItem(CHAVE_SESSAO)
    if (guardada) return guardada
    const nova = crypto.randomUUID()
    sessionStorage.setItem(CHAVE_SESSAO, nova)
    return nova
  } catch {
    return crypto.randomUUID()
  }
}

function semMovimento(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

// Para saber se a etapa seguinte "seria" a pergunta extra ou o mapa, se a IA já os tivesse.
const IA_CHEIA: IA = {
  pergunta: { pergunta: '-', opcoes: [], palpite: '' },
  mapa: { problema: '', causas: [], objetivo: '', primeiroPasso: '', ajustes: [] },
}

export function Conversa() {
  const [itens, setItens] = useState<Item[]>([])
  const [etapa, setEtapa] = useState<string | null>(null)
  const [r, setR] = useState<Respostas>({})
  const [ia, setIa] = useState<IA>({})
  const [digitando, setDigitando] = useState(false)
  const [texto, setTexto] = useState('')
  const [marcadas, setMarcadas] = useState<string[]>([])
  const [escrevendoLivre, setEscrevendoLivre] = useState(false)
  const [ajustando, setAjustando] = useState(false)
  const [anotando, setAnotando] = useState(false)
  const [erro, setErro] = useState('')
  const [site, setSite] = useState('')
  const [painelAberto, setPainelAberto] = useState(false)
  const [feitas, setFeitas] = useState(0)
  const [ocupado, setOcupado] = useState(false)
  const [podeVoltar, setPodeVoltar] = useState(false)
  const [confirmarReinicio, setConfirmarReinicio] = useState(false)

  const itensRef = useRef<Item[]>([])
  const historico = useRef<Foto[]>([])
  const rRef = useRef<Respostas>({})
  const iaRef = useRef<IA>({})
  const idRef = useRef(0)
  const sessao = useRef('')
  const inicio = useRef(0)
  const origem = useRef<string | undefined>(undefined)
  // ?teste=1 no endereço: o pedido fica marcado como teste e o aviso diz [TESTE].
  const teste = useRef(false)
  const fimRef = useRef<HTMLDivElement>(null)
  const entradaRef = useRef<HTMLInputElement & HTMLTextAreaElement>(null)
  const promessaPergunta = useRef<Promise<void> | undefined>(undefined)
  const ultimaNota = useRef('')
  const comecou = useRef(false)

  const atualizarR = (patch: Respostas) => {
    rRef.current = { ...rRef.current, ...patch }
    setR(rRef.current)
  }
  const atualizarIa = (patch: Partial<IA>) => {
    iaRef.current = { ...iaRef.current, ...patch }
    setIa(iaRef.current)
  }
  const empurrar = (item: SemId<Item>) => {
    idRef.current += 1
    itensRef.current = [...itensRef.current, { ...item, id: idRef.current } as Item]
    setItens(itensRef.current)
  }

  const gravar = useCallback(
    (passo: number) => {
      fetch('/api/respostas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessao: sessao.current,
          passo,
          respostas: limpas(rRef.current),
          ia: iaRef.current,
          origem: origem.current,
          duracaoSeg: Math.round((Date.now() - inicio.current) / 1000),
          site: site || undefined,
          teste: teste.current || undefined,
        }),
      }).catch(() => {})
    },
    [site],
  )

  // O bot "escreve" um pouco antes de cada fala: dá ritmo e tempo para a IA.
  const falar = async (t: string, extra?: { rotulo?: string; nota?: string }, ms = 650) => {
    setDigitando(true)
    await espera(semMovimento() ? 150 : ms)
    setDigitando(false)
    empurrar({ tipo: 'bot', texto: t, ...extra })
  }

  const perguntaDe = (e: string): { texto: string; rotulo?: string; nota?: string } => {
    const rr = rRef.current
    const ii = iaRef.current
    if (e.endsWith(CONFIRMAR)) return { texto: 'É esta a sua empresa?' }
    const p = passoDe(C, e)!
    if (p.tipo === 'extra') {
      return {
        texto: ii.pergunta?.pergunta ?? '',
        rotulo: 'Uma pergunta para entendermos melhor',
        nota: ii.pergunta?.palpite ? `Meu palpite: ${ii.pergunta.palpite}` : undefined,
      }
    }
    const sugeriu = e === EMPRESA?.passoSegmento && ii.empresa?.segmentos.length
    return {
      texto: textoDe(p.pergunta, rr),
      nota: sugeriu ? 'Deixei no topo o que me pareceu mais provável.' : textoDe(p.nota, rr) || undefined,
    }
  }

  // Abertura.
  useEffect(() => {
    if (comecou.current) return
    comecou.current = true
    sessao.current = novaSessao()
    inicio.current = Date.now()
    const q = new URLSearchParams(window.location.search)
    const partes = [q.get('utm_source'), q.get('utm_campaign'), q.get('utm_content')].filter(Boolean)
    origem.current = partes.length ? partes.join(' / ') : undefined
    teste.current = q.get('teste') === '1'
    ;(async () => {
      const primeira = proxima(C, null, {}, {})!
      await falar(perguntaDe(primeira).texto, undefined, 500)
      setEtapa(primeira)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Cada fala nova traz o fim da conversa para a vista.
  useEffect(() => {
    fimRef.current?.scrollIntoView({ behavior: semMovimento() ? 'auto' : 'smooth', block: 'end' })
  }, [itens.length, digitando, etapa, ia.notas])

  const passoAtual = etapa && !etapa.endsWith(CONFIRMAR) ? passoDe(C, etapa) : undefined

  // Foco no campo de escrever quando a etapa pede texto.
  useEffect(() => {
    // Quando há opções sugeridas, o teclado do telemóvel taparia as opções.
    if (!digitando && passoAtual?.tipo !== 'escolha') entradaRef.current?.focus({ preventScroll: true })
  }, [digitando, passoAtual, escrevendoLivre, ajustando])

  // Notas ao vivo enquanto a pessoa descreve o problema.
  useEffect(() => {
    if (passoAtual?.tipo !== 'problema') return
    const t = texto.trim()
    if (t.length < 25 || Math.abs(t.length - ultimaNota.current.length) < (C.ia.letrasNovas ?? 12)) return
    const id = setTimeout(async () => {
      ultimaNota.current = t
      setAnotando(true)
      const notas = await pedirIA<NotasIA>({ tipo: 'notas', respostas: limpas({ ...rRef.current, [passoAtual.id]: t }), ia: iaRef.current })
      setAnotando(false)
      if (notas) atualizarIa({ notas, notasTexto: t })
    }, C.ia.pausaMs ?? 1100)
    return () => clearTimeout(id)
  }, [texto, passoAtual])

  const avancar = async (de: string) => {
    // A pergunta extra e o mapa só entram se a IA os tiver prontos: espera um pouco por eles.
    const candidata = proxima(C, de, rRef.current, { ...iaRef.current, ...IA_CHEIA })
    const tipo = candidata ? passoDe(C, candidata)?.tipo : undefined
    if (tipo === 'extra' && promessaPergunta.current) {
      await Promise.race([promessaPergunta.current, espera(4000)])
    }
    if (tipo === 'mapa') {
      setDigitando(true)
      const mapa = await pedirIA<MapaIA>({ tipo: 'mapa', respostas: limpas(rRef.current), ia: iaRef.current }, 10000)
      setDigitando(false)
      if (mapa?.causas?.length) atualizarIa({ mapa })
    }

    const seguinte = proxima(C, de, rRef.current, iaRef.current)
    if (!seguinte) return
    if (seguinte.endsWith(CONFIRMAR)) {
      await falar(`Encontrei isto sobre a ${rRef.current[EMPRESA!.id]}:`, undefined, 300)
      empurrar({ tipo: 'empresa', empresa: iaRef.current.empresa! })
      await espera(600)
    }
    if (passoDe(C, seguinte)?.tipo === 'mapa') {
      empurrar({ tipo: 'mapa', mapa: iaRef.current.mapa! })
    }
    const p = perguntaDe(seguinte)
    await falar(p.texto, { rotulo: p.rotulo, nota: p.nota })
    setEtapa(seguinte)
  }

  const fotografar = () => {
    historico.current.push({ itens: itensRef.current, etapa, r: rRef.current, ia: iaRef.current, feitas, marcadas })
    setPodeVoltar(true)
  }

  // Voltar: desfaz a última resposta e repõe a pergunta como estava.
  const voltar = () => {
    const f = historico.current.pop()
    if (!f) return
    itensRef.current = f.itens
    setItens(f.itens)
    rRef.current = f.r
    setR(f.r)
    iaRef.current = f.ia
    setIa(f.ia)
    setFeitas(f.feitas)
    setMarcadas(f.marcadas)
    setTexto('')
    setErro('')
    setEscrevendoLivre(false)
    setAjustando(false)
    setEtapa(f.etapa)
    setPodeVoltar(historico.current.length > 0)
  }

  // Recomeçar: conversa nova, sessão nova (a antiga fica como abandonada).
  const recomecar = async () => {
    setConfirmarReinicio(false)
    historico.current = []
    setPodeVoltar(false)
    itensRef.current = []
    setItens([])
    rRef.current = {}
    setR({})
    iaRef.current = {}
    setIa({})
    setFeitas(0)
    setMarcadas([])
    setTexto('')
    setErro('')
    setEscrevendoLivre(false)
    setAjustando(false)
    ultimaNota.current = ''
    promessaPergunta.current = undefined
    try { sessionStorage.removeItem(CHAVE_SESSAO) } catch {}
    sessao.current = novaSessao()
    inicio.current = Date.now()
    setEtapa(null)
    setOcupado(true)
    const primeira = proxima(C, null, {}, {})!
    await falar(perguntaDe(primeira).texto, undefined, 400)
    setEtapa(primeira)
    setOcupado(false)
  }

  // Responde à etapa atual: balão da pessoa, grava, dispara a IA e avança.
  const responder = async (mostrar: string, valor: Valor | boolean) => {
    fotografar()
    setOcupado(true)
    try {
      await responderEtapa(mostrar, valor)
    } finally {
      setOcupado(false)
    }
  }

  const responderEtapa = async (mostrar: string, valor: Valor | boolean) => {
    const de = etapa!
    const p = passoDe(C, de)
    setErro('')
    setTexto('')
    setEscrevendoLivre(false)
    empurrar({ tipo: 'eu', texto: mostrar })
    if (p && typeof valor !== 'boolean') atualizarR({ [p.id]: valor })
    setEtapa(null) // esconde as entradas enquanto o bot responde
    const feito = ETAPAS.indexOf(de) + 1
    setFeitas(feito)
    const rr = rRef.current

    if (de.endsWith(CONFIRMAR)) {
      const achada = iaRef.current.empresa
      if (valor === true && achada) {
        atualizarIa({ empresaConfirmada: true })
        const pais = EMPRESA?.passoPais
        if (pais && achada.pais !== DESCONHECIDO) atualizarR({ [pais]: achada.pais })
      } else {
        atualizarIa({ empresa: undefined, empresaConfirmada: false })
      }
    } else if (p?.tipo === 'empresa') {
      atualizarIa({ empresa: undefined, empresaConfirmada: undefined })
      if (EMPRESA?.passoPais) atualizarR({ [EMPRESA.passoPais]: undefined })
      if (valor) {
        // Pesquisa a empresa na internet enquanto o bot "escreve".
        setDigitando(true)
        const achada = await pedirIA<EmpresaIA>({ tipo: 'empresa', empresa: String(valor) }, 12000)
        setDigitando(false)
        if (achada) atualizarIa({ empresa: achada })
      }
    } else if (p?.tipo === 'problema') {
      if (iaRef.current.notasTexto !== rr[p.id]) {
        setDigitando(true)
        const notas = await pedirIA<NotasIA>({ tipo: 'notas', respostas: limpas(rr), ia: iaRef.current }, 8000)
        setDigitando(false)
        if (notas) atualizarIa({ notas, notasTexto: String(rr[p.id]) })
      }
      if (iaRef.current.notas) {
        empurrar({ tipo: 'cenario', notas: iaRef.current.notas })
        await espera(700)
      }
      // A pergunta extra prepara-se já, enquanto a pessoa responde ao resto.
      promessaPergunta.current = pedirIA<PerguntaIA>({ tipo: 'pergunta', respostas: limpas(rRef.current), ia: iaRef.current }).then((d) => {
        if (d?.pergunta && d.opcoes.length) atualizarIa({ pergunta: d })
      })
    } else if (p?.tipo === 'escala') {
      const opcao = p.opcoes.find((o) => o.rotulo === valor)
      const nome = EMPRESA && rr[EMPRESA.id]
      empurrar({
        tipo: 'escala',
        titulo: nome ? `A ${nome}, em escala real` : 'O seu negócio, em escala real',
        destaque: p.destaque?.(rr),
        pessoas: String(valor),
        bonecos: opcao?.bonecos ?? 5,
        sub: EMPRESA?.passoSegmento ? (rr[EMPRESA.passoSegmento] as string | undefined) : undefined,
      })
      await espera(900)
    }

    gravar(feito)
    if (de === ULTIMA) {
      await concluir()
      return
    }
    await avancar(de)
  }

  const ajustarMapa = async (pedido: string) => {
    fotografar()
    setOcupado(true)
    try {
      setTexto('')
      setAjustando(false)
      empurrar({ tipo: 'eu', texto: pedido })
      atualizarIa({ ajusteMapa: pedido })
      const atual = etapa
      setEtapa(null)
      setDigitando(true)
      const mapa = await pedirIA<MapaIA>({ tipo: 'mapa', respostas: limpas(rRef.current), ia: iaRef.current }, 10000)
      setDigitando(false)
      if (mapa?.causas?.length) {
        atualizarIa({ mapa })
        empurrar({ tipo: 'mapa', mapa })
        await falar('Ajustei o mapa com o que você disse. Ficou certo agora?')
      } else {
        await falar('Anotei o seu ajuste e vou levá-lo em conta. Ficou certo assim?')
      }
      setEtapa(atual)
    } finally {
      setOcupado(false)
    }
  }

  const concluir = async () => {
    const rr = rRef.current
    setDigitando(true)
    try {
      const res = await fetch('/api/respostas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessao: sessao.current,
          passo: ETAPAS.length,
          respostas: limpas(rr),
          ia: iaRef.current,
          contato: {
            nome: String(rr[C.contato.nome] ?? ''),
            email: String(rr[C.contato.email] ?? ''),
            telefone: C.contato.telefone ? String(rr[C.contato.telefone] ?? '') : undefined,
          },
          origem: origem.current,
          duracaoSeg: Math.round((Date.now() - inicio.current) / 1000),
          site: site || undefined,
          teste: teste.current || undefined,
        }),
      })
      if (!res.ok) throw new Error()
      window.fbq?.('track', 'Lead')
      try { sessionStorage.removeItem(CHAVE_SESSAO) } catch {}
      await espera(500)
      setDigitando(false)
      empurrar({ tipo: 'fim' })
      setEtapa(null)
    } catch {
      setDigitando(false)
      setErro('Não consegui enviar agora. Confira os dados e tente de novo.')
      setEtapa(ULTIMA)
    }
  }

  const enviarTexto = (e?: React.FormEvent) => {
    e?.preventDefault()
    const t = texto.trim()
    if (ajustando) {
      if (t.length >= 3) ajustarMapa(t)
      return
    }
    const p = passoAtual
    if (!p) return
    switch (p.tipo) {
      case 'texto':
        if (t.length < (p.minimo ?? 1)) return setErro('Escreva um pouco mais.')
        return void responder(t, t)
      case 'empresa':
        if (t.length < 2) return setErro('Escreva o nome da empresa.')
        return void responder(t, t)
      case 'escolha':
        if (t.length < 2) return
        return void responder(t, t.slice(0, 80))
      case 'problema':
        if (t.length < 10) return setErro('Conte um pouco mais, nem que seja numa frase.')
        return void responder(t, t)
      case 'extra':
        if (t.length < 2) return
        return void responder(t, t)
      case 'email':
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(t)) return setErro('Esse e-mail não parece certo.')
        return void responder(t, t)
      case 'telefone':
        if (t.replace(/\D/g, '').length < 8) return setErro('Escreva o número com o indicativo do país.')
        return void responder(t, t)
    }
  }

  // ── Painel ─────────────────────────────────────────────────────────────
  const linhas = useMemo(() => linhasResumo(C, r, ia), [r, ia])
  const radar = useMemo(() => radarValores(C, r, ia), [r, ia])

  const total = ETAPAS.length
  const progresso = Math.round((feitas / total) * 100)
  const faltam = Math.max(0, total - feitas)

  // ── Entradas da etapa atual ────────────────────────────────────────────
  const chips = (opcoes: string[], destaque?: string[]) => (
    <div className="fd-chips">
      {destaque?.filter((o) => opcoes.includes(o)).map((o) => (
        <button key={`d-${o}`} type="button" className="fd-chip fd-chip-sugerido" onClick={() => responder(o, o)}>
          <Sparkles size={14} aria-hidden="true" /> {o}
        </button>
      ))}
      {opcoes.filter((o) => !destaque?.includes(o)).map((o) => (
        <button key={o} type="button" className="fd-chip" onClick={() => responder(o, o)}>
          {o}
        </button>
      ))}
    </div>
  )

  const campoTexto = (marcador: string, tipo: 'text' | 'email' | 'tel' = 'text', autoComplete?: string) => (
    <form className="fd-escrever" onSubmit={enviarTexto}>
      <label htmlFor="fd-entrada" className="fd-escondido">{marcador}</label>
      <input
        id="fd-entrada"
        ref={entradaRef}
        type={tipo}
        autoComplete={autoComplete}
        value={texto}
        onChange={(e) => { setTexto(e.target.value); setErro('') }}
        placeholder={marcador}
      />
      <button type="submit" aria-label="Enviar" disabled={!texto.trim()}>
        <ArrowUp size={18} />
      </button>
    </form>
  )

  const privacidade = (
    <p className="fd-privado">
      {C.privacidade.texto}{' '}
      {C.privacidade.link && <a href={C.privacidade.link} target="_blank" rel="noopener noreferrer">Privacidade</a>}
    </p>
  )

  const entradaDe = (p: Passo): React.ReactNode => {
    switch (p.tipo) {
      case 'texto':
        return (
          <>
            {campoTexto(p.marcador, 'text', p.autoComplete)}
            {p.atalhos?.length ? chips(p.atalhos) : null}
          </>
        )
      case 'empresa':
        return (
          <>
            {campoTexto(p.marcador, 'text', 'organization')}
            {p.semEmpresa && (
              <div className="fd-chips">
                <button type="button" className="fd-chip" onClick={() => responder(p.semEmpresa!, '')}>{p.semEmpresa}</button>
              </div>
            )}
          </>
        )
      case 'escolha': {
        const sugeridos = p.id === EMPRESA?.passoSegmento ? ia.empresa?.segmentos : undefined
        return (
          <>
            {p.escrever && campoTexto(p.escrever)}
            {chips(opcoesDe(p, r), sugeridos)}
          </>
        )
      }
      case 'escala':
        return chips(opcoesDe(p, r))
      case 'varias':
        return (
          <div className="fd-chips">
            {p.opcoes.map((c) => (
              <button
                key={c}
                type="button"
                role="checkbox"
                aria-checked={marcadas.includes(c)}
                className={`fd-chip ${marcadas.includes(c) ? 'fd-chip-marcado' : ''}`}
                onClick={() => setMarcadas((xs) => (xs.includes(c) ? xs.filter((x) => x !== c) : [...xs, c]))}
              >
                {c}
              </button>
            ))}
            <button type="button" className="fd-chip fd-chip-acao" disabled={marcadas.length === 0} onClick={() => { const m = marcadas; setMarcadas([]); responder(m.join(', '), m) }}>
              Pronto
            </button>
          </div>
        )
      case 'problema':
        return (
          <>
            {(ia.notas || anotando) && (
              <div className="fd-notas" aria-live="polite">
                <p>O que já anotamos {anotando && <span className="fd-anotando">anotando…</span>}</p>
                <ul>{ia.notas?.notas.map((n) => <li key={n}>{n}</li>)}</ul>
              </div>
            )}
            <form className="fd-escrever fd-escrever-longo" onSubmit={enviarTexto}>
              <label htmlFor="fd-entrada" className="fd-escondido">{textoDe(p.pergunta, r)}</label>
              <textarea
                id="fd-entrada"
                ref={entradaRef}
                rows={3}
                value={texto}
                onChange={(e) => { setTexto(e.target.value); setErro('') }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviarTexto() }
                }}
                placeholder={p.marcador}
              />
              <button type="submit" aria-label="Enviar" disabled={!texto.trim()}>
                <ArrowUp size={18} />
              </button>
            </form>
          </>
        )
      case 'extra':
        return escrevendoLivre ? (
          campoTexto('Escreva do seu jeito')
        ) : (
          <>
            <div className="fd-chips">
              {ia.pergunta?.opcoes.map((o) => (
                <button key={o} type="button" className="fd-chip" onClick={() => responder(o, o)}>{o}</button>
              ))}
              <button type="button" className="fd-chip fd-chip-livre" onClick={() => setEscrevendoLivre(true)}>
                <Pencil size={14} aria-hidden="true" /> Escrever com as minhas palavras
              </button>
            </div>
            <button type="button" className="fd-pular" onClick={() => responder('Prefiro pular esta', '')}>
              Prefiro pular esta
            </button>
          </>
        )
      case 'mapa':
        return (
          <div className="fd-chips">
            <button type="button" className="fd-chip" onClick={() => responder('Está certo', 'Está certo')}>Está certo</button>
            <button type="button" className="fd-chip fd-chip-livre" onClick={() => setAjustando(true)}>
              <Pencil size={14} aria-hidden="true" /> Quero ajustar algo
            </button>
          </div>
        )
      case 'email':
        return (
          <>
            {campoTexto(p.marcador, 'email', 'email')}
            {p.id === ULTIMA && privacidade}
          </>
        )
      case 'telefone':
        return (
          <>
            {campoTexto(textoDe(p.marcador, r), 'tel', 'tel')}
            {privacidade}
          </>
        )
    }
  }

  let entrada: React.ReactNode = null
  if (!digitando && ajustando) {
    entrada = campoTexto('O que devo mudar ou acrescentar?')
  } else if (!digitando && etapa?.endsWith(CONFIRMAR)) {
    entrada = (
      <div className="fd-chips">
        <button type="button" className="fd-chip" onClick={() => responder('Sim, é esta', true)}>Sim, é esta</button>
        <button type="button" className="fd-chip" onClick={() => responder('Não é esta', false)}>Não é esta</button>
      </div>
    )
  } else if (!digitando && passoAtual) {
    entrada = entradaDe(passoAtual)
  }

  const nomeEmpresa = EMPRESA ? (r[EMPRESA.id] as string | undefined) : undefined
  const pessoas = C.passos.find((p) => p.tipo === 'escala')
  const segmento = EMPRESA?.passoSegmento ? (r[EMPRESA.passoSegmento] as string | undefined) : undefined
  const pessoasTxt = pessoas && r[pessoas.id] ? String(r[pessoas.id]) : undefined
  const cabecaMapa = nomeEmpresa || String(r[C.contato.nome] ?? '') || 'O seu negócio'
  const subMapa = [segmento, pessoasTxt && (/\d/.test(pessoasTxt) ? `${pessoasTxt} pessoas` : pessoasTxt)].filter(Boolean).join(' · ')
  const terminou = itens.some((i) => i.tipo === 'fim')
  const fim = C.fim(r)

  return (
    <div className="fd">
      <header className="fd-topo">
        <div className="fd-topo-linha">
          {C.marca.foto ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={C.marca.foto} alt="" width={36} height={36} className="fd-avatar" />
          ) : (
            <span className="fd-avatar fd-avatar-iniciais" aria-hidden="true">{iniciais(C.marca.nome)}</span>
          )}
          <div className="fd-quem">
            <strong>{C.marca.nome}</strong>
            <span>{C.marca.subtitulo}</span>
          </div>
          <div className="fd-topo-acoes">
            {confirmarReinicio ? (
              <>
                <span>Recomeçar do zero?</span>
                <button type="button" onClick={recomecar}>Sim</button>
                <button type="button" onClick={() => setConfirmarReinicio(false)}>Não</button>
              </>
            ) : (
              <>
                {podeVoltar && !terminou && (
                  <button type="button" onClick={voltar} disabled={ocupado || digitando}>
                    <Undo2 size={15} aria-hidden="true" /> Voltar
                  </button>
                )}
                {feitas > 0 && (
                  <button type="button" onClick={() => setConfirmarReinicio(true)} disabled={ocupado || digitando}>
                    <RotateCcw size={15} aria-hidden="true" /> Recomeçar
                  </button>
                )}
              </>
            )}
          </div>
        </div>
        <div className="fd-progresso" role="progressbar" aria-valuenow={progresso} aria-valuemin={0} aria-valuemax={100} aria-label="Progresso">
          <span className="fd-mono">{progresso}%</span>
          <div className="fd-trilho"><div style={{ width: `${Math.max(progresso, 3)}%` }} /></div>
          <span className="fd-mono">{faltam > 0 ? `faltam ~${faltam}` : 'pronto'}</span>
        </div>
        <button type="button" className="fd-painel-botao" aria-expanded={painelAberto} onClick={() => setPainelAberto((v) => !v)}>
          Resumo do seu caso <span className="fd-mono">{linhas.length} {linhas.length === 1 ? 'linha' : 'linhas'}</span>
          <ChevronDown size={16} aria-hidden="true" className={painelAberto ? 'fd-girado' : undefined} />
        </button>
      </header>

      <div className="fd-corpo">
        <div className="fd-chat" role="log" aria-live="polite" aria-label="Conversa">
          {itens.map((it) => {
            switch (it.tipo) {
              case 'bot':
                return (
                  <Bolha key={it.id} de="bot" rotulo={it.rotulo}>
                    {it.texto}
                    {it.nota && <small>{it.nota}</small>}
                  </Bolha>
                )
              case 'eu':
                return <Bolha key={it.id} de="eu">{it.texto}</Bolha>
              case 'empresa':
                return <CartaoEmpresa key={it.id} empresa={it.empresa} />
              case 'cenario':
                return <CartaoCenario key={it.id} notas={it.notas} ligacao={C.ia.ligacao} />
              case 'escala':
                return <CartaoEscala key={it.id} {...it} />
              case 'mapa':
                return <CartaoMapa key={it.id} mapa={it.mapa} cabeca={cabecaMapa} sub={subMapa} />
              case 'fim':
                return (
                  <div key={it.id} className="fd-cartao fd-fim">
                    <p className="fd-fim-titulo">{fim.titulo}</p>
                    <p>{fim.texto}</p>
                  </div>
                )
            }
          })}
          {digitando && <Digitando />}
          {erro && <p className="fd-erro" role="alert">{erro}</p>}
          <div className="fd-entrada">{entrada}</div>
          <div className="fd-escondido" aria-hidden="true">
            <label htmlFor="fd-site">Site</label>
            <input id="fd-site" tabIndex={-1} autoComplete="off" value={site} onChange={(e) => setSite(e.target.value)} />
          </div>
          <div ref={fimRef} className="fd-ancora" />
        </div>

        <aside className={`fd-painel ${painelAberto ? 'fd-painel-aberto' : ''}`} aria-label="Resumo do seu caso">
          <section>
            <h2>Resumo do seu caso</h2>
            <Resumo linhas={linhas} />
          </section>
          {C.radar && (
            <section>
              <h2>{C.radar.titulo}</h2>
              <p className="fd-painel-vazio">muda a cada resposta</p>
              <Radar eixos={C.radar.eixos.map((e) => e.nome)} valores={radar} />
            </section>
          )}
        </aside>
      </div>
    </div>
  )
}

// As APIs só aceitam texto e listas de texto: tira o que ficou vazio.
function limpas(r: Respostas): Record<string, Valor> {
  return Object.fromEntries(Object.entries(r).filter(([, v]) => v !== undefined)) as Record<string, Valor>
}

function iniciais(nome: string): string {
  return nome.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('')
}
