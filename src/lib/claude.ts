import type { z } from 'zod'
import { FORMULARIO as C } from '../../formulario'
import { MODELO, esquemasJSON, esquemasZod } from './ia'
import { sistema } from './prompts'
import { chave } from './env'
import { contarChamadaIA } from './banco'

// Uma chamada ao Claude Haiku com saída estruturada (JSON Schema): a resposta é sempre um objeto com
// campos fechados, conferido de novo com zod. Usada pela rota da IA e pela ficha do lead.
// Conta para o teto diário (IA_TETO_DIARIO), que só existe com banco.

const JSONS = esquemasJSON(C)
const ZODS = esquemasZod(C)
const SISTEMA = sistema(C)
const TETO_DIARIO = Number(process.env.IA_TETO_DIARIO) || 1500

export type TipoIA = keyof typeof JSONS
type Saida<K extends TipoIA> = z.infer<(typeof ZODS)[K]>

export async function perguntarClaude<K extends TipoIA>(
  tipo: K,
  texto: string,
  maxTokens = 700,
): Promise<{ ok: true; dados: Saida<K> } | { ok: false; estado: number }> {
  const k = chave('ANTHROPIC_API_KEY')
  if (!k) return { ok: false, estado: 503 }
  const hoje = await contarChamadaIA()
  if (hoje !== null && hoje > TETO_DIARIO) {
    console.error('[ia] teto diário atingido', hoje)
    return { ok: false, estado: 429 }
  }
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': k,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
      // Chaves que não estão presas a um workspace precisam de o indicar.
      ...(chave('ANTHROPIC_WORKSPACE_ID') ? { 'anthropic-workspace-id': chave('ANTHROPIC_WORKSPACE_ID') } : {}),
    },
    body: JSON.stringify({
      model: MODELO,
      max_tokens: maxTokens,
      thinking: { type: 'disabled' },
      output_config: { effort: 'low', format: { type: 'json_schema', schema: JSONS[tipo] } },
      system: SISTEMA,
      messages: [{ role: 'user', content: texto }],
    }),
    signal: AbortSignal.timeout(12_000),
  })
  if (!res.ok) {
    console.error('[ia]', tipo, res.status, (await res.text()).slice(0, 300))
    return { ok: false, estado: 502 }
  }
  const corpo = await res.json()
  const bloco = (corpo.content as { type: string; text?: string }[]).find((b) => b.type === 'text')
  const valido = ZODS[tipo].safeParse(JSON.parse(bloco?.text ?? 'null'))
  if (!valido.success) {
    console.error('[ia] saída fora do esquema', tipo, valido.error.message.slice(0, 300))
    return { ok: false, estado: 502 }
  }
  return { ok: true, dados: valido.data as Saida<K> }
}
