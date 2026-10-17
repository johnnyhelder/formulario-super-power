# Quanto custa

Preços de outubro de 2026. Confira sempre a página de preços de cada serviço.

| Peça | Custo | Por quê |
|---|---|---|
| IA (Claude Haiku 5.5) | menos de 1 cêntimo por conversa | US$ 0,10 por milhão de tokens de entrada e US$ 0,50 por milhão de saída. Uma conversa completa faz de 5 a 8 chamadas pequenas. |
| Pesquisa da empresa (Firecrawl) | ~2 créditos por conversa | Uma pesquisa por nome de empresa. O plano grátis dá para testar; para anúncios, veja o plano pago em firecrawl.dev/pricing. |
| Banco (Neon) | grátis | Uma linha por conversa. O plano grátis aguenta dezenas de milhares. |
| E-mail (Resend) | grátis | Até 3 mil e-mails por mês no plano grátis. |
| Hospedagem (Vercel) | grátis ou US$ 20/mês | O Hobby é grátis, mas só para uso não comercial. Para empresa, Pro. |

**Proteções que já vêm ligadas**
- Limite de chamadas à IA por pessoa (30 a cada 10 minutos). Fica em memória, por isso na Vercel cada instância conta à parte.
- Teto diário para o site inteiro, guardado no banco (`IA_TETO_DIARIO`, padrão 1500 chamadas, cerca de 0,50 US$). É o que segura o pior caso da fatura. Sem banco, não existe.
- Campo escondido contra robôs, e conversas concluídas em menos de 25 segundos marcadas como suspeitas (não geram aviso).
- Textos cortados antes de ir para a IA.

Defina também um limite de gasto mensal na conta ou no workspace da Anthropic (platform.claude.com > Settings > Limits). É o travão final.
