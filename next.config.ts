import type { NextConfig } from 'next'

// FD_EXPORTAR=1 (usado pelo `npm run exportar`): página estática para alojamento PHP.
const exportar = process.env.FD_EXPORTAR === '1'

const nextConfig: NextConfig = {
  poweredByHeader: false,
  ...(exportar
    ? { output: 'export', trailingSlash: true, basePath: process.env.NEXT_PUBLIC_FD_CAMINHO || undefined }
    : {}),
}

export default nextConfig
