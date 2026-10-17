import type { Config } from '@/lib/tipos'

// EXEMPLO: pedidos de orçamento para uma empresa de animação de eventos
// (cabines de fotos, plataforma 360), em português de Portugal.
// Mostra um perfil bem diferente do diagnóstico: sem pesquisa de empresa nem
// bonequinhos, com data, sugestão de serviços do catálogo, resumo e coerência.
// Para usar, copie este arquivo por cima do formulario.ts e ajuste.

const FAIXAS_CONVIDADOS = ['Até 50', '50 a 100', '100 a 200', 'Mais de 200']
const FAIXAS_INVESTIMENTO = ['Até 300 €', '300 a 600 €', '600 a 1200 €', 'Mais de 1200 €', 'Ainda não sei']

export const FORMULARIO: Config = {
  idioma: 'pt-PT',

  marca: {
    nome: 'A Sua Empresa de Eventos',
    subtitulo: 'o seu orçamento em 2 minutos',
    cor: '#C9A86A',
    tema: 'claro',
  },

  pagina: {
    titulo: 'Peça o seu orçamento',
    descricao: 'Conte-nos como imagina o seu evento e receba uma proposta à medida.',
    indexar: false,
  },

  privacidade: {
    texto: 'Usamos estes dados só para lhe enviar a proposta.',
    link: undefined,
  },

  passos: [
    {
      id: 'nome',
      tipo: 'texto',
      pergunta: 'Olá! Vamos preparar o seu orçamento. Como se chama?',
      marcador: 'O seu nome',
      minimo: 2,
      autoComplete: 'given-name',
    },
    {
      id: 'evento',
      tipo: 'escolha',
      pergunta: (r) => `Muito gosto, ${r.nome}. Que momento vamos celebrar?`,
      opcoes: ['Casamento', 'Evento de empresa', 'Aniversário ou batizado', 'Outro'],
      resumo: 'Evento',
    },
    {
      id: 'empresa',
      tipo: 'texto',
      pergunta: 'Qual é o nome da empresa?',
      marcador: 'Nome da empresa',
      autoComplete: 'organization',
      // Ramo: só para eventos de empresa.
      pular: (r) => r.evento !== 'Evento de empresa',
      resumo: 'Empresa',
    },
    {
      id: 'data',
      tipo: 'data',
      pergunta: 'Para quando é?',
      minDias: 1,
      maxDias: 730,
      semData: true,
      // Ligue a sua agenda aqui (GET <url>?data=AAAA-MM-DD devolve {"livre": true|false}).
      // disponibilidade: {
      //   url: 'https://seusite.pt/disponibilidade.php',
      //   livre: 'Boa notícia, essa data ainda está livre.',
      //   ocupada: 'Essa data já está muito procurada, mas vamos ver as opções consigo.',
      // },
      resumo: 'Data',
    },
    {
      id: 'local',
      tipo: 'texto',
      pergunta: 'Onde vai ser? Pode ser a quinta, o restaurante ou só o concelho.',
      marcador: 'Ex. Quinta da Ribeira, Penafiel',
      resumo: 'Local',
    },
    {
      id: 'convidados',
      tipo: 'escolha',
      pergunta: 'Quantos convidados, mais ou menos?',
      opcoes: FAIXAS_CONVIDADOS,
      resumo: 'Convidados',
    },
    {
      id: 'ideia',
      tipo: 'problema',
      pergunta: 'Conte-nos como imagina esse momento.',
      nota: 'O ambiente, o que não pode faltar, o que os convidados vão lembrar.',
      marcador: 'Ex. Queremos algo divertido para a pista de dança, com fotos para levar.',
      resumo: 'Como imagina',
    },
    {
      id: 'servicos',
      tipo: 'sugestao',
      pergunta: 'Pelo que nos contou, estes serviços encaixam. Quer tirar ou pôr algum?',
      catalogo: [
        { nome: 'Cabine de fotos', descricao: 'fotos impressas na hora, com adereços' },
        { nome: 'Plataforma 360', descricao: 'vídeos em câmara lenta a girar à volta dos convidados' },
        { nome: 'Livro de mensagens em áudio', descricao: 'telefone antigo onde os convidados deixam mensagens' },
        { nome: 'Espelho mágico', descricao: 'espelho interativo que tira fotos' },
      ],
      maximo: 3,
      resumo: 'Serviços',
    },
    { id: 'extra', tipo: 'extra', pergunta: '' },
    {
      id: 'investimento',
      tipo: 'escolha',
      pergunta: 'Que investimento tem pensado para a animação?',
      nota: 'Uma faixa basta.',
      opcoes: FAIXAS_INVESTIMENTO,
      resumo: 'Investimento',
    },
    {
      id: 'outros',
      tipo: 'escolha',
      pergunta: 'Já tem outros orçamentos ou somos a primeira escolha?',
      opcoes: ['São a primeira escolha', 'Estou a comparar', 'Ainda estou a ver ideias'],
      resumo: 'Outros orçamentos',
    },
    { id: 'resumo', tipo: 'resumo', pergunta: 'Resumi assim o seu pedido. Está certo?' },
    {
      id: 'email',
      tipo: 'email',
      pergunta: 'Para onde lhe enviamos a proposta?',
      nota: 'O seu melhor e-mail.',
      marcador: 'o.seu@email.pt',
    },
    {
      id: 'telemovel',
      tipo: 'telefone',
      pergunta: 'E o seu telemóvel, para combinarmos os detalhes?',
      marcador: '+351 912 345 678',
    },
  ],

  contato: { nome: 'nome', email: 'email', telefone: 'telemovel' },

  fim: (r) => ({
    titulo: `Obrigado, ${r.nome}. O seu pedido já está connosco.`,
    texto: 'Vamos preparar a proposta com calma e enviamo-la por e-mail. Se for preciso, ligamos-lhe.',
  }),

  ia: {
    sobre:
      'Você ajuda uma empresa de animação de eventos no norte de Portugal (cabines de fotos, plataforma 360, livro de mensagens em áudio, espelho mágico) ' +
      'a perceber o pedido de orçamento de quem está a organizar um casamento, um evento de empresa ou uma festa.',
    areas: ['casamento', 'empresa', 'festa privada'],
    ligacao: 'connosco',
  },

  coerencia: [
    {
      id: 'orcamento',
      quando: (r) => (r.convidados === 'Mais de 200' || r.convidados === '100 a 200') && r.investimento === 'Até 300 €',
      pergunta: (r) =>
        `Só para confirmar, ${String(r.convidados).toLowerCase()} convidados com um investimento até 300 €? Se foi engano na escolha, corrijo já.`,
      corrigir: 'investimento',
      botao: 'Corrigir o investimento',
    },
  ],

  aviso: {
    assunto: (r) => `Pedido de orçamento: ${r.nome}${r.evento ? ` (${r.evento})` : ''}`,
  },
}
