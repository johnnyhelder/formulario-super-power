import { test } from 'node:test'
import assert from 'node:assert/strict'
import { FORMULARIO as C } from '../formulario'
import { CONFIRMAR, OK_REGRA, dadosParaIA, dataLegivel, etapasSeguintes, linhasResumo, motivosParaRever, perguntasFuturas, proxima, radarValores, regraPendente } from '../src/lib/fluxo'
import { textosDe } from '../src/lib/textos'
import { linkWhatsapp, mensagemComNome } from '../src/lib/aviso'
import { FORMULARIO as EVENTOS } from '../exemplos/eventos'
import type { EmpresaIA } from '../src/lib/ia'

const achada = (confianca: EmpresaIA['confianca']): EmpresaIA => ({
  encontrada: true, confianca, nome: 'Padaria Sol', descricao: 'Padaria artesanal', cidade: 'Porto',
  pais: 'Portugal', segmentos: ['Loja ou comércio'], site: '', fundada: '',
})

test('começa pelo primeiro passo', () => {
  assert.equal(proxima(C, null, {}, {}), 'nome')
})

test('só pergunta "É esta a sua empresa?" quando a pesquisa achou com confiança', () => {
  assert.equal(proxima(C, 'empresa', { empresa: 'Padaria Sol' }, {}), 'pais')
  assert.equal(proxima(C, 'empresa', { empresa: 'Padaria Sol' }, { empresa: achada('baixo') }), 'pais')
  assert.equal(proxima(C, 'empresa', { empresa: 'Padaria Sol' }, { empresa: achada('medio') }), 'empresa' + CONFIRMAR)
})

test('pula o país quando a empresa confirmada já o trouxe', () => {
  assert.equal(proxima(C, 'empresa' + CONFIRMAR, { empresa: 'Padaria Sol', pais: 'Portugal' }, {}), 'segmento')
})

test('a pergunta extra e o mapa só entram quando a IA os preparou', () => {
  assert.equal(proxima(C, 'ticket', {}, {}), 'solucoes')
  assert.equal(proxima(C, 'ticket', {}, { pergunta: { pergunta: 'Quem responde?', opcoes: ['Eu'], palpite: '' } }), 'extra')
  assert.equal(proxima(C, 'momento', {}, {}), 'email')
})

test('acaba depois do último passo', () => {
  assert.equal(proxima(C, 'whatsapp', {}, {}), null)
})

test('o radar fica sempre entre 0 e 1', () => {
  const v = radarValores(C, { contatos: 'Mais de 200', momento: 'Só curiosidade', canais: ['Instagram'] }, {})
  assert.equal(v.length, C.radar!.eixos.length)
  for (const x of v) assert.ok(x >= 0 && x <= 1)
})

test('o painel mostra o que foi respondido, com a cidade da empresa confirmada', () => {
  const l = linhasResumo(C, { empresa: 'Padaria Sol', segmento: 'Loja ou comércio' }, { empresa: achada('alto'), empresaConfirmada: true })
  assert.deepEqual(l.map(([k]) => k), ['Empresa', 'Onde', 'Segmento'])
})

test('a IA não recebe nome, e-mail nem telefone', () => {
  const d = dadosParaIA(C, { nome: 'Ana', email: 'ana@x.pt', whatsapp: '+351 900', empresa: 'Padaria Sol' }, {})
  assert.ok(d.includes('Padaria Sol'))
  assert.ok(!d.includes('Ana') && !d.includes('ana@x.pt') && !d.includes('+351'))
})

test('depois de corrigir uma resposta antiga, a conversa retoma no que falta', () => {
  const r = { nome: 'Ana', empresa: '', pais: 'Brasil', segmento: 'Outro', problema: 'x', papel: 'Dono ou sócio', pessoas: 'Mais de 200' }
  assert.equal(proxima(C, 'faturamento', r, {}), 'canais')
})

test('a regra de coerência pergunta uma vez e para quando a pessoa confirma', () => {
  const r = { faturamento: 'Até 5 mil €', pessoas: 'Mais de 200' }
  assert.equal(regraPendente(C, r)?.id, 'porte')
  assert.equal(regraPendente(C, { ...r, [OK_REGRA + 'porte']: 'sim' }), undefined)
  assert.equal(regraPendente(C, { ...r, faturamento: '20 a 100 mil €' }), undefined)
  assert.equal(motivosParaRever(C, { ...r, [OK_REGRA + 'porte']: 'sim' }, {}).length, 1)
})

test('pedido sem relação com o negócio chega marcado para rever', () => {
  const notas = { notas: [], area: 'vendas', cenario: '', trava: '', chegar: '', iconeCenario: 'ia', iconeTrava: 'ia', iconeChegar: 'ia', niveis: {}, relacionado: false }
  assert.equal(motivosParaRever(C, {}, { notas }).length, 1)
})

test('datas aparecem por extenso na língua do formulário', () => {
  assert.equal(dataLegivel(C, '2027-06-14'), '14 de junho de 2027')
  assert.equal(dataLegivel(EVENTOS, '2027-06-14'), '14 de junho de 2027')
  assert.equal(dataLegivel(C, 'Ainda não sei'), 'Ainda não sei')
})

test('no exemplo de eventos, a empresa só é perguntada em evento de empresa', () => {
  assert.equal(proxima(EVENTOS, 'evento', { nome: 'Rita', evento: 'Casamento' }, {}), 'data')
  assert.equal(proxima(EVENTOS, 'evento', { nome: 'Rita', evento: 'Evento de empresa' }, {}), 'empresa')
})

test('o que falta conta só o ramo das respostas (num casamento, a pergunta da empresa não entra)', () => {
  const casamento = etapasSeguintes(EVENTOS, 'evento', { nome: 'Rita', evento: 'Casamento' }, {})
  const empresa = etapasSeguintes(EVENTOS, 'evento', { nome: 'Rita', evento: 'Evento de empresa' }, {})
  assert.ok(!casamento.includes('empresa') && empresa.includes('empresa'))
  assert.equal(empresa.length, casamento.length + 1)
})

test('a pergunta extra recebe as perguntas que ainda vêm, sem contato nem passos da IA', () => {
  const f = perguntasFuturas(EVENTOS, 'ideia', { nome: 'Rita', evento: 'Casamento' }, {})
  assert.ok(f.includes('Que investimento tem pensado para a animação?'))
  assert.ok(!f.some((x) => /e-mail|telemóvel|proposta/i.test(x)))
})

test('os textos fixos podem ser trocados no formulario.ts', () => {
  const T = textosDe({ idioma: 'pt-PT', textos: { resumoTitulo: 'Resumo do seu pedido' } })
  assert.equal(T.resumoTitulo, 'Resumo do seu pedido')
  assert.equal(T.telefone, 'Telemóvel')
})

test('a ficha do lead põe o primeiro nome no servidor e monta o link do WhatsApp', () => {
  const m = mensagemComNome('Olá {nome}, vi o seu pedido.', 'Rita Sousa')
  assert.equal(m, 'Olá Rita, vi o seu pedido.')
  assert.equal(linkWhatsapp('+351 912 345 678', m), 'https://wa.me/351912345678?text=Ol%C3%A1%20Rita%2C%20vi%20o%20seu%20pedido.')
  assert.equal(linkWhatsapp('', m), undefined)
})
