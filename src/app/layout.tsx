import type { Metadata, Viewport } from 'next'
import { Archivo, JetBrains_Mono } from 'next/font/google'
import { FORMULARIO as C } from '../../formulario'
import './globals.css'

const texto = Archivo({ subsets: ['latin'], display: 'swap', variable: '--fonte-texto' })
const mono = JetBrains_Mono({ subsets: ['latin'], display: 'swap', variable: '--fonte-mono' })

export const metadata: Metadata = {
  title: C.pagina.titulo,
  description: C.pagina.descricao,
  robots: C.pagina.indexar ? undefined : { index: false, follow: false },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: C.marca.tema === 'claro' ? '#F7F7F5' : '#0A0A0C',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" data-tema={C.marca.tema} className={`${texto.variable} ${mono.variable}`}>
      <body style={{ '--acao': C.marca.cor } as React.CSSProperties}>{children}</body>
    </html>
  )
}
