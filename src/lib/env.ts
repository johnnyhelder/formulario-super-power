// As chaves da IA e da pesquisa podem ter o prefixo FORMULARIO_ (ex. FORMULARIO_ANTHROPIC_API_KEY).
// Serve para instalar o formulário num site que já usa a Anthropic para outra coisa: o formulário fica
// com a chave dele (e o gasto à parte), sem mexer na do site. Sem prefixo, usa a normal.
export const PREFIXO = 'FORMULARIO_'

export function chave(nome: 'ANTHROPIC_API_KEY' | 'ANTHROPIC_WORKSPACE_ID' | 'FIRECRAWL_API_KEY'): string {
  return (process.env[PREFIXO + nome] || process.env[nome] || '').trim()
}
