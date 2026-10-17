'use client'

import { useEffect, useRef, useState } from 'react'
import {
  MessageCircle, ShoppingCart, Megaphone, FileText, CalendarDays, Users, Clock, TrendingUp, Bot,
  Database, Phone, Mail, Receipt, Package, Store, Workflow, Target, TriangleAlert,
  type LucideIcon,
} from 'lucide-react'
import { DESCONHECIDO, type EmpresaIA, type MapaIA, type NotasIA } from '@/lib/ia'
import { TEXTOS } from '@/lib/textos'
import { FORMULARIO } from '../../formulario'

// Os cartões que aparecem no meio da conversa e o painel lateral.
// Tudo desenhado com código a partir das respostas (e do que a IA devolveu).

const ICONES: Record<string, LucideIcon> = {
  conversa: MessageCircle, vendas: ShoppingCart, marketing: Megaphone, documentos: FileText,
  agenda: CalendarDays, equipe: Users, tempo: Clock, crescimento: TrendingUp, ia: Bot, dados: Database,
  telefone: Phone, email: Mail, financeiro: Receipt, estoque: Package, loja: Store, automacao: Workflow,
  alvo: Target, alerta: TriangleAlert,
}

const T = TEXTOS[FORMULARIO.idioma]

function semMovimento(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

// ── A empresa que a pesquisa encontrou ──────────────────────────────────

export function CartaoEmpresa({ empresa }: { empresa: EmpresaIA }) {
  const pais = empresa.pais !== DESCONHECIDO ? empresa.pais : ''
  const onde = [empresa.cidade, pais].filter(Boolean).join(' · ')
  const dominio = empresa.site.replace(/^https?:\/\//, '')
  return (
    <div className="fd-cartao fd-empresa">
      <div className="fd-empresa-topo">
        <span className="fd-empresa-inicial" aria-hidden="true">{empresa.nome.trim().charAt(0).toUpperCase()}</span>
        <div>
          <p className="fd-empresa-nome">{empresa.nome}</p>
          {onde && <p className="fd-cartao-sub">{onde}{empresa.fundada ? ` · ${T.desde(empresa.fundada)}` : ''}</p>}
        </div>
      </div>
      <p className="fd-empresa-desc">{empresa.descricao}</p>
      {empresa.site && (
        <a className="fd-empresa-site" href={empresa.site} target="_blank" rel="noopener noreferrer nofollow">
          {dominio}
        </a>
      )}
      <p className="fd-cartao-sub">{T.empresaFonte}</p>
    </div>
  )
}

// ── O seu cenário ────────────────────────────────────────────────────────

export function CartaoCenario({ notas, ligacao }: { notas: NotasIA; ligacao: string }) {
  const IconeA = ICONES[notas.iconeCenario] ?? Store
  const IconeB = ICONES[notas.iconeTrava] ?? TriangleAlert
  const IconeC = ICONES[notas.iconeChegar] ?? Target
  return (
    <div className="fd-cartao">
      <p className="fd-cartao-rot">{T.cenarioRotulo}</p>
      <div className="fd-cena" aria-hidden="true">
        <span className="fd-no fd-no-a"><IconeA size={26} strokeWidth={1.5} /></span>
        <span className="fd-fio" />
        <span className="fd-no fd-no-b"><IconeB size={30} strokeWidth={1.5} /></span>
        <span className="fd-fio fd-fio-ia"><em>{ligacao}</em></span>
        <span className="fd-no fd-no-c"><IconeC size={26} strokeWidth={1.5} /></span>
      </div>
      <dl className="fd-tres">
        <div><dt className="fd-cor-a">{T.cenario}</dt><dd>{notas.cenario}</dd></div>
        <div><dt className="fd-cor-b">{T.trava}</dt><dd>{notas.trava}</dd></div>
        <div><dt className="fd-cor-c">{T.chegar}</dt><dd>{notas.chegar}</dd></div>
      </dl>
    </div>
  )
}

// ── A empresa em escala real (bonequinhos em pixel) ──────────────────────

type Boneco = { andar: number; x: number; v: number; cor: string }

function PixelEmpresa({ bonecos }: { bonecos: number }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    // Equipas pequenas desenham-se com lupa, para os bonequinhos se verem.
    const zoom = bonecos <= 10 ? 2.4 : bonecos <= 30 ? 1.6 : 1
    const W = 560 / zoom
    const H = 210 / zoom
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = 560 * dpr
    canvas.height = 210 * dpr
    ctx.scale(dpr * zoom, dpr * zoom)
    ctx.imageSmoothingEnabled = false

    // Prédios conforme o tamanho da equipa.
    const predios = bonecos <= 1 ? 1 : bonecos <= 10 ? 1 : bonecos <= 30 ? 1 : bonecos <= 100 ? 2 : 3
    const andares = bonecos <= 1 ? 1 : bonecos <= 10 ? 2 : bonecos <= 30 ? 4 : bonecos <= 100 ? 6 : 8
    const alturaAndar = 18
    const largura = bonecos <= 10 ? 120 : predios === 1 ? 200 : 170
    const vao = 24
    const totalL = predios * largura + (predios - 1) * vao
    const x0 = (W - totalL) / 2
    const chao = H - 14
    const caixas = Array.from({ length: predios }, (_, i) => ({
      x: x0 + i * (largura + vao),
      y: chao - andares * alturaAndar - 8,
      w: largura,
      h: andares * alturaAndar + 8,
    }))

    const cores = ['#B7A6F5', '#F59E0B', '#5EC8B8', '#EDEDF0']
    let semente = bonecos * 9301 + 49297
    const acaso = () => ((semente = (semente * 9301 + 49297) % 233280) / 233280)
    const lista: (Boneco & { predio: number })[] = Array.from({ length: bonecos }, () => {
      const predio = Math.floor(acaso() * predios)
      return {
        predio,
        andar: Math.floor(acaso() * andares),
        x: 8 + acaso() * (largura - 20),
        v: (acaso() - 0.5) * 0.5,
        cor: cores[Math.floor(acaso() * cores.length)],
      }
    })
    const estrelas = Array.from({ length: Math.round(34 / zoom) }, () => ({ x: acaso() * W, y: acaso() * (H * 0.55), f: acaso() * 6 }))

    let quadro = 0
    let pedido = 0
    const desenhar = () => {
      quadro++
      ctx.fillStyle = '#0B0C14'
      ctx.fillRect(0, 0, W, H)
      for (const e of estrelas) {
        const brilho = 0.35 + 0.35 * Math.sin(quadro / 30 + e.f)
        ctx.fillStyle = `rgba(237,237,240,${brilho})`
        ctx.fillRect(Math.round(e.x), Math.round(e.y), 2, 2)
      }
      ctx.fillStyle = '#F3E9C6'
      ctx.fillRect(W - 30, 12, 8, 8)
      ctx.fillStyle = '#1A1C2C'
      ctx.fillRect(0, chao, W, H - chao)
      for (const c of caixas) {
        ctx.fillStyle = '#1E2140'
        ctx.fillRect(c.x, c.y, c.w, c.h)
        ctx.fillStyle = '#2B2F5A'
        for (let a = 0; a < andares; a++) {
          const y = chao - (a + 1) * alturaAndar
          ctx.fillRect(c.x + 4, y + 2, c.w - 8, alturaAndar - 4)
        }
        ctx.fillStyle = '#7B74C9'
        ctx.fillRect(c.x + c.w / 2 - 14, c.y - 6, 28, 6)
      }
      for (const b of lista) {
        const c = caixas[b.predio]
        b.x += b.v
        if (b.x < 6 || b.x > c.w - 12) b.v *= -1
        const px = Math.round(c.x + b.x)
        const py = chao - b.andar * alturaAndar - 13
        ctx.fillStyle = '#EDEDF0'
        ctx.fillRect(px + 1, py, 2, 2)
        ctx.fillStyle = b.cor
        ctx.fillRect(px, py + 3, 4, 5)
        const passo = Math.floor(quadro / 8 + b.x) % 2
        ctx.fillStyle = '#92929C'
        ctx.fillRect(px + (passo ? 0 : 1), py + 8, 1, 2)
        ctx.fillRect(px + (passo ? 3 : 2), py + 8, 1, 2)
      }
      if (!semMovimento()) pedido = requestAnimationFrame(desenhar)
    }
    desenhar()
    return () => cancelAnimationFrame(pedido)
  }, [bonecos])

  return <canvas ref={ref} className="fd-pixel" role="img" aria-label={T.desenhoEmpresa(bonecos)} />
}

export function CartaoEscala({
  titulo, destaque, pessoas, bonecos, sub,
}: { titulo: string; destaque?: string; pessoas: string; bonecos: number; sub?: string }) {
  return (
    <div className="fd-cartao">
      <p className="fd-cartao-rot">{titulo}</p>
      {destaque && <p className="fd-grande">{destaque}</p>}
      <PixelEmpresa bonecos={bonecos} />
      <p className="fd-escala-legenda">
        <strong>{pessoas}</strong> {/\d/.test(pessoas) ? T.pessoas : ''}{sub ? ` · ${sub}` : ''}
      </p>
      <p className="fd-cartao-sub">{T.bonequinho}</p>
    </div>
  )
}

// ── O mapa do caso ───────────────────────────────────────────────────────

export function CartaoMapa({ mapa, cabeca, sub }: { mapa: MapaIA; cabeca: string; sub: string }) {
  return (
    <div className="fd-cartao fd-mapa">
      <p className="fd-cartao-rot">{T.mapaRotulo}</p>
      <div className="fd-mapa-no fd-mapa-raiz">
        <strong>{cabeca}</strong>
        <span>{sub}</span>
      </div>
      <span className="fd-mapa-seta" />
      <div className="fd-mapa-no fd-mapa-problema">
        <strong>{mapa.problema}</strong>
        <span>{T.oProblema}</span>
      </div>
      <span className="fd-mapa-seta" />
      <div className="fd-mapa-causas">
        {mapa.causas.map((c) => (
          <div key={c.texto}>
            <span className="fd-mapa-rotulo">{c.ligacao}</span>
            <div className="fd-mapa-no fd-mapa-causa">
              <strong>{c.texto}</strong>
            </div>
          </div>
        ))}
      </div>
      <span className="fd-mapa-seta" />
      <div className="fd-mapa-no fd-mapa-objetivo">
        <strong>{mapa.objetivo}</strong>
        <span>{T.chegar}</span>
      </div>
      <span className="fd-mapa-seta"><em>{T.comecarPor}</em></span>
      <div className="fd-mapa-no">
        <strong>{mapa.primeiroPasso}</strong>
      </div>
      {mapa.ajustes.length > 0 && (
        <div className="fd-mapa-causas fd-mapa-ajustes">
          {mapa.ajustes.map((a) => (
            <div key={a} className="fd-mapa-no fd-mapa-ajuste">
              <strong>{a}</strong>
              <span>{T.ajustado}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Painel: resumo e leitura do caso ─────────────────────────────────────

export function Resumo({ linhas }: { linhas: [string, string][] }) {
  if (linhas.length === 0) {
    return <p className="fd-painel-vazio">{T.resumoVazio}</p>
  }
  return (
    <dl className="fd-resumo">
      {linhas.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  )
}

export function Radar({ eixos, valores }: { eixos: string[]; valores: number[] }) {
  const [atual, setAtual] = useState(valores)
  const de = useRef(valores)

  // Transição suave entre leituras (a forma "respira" a cada resposta).
  useEffect(() => {
    if (semMovimento()) {
      setAtual(valores)
      de.current = valores
      return
    }
    const inicio = performance.now()
    const origem = de.current
    let pedido = 0
    const passo = (t: number) => {
      const k = Math.min(1, (t - inicio) / 450)
      const e = 1 - Math.pow(1 - k, 3)
      const v = valores.map((alvo, i) => origem[i] + (alvo - origem[i]) * e)
      setAtual(v)
      if (k < 1) pedido = requestAnimationFrame(passo)
      else de.current = valores
    }
    pedido = requestAnimationFrame(passo)
    return () => cancelAnimationFrame(pedido)
  }, [valores])

  const cx = 120
  const cy = 92
  const raio = 62
  const ponto = (i: number, r: number) => {
    const ang = -Math.PI / 2 + (i * 2 * Math.PI) / eixos.length
    return [cx + Math.cos(ang) * r, cy + Math.sin(ang) * r]
  }
  const forma = atual.map((v, i) => ponto(i, raio * (0.12 + 0.88 * v)).join(',')).join(' ')

  return (
    <svg viewBox="-46 -4 332 196" className="fd-radar" role="img" aria-label={T.radarRotulo(eixos.length)}>
      {[0.33, 0.66, 1].map((n) => (
        <polygon
          key={n}
          points={eixos.map((_, i) => ponto(i, raio * n).join(',')).join(' ')}
          className="fd-radar-grade"
        />
      ))}
      {eixos.map((_, i) => {
        const [x, y] = ponto(i, raio)
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} className="fd-radar-grade" />
      })}
      <polygon points={forma} className="fd-radar-forma" />
      {eixos.map((nome, i) => {
        const [x, y] = ponto(i, raio + 16)
        return (
          <text key={nome} x={x} y={y} textAnchor={x < cx - 5 ? 'end' : x > cx + 5 ? 'start' : 'middle'} dominantBaseline="middle" className="fd-radar-txt">
            {nome}
          </text>
        )
      })}
    </svg>
  )
}

export function Digitando() {
  return (
    <div className="fd-bolha fd-bot fd-digitando" aria-label={T.digitando}>
      <span /><span /><span />
    </div>
  )
}

export function Bolha({ de, rotulo, children }: { de: 'bot' | 'eu'; rotulo?: string; children: React.ReactNode }) {
  return (
    <div className={`fd-bolha ${de === 'bot' ? 'fd-bot' : 'fd-eu'}`}>
      {rotulo && <span className="fd-bolha-rot">{rotulo}</span>}
      {children}
    </div>
  )
}
