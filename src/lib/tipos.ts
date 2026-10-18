// Os tipos da configuração (formulario.ts) e do que a conversa guarda.
// Quem adapta o formulário a um negócio mexe só no formulario.ts; aqui fica
// o "contrato" que ele tem de cumprir.

import type { Idioma, Textos } from './textos'

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
  // Também serve para ramos: perguntas só para empresas, só para casamentos, etc.
  pular?: (r: Respostas) => boolean
}

export type Passo = Base &
  (
    | {
        // Uma linha de texto livre.
        tipo: 'texto'
        marcador: Texto
        minimo?: number
        autoComplete?: string
        // Botões de atalho por baixo do campo (ex. "Ainda não tenho empresa").
        atalhos?: string[]
      }
    | {
        // Escolher uma opção. Com `escrever`, a pessoa também pode escrever a sua.
        tipo: 'escolha'
        opcoes: string[] | ((r: Respostas) => string[])
        escrever?: Texto
      }
    | {
        // Marcar várias opções e tocar em "Pronto".
        tipo: 'varias'
        opcoes: string[]
      }
    | {
        // O nome da empresa. A IA pesquisa na internet e mostra o cartão "É esta a sua empresa?".
        tipo: 'empresa'
        marcador: Texto
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
        marcador: Texto
      }
    | {
        // Tamanho da equipe, com o desenho da empresa em bonequinhos.
        tipo: 'escala'
        opcoes: { rotulo: string; bonecos: number }[]
        // Número grande no cartão (ex. o faturamento já respondido).
        destaque?: (r: Respostas) => string | undefined
      }
    | {
        // Uma data, com calendário. Guarda AAAA-MM-DD (ou o texto de `semData`).
        tipo: 'data'
        // Dias a partir de hoje: a data mais cedo e a mais tarde aceites. Padrão 0 e 730.
        minDias?: number
        maxDias?: number
        // Botão para quem ainda não tem data (ex. "Ainda não sei"). true = texto padrão da língua.
        semData?: string | true
        // Endereço que responde se a data está livre: GET <url>?data=AAAA-MM-DD devolve {"livre": true|false}.
        // Tem de aceitar pedidos deste site (CORS). Se falhar, a conversa segue sem dizer nada.
        disponibilidade?: { url: string; livre: Texto; ocupada: Texto }
      }
    | {
        // A IA escolhe do catálogo os itens que encaixam no que a pessoa contou, com o porquê.
        // A pessoa tira ou põe e confirma. Sem IA, vira uma escolha de vários.
        tipo: 'sugestao'
        catalogo: { nome: string; descricao?: string }[]
        // Quantos a IA pode sugerir (padrão 3).
        maximo?: number
      }
    | {
        // Uma frase da IA a resumir o pedido, com "Está certo" e "Corrigir".
        // Sem IA, a frase é montada com as linhas do painel.
        tipo: 'resumo'
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
    | { tipo: 'email'; marcador: Texto }
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

// Quando uma combinação de respostas parece engano (ex. 300 convidados com 200 € de orçamento),
// a conversa pergunta com educação se está certo. "Corrigir" volta à pergunta `corrigir`;
// "Está certo" segue, e o pedido chega marcado para rever à mão.
export type Coerencia = {
  id: string
  quando: (r: Respostas) => boolean
  pergunta: Texto
  // Id do passo a refazer se a pessoa quiser corrigir.
  corrigir: string
  // Rótulo do botão de corrigir (padrão: "Corrigir").
  botao?: string
}

export type Config = {
  // Língua dos textos fixos e da IA. As perguntas escreve-as você, já nesta língua.
  idioma: Idioma
  // Troca textos fixos da conversa (ex. { resumoTitulo: 'Resumo do seu pedido' }). Ver src/lib/textos.ts.
  textos?: Partial<Textos>
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
  coerencia?: Coerencia[]
  aviso: { assunto: (r: Respostas) => string }
}

// O que a IA sabe do negócio além do ia.sobre, no negocio.ts. Gerado por `npm run conhecer`
// (pesquisa pública + entrevista com o dono). Fica fora do formulario.ts de propósito: o
// formulario.ts vai para o navegador, e o `interno` só pode existir no servidor.
export type Negocio = {
  // Para que serve este formulário (ex. "marcar visita com casais que casam nos próximos 18 meses").
  objetivo: string
  // O que a IA pode usar na conversa com quem responde: o que vende, para quem, tom, diferenciais.
  publico: string
  // Só para a ficha do lead, que só o dono vê: quem é bom cliente, quem não é, valores, objeções.
  interno: string
  // De onde e quando veio (ex. "2026-10-18, pesquisa em seusite.com e entrevista").
  origem?: string
}
