import type { Prisma } from '@/generated/prisma/client'

/**
 * OS MOLDES QUE TODA EMPRESA NOVA RECEBE.
 *
 * =============================================================================
 * POR QUE ELES SAÍRAM DA SEMEADURA
 * =============================================================================
 * Eles nasceram dentro de `prisma/seed.ts`, no bloco `--demo`. Parecia o lugar
 * certo e não era, e o defeito só aparece no dia em que importa: `--demo` cria
 * a EMPRESA DE DEMONSTRAÇÃO. Uma franquia de verdade nasce em
 * `/painel/empresas`, e não passava por ali — então ela começava sem molde
 * nenhum, e o contrato saía com o texto genérico de emergência que o gerador
 * usa quando não há nada cadastrado.
 *
 * Quem descobriria isso seria o primeiro cliente grande a pedir "manda o
 * contrato assinado antes de liberar a nota".
 *
 * Agora os moldes são do PRODUTO, não da demonstração: `garantirMoldesPadrao`
 * é chamada quando a empresa é criada e também pela semeadura, e é idempotente
 * — procura pelo nome e só cria o que falta. Rodar de novo não duplica nem
 * sobrescreve o que alguém editou à mão.
 *
 * =============================================================================
 * DE ONDE VEIO O TEXTO, E POR QUE NÃO FOI COPIADO DE LUGAR NENHUM
 * =============================================================================
 * O pedido do dono foi "busque e crie os modelos pra mim baseado na internet".
 * O que ele quer é ter um texto pronto e sério no dia em que o setor de compras
 * de um hospital pedir o contrato.
 *
 * Modelo genérico de internet traz três problemas que aparecem tarde: fala de
 * "produto" onde aqui há SERVIÇO em coisa alheia; ignora que o bem fica na
 * posse da assistência por semanas; e cita artigo errado ou revogado — e quem
 * descobre isso é o advogado do cliente.
 *
 * Cada cláusula foi escrita para ESTA operação e está amarrada ao dispositivo
 * que de fato a rege:
 *
 *   garantia de 90 dias ........ CDC, art. 26, II
 *   orçamento prévio ........... CDC, art. 40
 *   multa e juros de mora ...... CDC, art. 52 §1º / CC, art. 406
 *   suspensão de prazo ......... CC, art. 393 (caso fortuito e força maior)
 *   aparelho não retirado ...... CC, art. 1.275, III (abandono)
 *   foro do consumidor ......... CDC, art. 101, I
 *   dados pessoais ............. Lei 13.709/2018 (LGPD)
 *
 * A promissória segue a forma do Decreto 57.663/1966 (Lei Uniforme de Genebra):
 * o que a torna título é a promessa pura, o valor por extenso e a assinatura do
 * emitente. Por isso tudo o que explica a dívida — número da O.S., equipamento,
 * série — fica ABAIXO de uma linha tracejada, fora do corpo do título. Amarrar
 * a promessa à causa descaracterizaria o título autônomo.
 *
 * =============================================================================
 * ELES NÃO SÃO CONSELHO JURÍDICO
 * =============================================================================
 * São moldes EDITÁVEIS em "Modelos de documento", e é assim que devem ser
 * tratados: um ponto de partida sólido, para o advogado da casa revisar antes
 * do primeiro uso com cliente grande. O sistema não sabe do contrato social nem
 * do regime tributário da empresa.
 *
 * O CNPJ sai de `{{empresa_cnpj}}`. Enquanto ele estiver vazio no cadastro, o
 * contrato imprime a lacuna — e é melhor assim: lacuna se vê e se preenche;
 * número inventado passa despercebido até o cartório.
 *
 * Toda `{{variavel}}` daqui é conferida contra `lib/variaveis-documento` pelo
 * teste deste módulo. Nome inventado quebraria a criação da empresa, e não o
 * PDF meses depois.
 */

export const CORPO_ORDEM_SERVICO = `ORDEM DE SERVIÇO Nº {{os_numero}}

Aberta em {{os_abertura}} · Etapa atual: {{os_etapa}}

1. AS PARTES

PRESTADORA: {{empresa_razao}}, inscrita no CNPJ sob o nº {{empresa_cnpj}}, com
endereço em {{empresa_endereco}}, telefone {{empresa_telefone}}.

CONTRATANTE: {{cliente_nome}}, inscrita no CPF/CNPJ sob o nº {{cliente_documento}},
com endereço em {{cliente_endereco}}. Contato: {{cliente_contato}} — {{cliente_telefone}}.

2. O EQUIPAMENTO RECEBIDO

Marca {{equipamento_marca}} · Modelo {{equipamento_modelo}} · Série {{equipamento_serie}}
Acessórios recebidos junto: {{equipamento_acessorios}}

O equipamento foi recebido nas condições registradas nas fotos de entrada desta
O.S. A lista de acessórios acima é a que foi conferida na retirada, e é por ela
que a devolução será conferida.

3. O QUE O CLIENTE RELATOU

{{os_defeito}}

4. O QUE O TÉCNICO ENCONTROU

{{os_diagnostico}}

Responsável técnico: {{os_tecnico}}

5. PRAZO

Prazo previsto para conclusão: {{os_prazo}}.

O prazo corre a partir da aprovação do orçamento pelo CONTRATANTE, e fica
suspenso enquanto o serviço depender de peça em falta no mercado ou de
resposta do CONTRATANTE. Qualquer mudança de prazo é comunicada pelo mesmo
canal em que esta O.S. foi enviada.

6. VALOR E PAGAMENTO

Valor total dos serviços: {{valor_total}} ({{valor_extenso}}).
Saldo em aberto nesta data: {{valor_aberto}}.
Forma de pagamento: {{forma_pagamento}}.

Serviço não aprovado pelo CONTRATANTE tem devolução do aparelho no estado em
que entrou, sem cobrança de mão de obra, ressalvado o custo de avaliação
quando tiver sido combinado por escrito na abertura desta O.S.

7. GARANTIA

O serviço executado e as peças aplicadas têm garantia de 90 (noventa) dias,
contados da data de entrega, conforme o art. 26 do Código de Defesa do
Consumidor. A garantia cobre o que foi consertado e descrito nesta O.S. —
não cobre defeito novo, mau uso, queda, oscilação da rede elétrica, violação
do lacre nem intervenção de terceiros.

8. RETIRADA DO EQUIPAMENTO

O equipamento fica à disposição para retirada a partir do aviso de conclusão.
Passados 90 (noventa) dias do aviso sem retirada, incide diária de armazenagem,
e o aparelho poderá ser destinado na forma do art. 1.275 do Código Civil, sempre
mediante notificação prévia do CONTRATANTE.

9. FORO

Fica eleito o foro de {{cidade_foro}} para dirimir as questões oriundas deste
documento.

{{cidade_foro}}, {{hoje_extenso}}.


_______________________________        _______________________________
{{empresa_nome}}                       {{cliente_nome}}
Prestadora                             Contratante
`

  /**
   * ===========================================================================
   * OS DOIS MOLDES QUE FALTAVAM — contrato de prestação e nota promissória
   * ===========================================================================
   * O pedido do dono: *"busque e crie os modelos pra mim baseado na internet"*.
   *
   * O que ele quer é ter, no dia em que o setor de compras de um hospital pedir
   * "manda o contrato", um texto pronto e sério — em vez do texto genérico de
   * emergência que o sistema usava quando não há molde cadastrado.
   *
   * ---------------------------------------------------------------------------
   * DE ONDE VEIO O TEXTO, E POR QUE NÃO FOI COPIADO DE LUGAR NENHUM
   * ---------------------------------------------------------------------------
   * Não é um modelo baixado. Modelo genérico de internet traz três problemas
   * que aparecem tarde: fala de "produto" onde aqui há SERVIÇO em coisa alheia,
   * ignora que o bem fica na posse da assistência por semanas, e cita artigo
   * errado ou revogado — e quem descobre isso é o advogado do cliente.
   *
   * Cada cláusula aqui foi escrita para ESTA operação e está amarrada ao
   * dispositivo que de fato a rege:
   *
   *   garantia de 90 dias ........ CDC, art. 26, II
   *   orçamento prévio ........... CDC, art. 40
   *   multa e juros de mora ...... CDC, art. 52 §1º / CC, art. 406
   *   suspensão de prazo ......... CC, art. 393 (caso fortuito e força maior)
   *   aparelho não retirado ...... CC, art. 1.275, III (abandono)
   *   foro do consumidor ......... CDC, art. 101, I
   *   dados pessoais ............. Lei 13.709/2018 (LGPD)
   *
   * A promissória segue a forma do Decreto 57.663/1966 (Lei Uniforme de
   * Genebra): o que a torna título é a promessa pura, o valor por extenso e a
   * assinatura do emitente. Por isso tudo o que explica a dívida — número da
   * O.S., equipamento, série — fica ABAIXO de uma linha tracejada, fora do
   * corpo do título. Amarrar a promessa à causa a descaracterizaria como título
   * autônomo.
   *
   * ---------------------------------------------------------------------------
   * ELES NÃO SÃO CONSELHO JURÍDICO
   * ---------------------------------------------------------------------------
   * São moldes editáveis em "Modelos de documento", e é assim que devem ser
   * tratados: um ponto de partida sólido, para o advogado da casa revisar antes
   * do primeiro uso com cliente grande. O sistema não sabe do contrato social
   * nem do regime tributário da empresa.
   *
   * O CNPJ sai de `{{empresa_cnpj}}`, que hoje está VAZIO no cadastro. Enquanto
   * estiver, o contrato imprime a lacuna — e é melhor assim: lacuna se vê e se
   * preenche; número inventado passa despercebido até o cartório.
   */
export const CORPO_CONTRATO_PRESTACAO = `CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE MANUTENÇÃO
DE EQUIPAMENTO MÉDICO-HOSPITALAR, ODONTOLÓGICO E ESTÉTICO

Instrumento particular vinculado à Ordem de Serviço nº {{os_numero}}


AS PARTES

CONTRATADA
{{empresa_razao}}, inscrita no CNPJ sob o nº {{empresa_cnpj}}, com sede em
{{empresa_endereco}}, telefone {{empresa_telefone}}, doravante denominada
CONTRATADA.

CONTRATANTE
{{cliente_nome}}, inscrito(a) no CPF/CNPJ sob o nº {{cliente_documento}}, com
endereço em {{cliente_endereco}}, telefone {{cliente_telefone}}, neste ato
representado(a) por {{cliente_contato}}, doravante denominado(a) CONTRATANTE.

As partes acima qualificadas têm entre si justo e contratado o presente
instrumento, que se regerá pelas cláusulas seguintes.


CLÁUSULA 1ª — DO OBJETO

1.1. O objeto deste contrato é a prestação de serviços de manutenção corretiva
no equipamento abaixo identificado, de propriedade do CONTRATANTE:

     Marca e modelo .... {{equipamento_marca}} {{equipamento_modelo}}
     Número de série ... {{equipamento_serie}}
     Acessórios ........ {{equipamento_acessorios}}

1.2. O defeito relatado pelo CONTRATANTE no ato da abertura da Ordem de Serviço
nº {{os_numero}}, em {{os_abertura}}, foi:

     {{os_defeito}}

1.3. Após a avaliação técnica, a CONTRATADA constatou:

     {{os_diagnostico}}

1.4. Os serviços compreendem exclusivamente o que consta no orçamento aprovado
pelo CONTRATANTE. Serviço não previsto no orçamento, ainda que constatado
durante a execução, depende de aprovação expressa e de novo orçamento, nos
termos do art. 40 do Código de Defesa do Consumidor.


CLÁUSULA 2ª — DO PREÇO E DA FORMA DE PAGAMENTO

2.1. Pelos serviços descritos na Cláusula 1ª, o CONTRATANTE pagará à CONTRATADA
o valor de {{valor_total}} ({{valor_extenso}}).

2.2. O pagamento será efetuado por {{forma_pagamento}}.

2.3. O valor acima é o do orçamento aprovado e não comporta acréscimo unilateral
pela CONTRATADA. Peça ou serviço identificado como necessário no curso da
execução será objeto de orçamento complementar, submetido à aprovação do
CONTRATANTE antes de qualquer execução.

2.4. Sobre o valor em atraso incidirão multa de 2% (dois por cento) e juros de
mora de 1% (um por cento) ao mês, na forma dos arts. 52, § 1º, do Código de
Defesa do Consumidor e 406 do Código Civil.


CLÁUSULA 3ª — DO PRAZO DE EXECUÇÃO

3.1. A CONTRATADA executará os serviços até {{os_prazo}}, contado da aprovação
do orçamento pelo CONTRATANTE.

3.2. O prazo fica suspenso enquanto perdurar: (a) a espera de peça de reposição
de fabricante ou importador, comprovadamente solicitada; (b) a ausência de
resposta do CONTRATANTE a orçamento complementar; ou (c) caso fortuito ou força
maior, nos termos do art. 393 do Código Civil.

3.3. A suspensão e o seu motivo serão comunicados ao CONTRATANTE e registrados
no prontuário eletrônico da Ordem de Serviço.


CLÁUSULA 4ª — DA GARANTIA

4.1. A CONTRATADA garante os serviços executados e as peças por ela fornecidas
pelo prazo de 90 (noventa) dias, contado da data de entrega do equipamento ao
CONTRATANTE, na forma do art. 26, inciso II, do Código de Defesa do Consumidor.

4.2. A garantia abrange exclusivamente o serviço executado e a peça substituída,
descritos no orçamento aprovado. Não se estende a outros componentes do
equipamento nem a defeitos de natureza diversa.

4.3. A garantia NÃO cobre:
     a) mau uso, uso em desacordo com o manual do fabricante ou operação por
        pessoa não habilitada;
     b) dano decorrente de oscilação, surto ou ausência de aterramento na rede
        elétrica do CONTRATANTE;
     c) queda, impacto, contato com líquido ou agente químico não previsto;
     d) violação do equipamento, remoção de lacre ou intervenção de terceiro
        não autorizado pela CONTRATADA;
     e) desgaste natural de componente consumível.

4.4. A ocorrência de qualquer hipótese do item 4.3 será demonstrada por laudo
técnico fundamentado, com registro fotográfico, entregue ao CONTRATANTE.


CLÁUSULA 5ª — DAS OBRIGAÇÕES DA CONTRATADA

5.1. Executar os serviços com zelo técnico, empregando peças novas e adequadas
ao equipamento, salvo autorização expressa do CONTRATANTE em sentido diverso.

5.2. Manter o CONTRATANTE informado do andamento, disponibilizando consulta ao
prontuário eletrônico da ordem, com data e autor de cada registro.

5.3. Guardar sigilo sobre dados que venha a conhecer em razão do serviço,
inclusive os contidos na memória do equipamento, observada a Lei nº 13.709/2018
(Lei Geral de Proteção de Dados Pessoais).

5.4. Devolver ao CONTRATANTE, quando solicitado no ato da aprovação, as peças
substituídas, ressalvadas as que devam ter destinação específica por norma
sanitária ou ambiental.

5.5. Responder pela guarda do equipamento enquanto ele estiver sob sua posse.


CLÁUSULA 6ª — DAS OBRIGAÇÕES DO CONTRATANTE

6.1. Prestar informações verdadeiras sobre o defeito, o uso e as intervenções
anteriores no equipamento.

6.2. Retirar todo material, insumo ou dado pessoal do equipamento antes da
entrega à CONTRATADA, ou autorizar expressamente a sua manipulação.

6.3. Efetuar o pagamento na forma e no prazo pactuados.

6.4. Retirar o equipamento no prazo da Cláusula 7ª.


CLÁUSULA 7ª — DO EQUIPAMENTO NÃO RETIRADO

7.1. Concluído o serviço e comunicado o CONTRATANTE, o equipamento deverá ser
retirado em até 90 (noventa) dias.

7.2. Decorrido esse prazo sem retirada e sem manifestação do CONTRATANTE, o
equipamento será considerado abandonado, nos termos do art. 1.275, inciso III,
do Código Civil, ficando a CONTRATADA autorizada a dar-lhe destinação, sem
prejuízo da cobrança dos valores devidos.

7.3. A comunicação de que trata o item 7.1 será feita por escrito, pelos meios
de contato informados neste instrumento, e ficará registrada no prontuário
eletrônico da ordem.


CLÁUSULA 8ª — DA RESCISÃO

8.1. Este contrato poderá ser rescindido por qualquer das partes, mediante
comunicação escrita, nas seguintes hipóteses:
     a) descumprimento de obrigação por qualquer das partes, não sanado em 10
        (dez) dias contados da notificação;
     b) constatação técnica de inviabilidade do reparo;
     c) recusa do CONTRATANTE a orçamento complementar indispensável.

8.2. Rescindido o contrato, serão devidos à CONTRATADA os serviços comprovada e
efetivamente executados até a data da rescisão.


CLÁUSULA 9ª — DA PROTEÇÃO DE DADOS

9.1. As partes tratarão os dados pessoais a que tiverem acesso em razão deste
contrato na estrita medida da sua execução, observada a Lei nº 13.709/2018.

9.2. A CONTRATADA mantém registro eletrônico das etapas da ordem, com autor e
data, cuja finalidade é a prova da prestação do serviço e o atendimento a
exigências de rastreabilidade sanitária.


CLÁUSULA 10ª — DO FORO

10.1. As partes elegem o foro da comarca de {{cidade_foro}} para dirimir as
questões oriundas deste contrato, com renúncia a qualquer outro, por mais
privilegiado que seja.

10.2. Sendo o CONTRATANTE consumidor, fica ressalvada a faculdade prevista no
art. 101, inciso I, do Código de Defesa do Consumidor.


E por estarem assim justas e contratadas, as partes firmam o presente
instrumento em duas vias de igual teor.

{{cidade_foro}}, {{hoje_extenso}}.


_______________________________        _______________________________
{{empresa_razao}}                      {{cliente_nome}}
CNPJ {{empresa_cnpj}}                  CPF/CNPJ {{cliente_documento}}
CONTRATADA                             CONTRATANTE


_______________________________        _______________________________
Testemunha 1                           Testemunha 2
Nome:                                  Nome:
CPF:                                   CPF:
`

export const CORPO_NOTA_PROMISSORIA = `NOTA PROMISSÓRIA

Nº {{os_numero}}                                    Valor: {{valor_aberto}}


Aos ____ de ______________________ de ________, pagarei por esta única via de
NOTA PROMISSÓRIA a {{empresa_razao}}, inscrita no CNPJ sob o nº
{{empresa_cnpj}}, ou à sua ordem, a quantia de

     {{valor_aberto}} ({{valor_aberto_extenso}})

em moeda corrente nacional.

Pagável em {{cidade_foro}}.


EMITENTE

Nome ........ {{cliente_nome}}
CPF/CNPJ .... {{cliente_documento}}
Endereço .... {{cliente_endereco}}
Telefone .... {{cliente_telefone}}


{{cidade_foro}}, {{hoje_extenso}}.



_________________________________________________
{{cliente_nome}}
CPF/CNPJ {{cliente_documento}}
Assinatura do emitente


- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
INFORMAÇÕES COMPLEMENTARES — não integram o título

Este título tem origem na Ordem de Serviço nº {{os_numero}}, aberta em
{{os_abertura}}, referente à manutenção do equipamento
{{equipamento_marca}} {{equipamento_modelo}}, número de série
{{equipamento_serie}}.

O valor acima corresponde ao saldo em aberto da referida ordem na data de
emissão deste título.

Emitido por {{empresa_nome}} — {{empresa_endereco}} — {{empresa_telefone}}.
`


/** Os três moldes, na ordem em que aparecem na tela de Modelos de documento. */
export const MOLDES_PADRAO: ReadonlyArray<{
  nome: string
  tipo: string
  descricao: string
  corpo: string
}> = [
  {
    nome: 'Ordem de serviço — padrão DTECH MED',
    tipo: 'ORDEM_SERVICO',
    descricao:
      'O documento completo da O.S.: equipamento e acessórios conferidos, relato do cliente, laudo do técnico, prazo, valor, garantia de 90 dias e a regra de aparelho não retirado.',
    corpo: CORPO_ORDEM_SERVICO,
  },
  {
    nome: 'Contrato de prestação de serviços — padrão DTECH MED',
    tipo: 'CONTRATO_PRESTACAO',
    descricao:
      'Instrumento completo para quando o setor de compras exige contrato assinado: partes qualificadas, objeto amarrado ao orçamento aprovado, garantia de 90 dias (CDC art. 26), prazo com hipóteses de suspensão, aparelho não retirado (CC art. 1.275), LGPD e foro.',
    corpo: CORPO_CONTRATO_PRESTACAO,
  },
  {
    nome: 'Nota promissória — padrão DTECH MED',
    tipo: 'NOTA_PROMISSORIA',
    descricao:
      'Título na forma do Decreto 57.663/1966, pelo SALDO EM ABERTO da ordem. A origem da dívida fica abaixo do título, e não dentro dele: amarrar a promessa à causa descaracterizaria o título autônomo.',
    corpo: CORPO_NOTA_PROMISSORIA,
  },
]

/**
 * Cria os moldes que faltam nesta empresa. Idempotente: procura pelo nome e só
 * cria o que não existe.
 *
 * Recebe a TRANSAÇÃO, e não o contexto, porque na criação da empresa ela roda
 * dentro da mesma transação que criou o tenant — empresa criada sem molde por
 * uma falha no meio seria empresa pela metade.
 */
export async function garantirMoldesPadrao(
  tx: Prisma.TransactionClient,
  tenantId: string,
  autorNome = 'Sistema',
): Promise<number> {
  let criados = 0
  for (const m of MOLDES_PADRAO) {
    const ja = await tx.modeloDocumento.findFirst({
      where: { tenantId, tipo: m.tipo, nome: m.nome },
      select: { id: true },
    })
    if (ja) continue
    await tx.modeloDocumento.create({
      data: { tenantId, ...m, padrao: true, autorNome },
    })
    criados += 1
  }
  return criados
}
