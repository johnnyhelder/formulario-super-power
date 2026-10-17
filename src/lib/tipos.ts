// Os tipos da configuração (formulario.ts) e do que a conversa guarda.
// Quem adapta o formulário a um negócio mexe só no formulario.ts; aqui fica
// o "contrato" que ele tem de cumprir.

export type Valor = string | string[]

// As respostas, pelo id de cada passo. Guardamos sempre o texto que a pessoa
// viu (o rótulo da opção), para o e-mail e o banco se lerem sem tradução.
export type Respostas = Record<string, Valor | undefined>

// Texto fixo ou montado a partir das respostas (ex. "Prazer, Ana.").
export type Texto = string | ((r: Respostas) => string)

export type Nivel = 'baixo' | 'medio' | 'alto'

type Base = {
  // Identificador único do passo. Vira a chave da resposta no banco e no e-mail.
  id: string
  pergunta: Texto
  // Linha pequena por baixo da pergunta (ex. "Pode marcar mais de um.").
  nota?: Texto
  // Nome da linha no painel "Resumo do seu caso" e no e-mail. Sem isto, a resposta não aparece no painel.
  resumo?: string
  // Pula o passo quando devolve true (ex. o país já veio da pesquisa da empresa).
  pular?: (r: Respostas) => boolean
}

export type Passo = Base &
  (
    | {
        // Uma linha de texto livre.
        tipo: 'texto'
        marcador: string
        minimo?: number
        autoComplete?: string
        // Botões de atalho por baixo do campo (ex. "Ainda não tenho empresa").
        atalhos?: string[]
      }
    | {
        // Escolher uma opção. Com `escrever`, a pessoa também pode escrever a sua.
        tipo: 'escolha'
        opcoes: string[] | ((r: Respostas) => string[])
        escrever?: string
      }
    | {
        // Marcar várias opções e tocar em "Pronto".
        tipo: 'varias'
        opcoes: string[]
      }
    | {
        // O nome da empresa. A IA pesquisa na internet e mostra o cartão "É esta a sua empresa?".
        tipo: 'empresa'
        marcador: string
        // Botão para quem ainda não tem empresa (a resposta fica vazia).
        semEmpresa?: string
        // Id do passo de país e do passo de segmento (do tipo 'escolha').
        // A pesquisa preenche o país e põe no topo os segmentos mais prováveis.
        passoPais?: string
        passoSegmento?: string
      }
    | {
        // O texto principal: o que a pessoa quer resolver. A IA anota enquanto ela escreve
        // e desenha o cartão do cenário quando ela envia.
        tipo: 'problema'
        marcador: string
      }
    | {
        // Tamanho da equipe, com o desenho da empresa em bonequinhos.
        tipo: 'escala'
        opcoes: { rotulo: string; bonecos: number }[]
        // Número grande no cartão (ex. o faturamento já respondido).
        destaque?: (r: Respostas) => string | undefined
      }
    | {
        // Uma pergunta criada pela IA a partir do que a pessoa já contou.
        // Some sozinha se a IA não responder a tempo.
        tipo: 'extra'
      }
    | {
        // O mapa do caso (fluxograma). A pessoa confirma ou pede um ajuste.
        tipo: 'mapa'
      }
    | { tipo: 'email'; marcador: string }
    | { tipo: 'telefone'; marcador: Texto }
  )

export type TipoPasso = Passo['tipo']

export type EixoRadar = {
  nome: string
  // A IA mede este eixo a partir do texto do problema (descreva o que medir).
  ia?: string
  // Ou o código mede pelas respostas (0 a 1). undefined = ainda não dá para saber.
  valor?: (r: Respostas) => number | undefined
}

export type Config = {
  marca: {
    nome: string
    // Frase curta ao lado do nome, no topo.
    subtitulo: string
    // Imagem em public/ (ex. '/avatar.jpg'). Sem foto, aparecem as iniciais.
    foto?: string
    // Cor de ação (botões, balões da pessoa, progresso).
    cor: string
    tema: 'escuro' | 'claro'
  }
  pagina: { titulo: string; descricao: string; indexar: boolean }
  privacidade: { texto: string; link?: string }
  // Os passos, pela ordem. O último tem de ser o de contato.
  passos: Passo[]
  // Que passos são o nome, o e-mail e o telefone de quem responde.
  contato: { nome: string; email: string; telefone?: string }
  fim: (r: Respostas) => { titulo: string; texto: string }
  ia: {
    // Quem você é e o que vende. Vai em todas as chamadas à IA.
    sobre: string
    // Áreas do negócio a que o problema pode pertencer.
    areas: string[]
    // A etiqueta na seta do cartão do cenário (ex. "com IA", "com a nossa ajuda").
    ligacao: string
    // Anotações ao vivo: espera esta pausa na escrita (ms) e pelo menos estas letras novas
    // antes de chamar a IA de novo. Mais alto = mais barato, menos "ao vivo". Padrão 1100 e 12.
    pausaMs?: number
    letrasNovas?: number
  }
  radar?: { titulo: string; eixos: EixoRadar[] }
  aviso: { assunto: (r: Respostas) => string }
}
