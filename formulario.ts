import type { Config, Respostas } from '@/lib/tipos'

// ═══════════════════════════════════════════════════════════════════════
//  O ÚNICO ARQUIVO QUE VOCÊ PRECISA EDITAR
//  Perguntas, opções, textos, cores e o que a IA sabe do seu negócio.
//  Depois de mudar, rode `npm test` (confere se está tudo coerente).
// ═══════════════════════════════════════════════════════════════════════
//
// Este exemplo é um diagnóstico para uma agência que implanta IA em
// pequenas e médias empresas de Portugal e do Brasil. Troque pelo seu caso.
// Outro exemplo, bem diferente (eventos, em PT-PT): exemplos/eventos.ts.
// Para partir dele, copie-o por cima deste arquivo.
// Tipos de passo: texto, escolha, varias, empresa, problema, escala, data,
// sugestao, extra, resumo, mapa, email, telefone. Veja cada um em src/lib/tipos.ts.

// Uma mão para escrever "a Padaria Sol" ou "o seu negócio".
const empresa = (r: Respostas, com: string, sem: string) => (r.empresa ? `${com} ${r.empresa}` : sem)

const EUR = (r: Respostas) => r.pais !== 'Brasil'

export const FORMULARIO: Config = {
  // pt-BR, pt-PT, es ou en. Muda os textos fixos e a língua da IA; as perguntas abaixo escreve-as você.
  idioma: 'pt-BR',

  marca: {
    nome: 'Sua Marca',
    subtitulo: 'vamos achar o melhor caminho para você',
    foto: undefined, // ex. '/avatar.jpg' (coloque a imagem na pasta public/)
    cor: '#F59E0B',
    tema: 'escuro',
  },

  pagina: {
    titulo: 'Diagnóstico de IA para o seu negócio',
    descricao: 'Responda algumas perguntas rápidas e descubra onde a IA pode ajudar o seu negócio.',
    // Página de anúncio costuma ficar fora do Google. Mude para true se quiser indexar.
    indexar: false,
  },

  privacidade: {
    texto: 'Uso estes dados só para falar com você sobre o diagnóstico.',
    link: undefined, // ex. 'https://seusite.com/privacidade'
  },

  passos: [
    {
      id: 'nome',
      tipo: 'texto',
      pergunta: 'Oi! Para indicar o melhor caminho para o seu negócio, vou fazer algumas perguntas rápidas. Como você prefere ser chamado(a)?',
      marcador: 'Seu nome',
      minimo: 2,
      autoComplete: 'given-name',
    },
    {
      id: 'empresa',
      tipo: 'empresa',
      pergunta: (r) => `Prazer, ${r.nome}. Qual é o nome da sua empresa?`,
      marcador: 'Nome da empresa',
      semEmpresa: 'Ainda não tenho empresa',
      passoPais: 'pais',
      passoSegmento: 'segmento',
      resumo: 'Empresa',
    },
    {
      id: 'pais',
      tipo: 'escolha',
      pergunta: (r) => (r.empresa ? `E onde fica a ${r.empresa}?` : 'Sem problema. E onde você está?'),
      opcoes: ['Portugal', 'Brasil', 'Outro país'],
      // A pesquisa da empresa já pode ter respondido.
      pular: (r) => Boolean(r.pais),
      resumo: 'País',
    },
    {
      id: 'segmento',
      tipo: 'escolha',
      pergunta: (r) => (r.empresa ? `Em qual segmento a ${r.empresa} atua?` : 'Em qual segmento você quer atuar?'),
      opcoes: [
        'Restaurante, café ou bar', 'Eventos e casamentos', 'Saúde, estética e bem-estar', 'Imobiliário',
        'Loja ou comércio', 'E-commerce', 'Serviços profissionais', 'Construção', 'Indústria', 'Tecnologia',
        'Educação', 'Turismo e hotelaria', 'Logística e transporte', 'Outro',
      ],
      escrever: 'Escreva, ex. oficina, clínica, loja de peças',
      resumo: 'Segmento',
    },
    {
      id: 'problema',
      tipo: 'problema',
      pergunta: (r) => `O que você gostaria de resolver ${empresa(r, 'na', 'no seu negócio')} com IA?`,
      nota: 'Escreva com as suas palavras. Pode ser mais de uma coisa.',
      marcador: 'Ex. Perco clientes porque demoro a responder no WhatsApp.',
      resumo: 'O que quer resolver',
    },
    {
      id: 'papel',
      tipo: 'escolha',
      pergunta: (r) => (r.empresa ? `E qual é o seu papel na ${r.empresa}?` : 'E qual é o seu papel hoje?'),
      opcoes: ['Dono ou sócio', 'Diretor ou gestor', 'Trabalho lá', 'Estou pesquisando'],
      resumo: 'Papel',
    },
    {
      id: 'faturamento',
      tipo: 'escolha',
      pergunta: (r) => `Qual é o faturamento mensal ${empresa(r, 'da', 'do negócio')}?`,
      nota: 'Uma faixa basta. Fica só entre nós.',
      opcoes: (r) =>
        EUR(r)
          ? ['Até 5 mil €', '5 a 20 mil €', '20 a 100 mil €', 'Mais de 100 mil €', 'Prefiro não dizer']
          : ['Até R$ 20 mil', 'R$ 20 a 100 mil', 'R$ 100 a 500 mil', 'Mais de R$ 500 mil', 'Prefiro não dizer'],
      resumo: 'Faturamento/mês',
    },
    {
      id: 'pessoas',
      tipo: 'escala',
      pergunta: (r) => (r.empresa ? `Quantas pessoas trabalham na ${r.empresa}?` : 'Quantas pessoas trabalham com você?'),
      opcoes: [
        { rotulo: 'Só eu', bonecos: 1 },
        { rotulo: '2 a 10', bonecos: 7 },
        { rotulo: '11 a 50', bonecos: 28 },
        { rotulo: '51 a 200', bonecos: 90 },
        { rotulo: 'Mais de 200', bonecos: 220 },
      ],
      destaque: (r) => (r.faturamento && r.faturamento !== 'Prefiro não dizer' ? `${r.faturamento} por mês` : undefined),
      resumo: 'Pessoas',
    },
    {
      id: 'canais',
      tipo: 'varias',
      pergunta: 'De onde vêm os seus clientes hoje?',
      nota: 'Pode marcar mais de um.',
      opcoes: ['Instagram', 'Google', 'Indicação', 'WhatsApp', 'Loja ou balcão', 'Outro'],
      resumo: 'Clientes vêm de',
    },
    {
      id: 'contatos',
      tipo: 'escolha',
      pergunta: 'E quantos contatos ou pedidos chegam por semana, mais ou menos?',
      opcoes: ['Até 10', '10 a 50', '50 a 200', 'Mais de 200'],
      resumo: 'Contatos/semana',
    },
    {
      id: 'ticket',
      tipo: 'escolha',
      pergunta: 'Quanto vale, em média, uma venda sua?',
      opcoes: (r) =>
        EUR(r)
          ? ['Até 50 €', '50 a 500 €', '500 a 5 mil €', 'Mais de 5 mil €']
          : ['Até R$ 200', 'R$ 200 a 2 mil', 'R$ 2 mil a 20 mil', 'Mais de R$ 20 mil'],
      resumo: 'Venda média',
    },
    { id: 'extra', tipo: 'extra', pergunta: '' },
    {
      id: 'solucoes',
      tipo: 'sugestao',
      pergunta: 'Pelo que você contou, estas soluções encaixam. Quer tirar ou pôr alguma?',
      nota: 'Pode marcar mais de uma.',
      catalogo: [
        { nome: 'Atendimento automático no WhatsApp', descricao: 'responde, qualifica e agenda a qualquer hora' },
        { nome: 'Orçamentos automáticos', descricao: 'propostas e orçamentos montados em minutos' },
        { nome: 'Assistente com os dados da empresa', descricao: 'a equipe pergunta e ele responde com os documentos internos' },
        { nome: 'Conteúdo e marketing com IA', descricao: 'posts, anúncios e e-mails' },
        { nome: 'Relatórios automáticos', descricao: 'números do negócio reunidos sem planilha manual' },
        { nome: 'Formação da equipe em IA' },
      ],
      resumo: 'Soluções',
    },
    {
      id: 'momento',
      tipo: 'escolha',
      pergunta: 'Última sobre o projeto. Em que momento você está?',
      opcoes: ['Quero começar este mês', 'Nos próximos 3 meses', 'Comparando orçamentos', 'Só curiosidade'],
      resumo: 'Momento',
    },
    { id: 'mapa', tipo: 'mapa', pergunta: 'Montei o mapa do seu caso. Ficou certo?' },
    {
      id: 'email',
      tipo: 'email',
      pergunta: 'Para onde envio o resumo do seu caso?',
      nota: 'O seu melhor e-mail.',
      marcador: 'seu@email.com',
    },
    {
      id: 'whatsapp',
      tipo: 'telefone',
      pergunta: 'E o seu WhatsApp, para eu falar com você?',
      marcador: (r) => (r.pais === 'Brasil' ? '+55 11 91234 5678' : '+351 912 345 678'),
    },
  ],

  contato: { nome: 'nome', email: 'email', telefone: 'whatsapp' },

  fim: (r) => ({
    titulo: `${r.nome}, o caso ${r.empresa ? `da ${r.empresa}` : 'do seu negócio'} já está comigo.`,
    texto: 'Vou estudar com calma o que você contou e falo com você pelo WhatsApp com o próximo passo.',
  }),

  ia: {
    sobre:
      'Você ajuda numa conversa de diagnóstico de IA para pequenas e médias empresas de Portugal e do Brasil. ' +
      'Quem responde quer saber onde a IA pode ajudar o negócio dele a vender mais e se organizar.',
    areas: ['vendas', 'atendimento', 'marketing', 'operação', 'financeiro', 'organização'],
    ligacao: 'com IA',
    pausaMs: 1100,
    letrasNovas: 12,
  },

  // O desenho em teia no painel. Cada eixo vai de 0 a 1 e muda a cada resposta.
  radar: {
    titulo: 'Como leio o seu caso',
    eixos: [
      { nome: 'volume', valor: (r) => faixa(r.contatos, ['Até 10', '10 a 50', '50 a 200', 'Mais de 200']) },
      { nome: 'repetição', ia: 'quanto do problema é trabalho repetitivo' },
      { nome: 'urgência', valor: (r) => ({ 'Quero começar este mês': 0.95, 'Nos próximos 3 meses': 0.65, 'Comparando orçamentos': 0.4, 'Só curiosidade': 0.15 } as Record<string, number>)[String(r.momento)] },
      { nome: 'depende de pessoas', ia: 'quanto o problema depende de pessoas específicas' },
      { nome: 'informação solta', valor: (r) => (Array.isArray(r.canais) ? Math.min(1, r.canais.length / 4) : undefined) },
    ],
  },

  // Combinações que parecem engano. A conversa pergunta com educação e deixa corrigir.
  coerencia: [
    {
      id: 'porte',
      quando: (r) => r.pessoas === 'Mais de 200' && (r.faturamento === 'Até 5 mil €' || r.faturamento === 'Até R$ 20 mil'),
      pergunta: (r) => `Só para confirmar, são mais de 200 pessoas e faturamento ${String(r.faturamento).toLowerCase()} por mês? Se foi engano na escolha, corrijo agora.`,
      corrigir: 'faturamento',
      botao: 'Corrigir o faturamento',
    },
  ],

  aviso: {
    assunto: (r) => `Novo lead qualificado: ${r.nome}${r.empresa ? ` - ${r.empresa}` : ''}`,
  },
}

// Posição de uma resposta numa lista de faixas, de 0.25 a 1.
function faixa(valor: unknown, faixas: string[]): number | undefined {
  const i = faixas.indexOf(String(valor))
  return i < 0 ? undefined : (i + 1) / faixas.length
}
