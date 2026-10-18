import type { Negocio } from '@/lib/tipos'

// O que a IA sabe do SEU negócio, além do ia.sobre do formulario.ts.
// Não precisa de escrever à mão: `npm run conhecer` pesquisa o seu site e o que há de público
// sobre o negócio, faz-lhe as perguntas que faltam e reescreve este arquivo.
//
// Fica fora do formulario.ts de propósito. O formulario.ts vai para o navegador de quem responde;
// este arquivo só é lido no servidor. Mesmo assim, o `interno` nunca é dito à pessoa:
// só entra na ficha do lead, que vai para você.
// Vazio, o formulário funciona como antes.

export const NEGOCIO: Negocio = {
  objetivo: '',
  publico: '',
  interno: '',
}
