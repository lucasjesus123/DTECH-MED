import type { TipoModelavel } from '@/server/consultas/modelos'

/**
 * OS MOLDES PRONTOS — o texto que a empresa começa a partir de, e não do zero.
 *
 * =============================================================================
 * POR QUE ISTO EXISTE
 * =============================================================================
 * A tela de Modelos de documento estava pronta e vazia. Quem abria encontrava
 * um botão "Novo modelo" e uma folha em branco — e escrever um contrato de
 * prestação de serviço do zero, com cláusula de garantia, de foro e de guarda
 * do equipamento, não é trabalho de quem administra uma assistência técnica num
 * dia de vinte O.S. O resultado previsível é o que se via: nenhum modelo
 * criado, e todo documento saindo com o texto embutido no código, igual para
 * todas as franquias.
 *
 * Aqui estão os textos organizados, prontos para servir. Eles NÃO são
 * obrigatórios e não substituem nada sozinhos: são o ponto de partida que a
 * pessoa carrega com um clique e edita como quiser antes de salvar.
 *
 * =============================================================================
 * O QUE O MOLDE ESCREVE, E O QUE O SISTEMA JÁ ESCREVE SOZINHO
 * =============================================================================
 * O gerador de PDF já imprime, em TODO documento, o cabeçalho com o número e a
 * data, o bloco CLIENTE (nome, documento, contato, telefone, endereço), o bloco
 * EQUIPAMENTO (marca, modelo, série, acessórios, defeito relatado) e, depois do
 * corpo, a LINHA DE ASSINATURA com o nome e o documento de quem assina.
 *
 * Então o molde não repete identificação: ele escreve o que o papel PROMETE. A
 * qualificação das partes aparece no contrato mesmo assim — num instrumento ela
 * é parte do texto, não etiqueta de cabeçalho.
 *
 * =============================================================================
 * TODO MARCADOR AQUI PRECISA EXISTIR NO CATÁLOGO
 * =============================================================================
 * `salvarModelo` recusa marcador desconhecido, e com razão: `{{cliente_nomee}}`
 * sairia escrito assim no papel. Estes textos passam pela mesma porta que os
 * escritos à mão — não há atalho — e o teste confere marcador por marcador.
 */

export type MoldePronto = {
  /** O nome sugerido, que a pessoa pode trocar antes de salvar. */
  nome: string
  descricao: string
  corpo: string
}

export const MOLDES_PRONTOS: Record<TipoModelavel, MoldePronto> = {
  CONTRATO_PRESTACAO: {
    nome: 'Contrato de prestação de serviço técnico',
    descricao: 'Padrão da casa: partes, objeto, prazo, pagamento, garantia e foro.',
    corpo: `CONTRATO DE PRESTAÇÃO DE SERVIÇO TÉCNICO ESPECIALIZADO

1. AS PARTES

CONTRATADA: {{empresa_razao}}, inscrita no CNPJ sob o nº {{empresa_cnpj}}, com sede em {{empresa_endereco}}, telefone {{empresa_telefone}}, doravante denominada CONTRATADA.

CONTRATANTE: {{cliente_nome}}, inscrito(a) sob o nº {{cliente_documento}}, com endereço em {{cliente_endereco}}, telefone {{cliente_telefone}}, neste ato representado(a) por {{cliente_contato}}, doravante denominado(a) CONTRATANTE.

2. OBJETO

Prestação de serviço técnico especializado no equipamento {{equipamento_marca}} {{equipamento_modelo}}, número de série {{equipamento_serie}}, recebido com os acessórios {{equipamento_acessorios}}, conforme a Ordem de Serviço nº {{os_numero}}, aberta em {{os_abertura}}.

Defeito relatado pelo CONTRATANTE: {{os_defeito}}

Laudo técnico: {{os_diagnostico}}

3. VALOR E PAGAMENTO

O valor total dos serviços e das peças é de {{valor_total}} ({{valor_extenso}}), na forma {{forma_pagamento}}.

O pagamento é devido na entrega do equipamento, salvo condição diversa combinada por escrito entre as partes e registrada na Ordem de Serviço. Saldo em aberto nesta data: {{valor_aberto}}.

4. PRAZO DE EXECUÇÃO

A CONTRATADA executará o serviço até {{os_prazo}}, contado da aprovação do orçamento pelo CONTRATANTE.

O prazo fica suspenso enquanto a CONTRATADA aguardar peça de fornecedor, e o CONTRATANTE é comunicado da suspensão e da nova previsão.

5. GARANTIA

A CONTRATADA garante o serviço executado e as peças aplicadas, contados da data de entrega do equipamento, nos termos da Ordem de Serviço.

A garantia NÃO cobre: mau uso, queda ou impacto; oscilação da rede elétrica e descarga atmosférica; intervenção de terceiro não autorizado pela CONTRATADA; desgaste natural de componentes de consumo; e defeito diverso do que foi objeto deste contrato.

O rompimento do lacre de garantia por terceiro extingue a garantia.

6. SERVIÇO ADICIONAL

Serviço não previsto, identificado durante a execução, será submetido a nova aprovação do CONTRATANTE antes de ser realizado. Nada é executado sem autorização.

7. GUARDA E TRANSPORTE DO EQUIPAMENTO

A CONTRATADA responde pelo equipamento enquanto ele estiver sob sua guarda, do recebimento à entrega. O estado de recebimento e o de entrega são documentados por fotografia e por assinatura do CONTRATANTE ou de seu preposto, e ficam disponíveis ao CONTRATANTE pelo link de acompanhamento da Ordem de Serviço.

Peça substituída fica à disposição do CONTRATANTE pelo prazo de 30 dias contados da entrega; findo o prazo, a CONTRATADA fica autorizada a dar-lhe destinação ambientalmente adequada.

8. ABANDONO DO EQUIPAMENTO

Equipamento não retirado nem autorizado para entrega em até 90 dias da comunicação de conclusão sujeita o CONTRATANTE ao pagamento de armazenagem, e faculta à CONTRATADA as medidas previstas em lei para a coisa abandonada.

9. PROTEÇÃO DE DADOS

As partes tratam os dados pessoais deste contrato apenas para executá-lo e para cumprir obrigação legal, nos termos da Lei nº 13.709/2018.

10. FORO

Fica eleito o foro da comarca de {{cidade_foro}} para dirimir as questões oriundas deste contrato, com renúncia a qualquer outro, por mais privilegiado que seja.

E por estarem justas e contratadas, as partes assinam o presente instrumento.

{{cidade_foro}}, {{hoje_extenso}}.`,
  },

  ORDEM_SERVICO: {
    nome: 'Ordem de serviço da casa',
    descricao: 'O papel que acompanha o aparelho: o que entrou, o que foi feito, o que vale.',
    corpo: `ORDEM DE SERVIÇO Nº {{os_numero}}

Aberta em {{os_abertura}} · situação atual: {{os_etapa}}
Técnico responsável: {{os_tecnico}} · previsão de conclusão: {{os_prazo}}

1. O QUE O CLIENTE RELATOU

{{os_defeito}}

2. O QUE O TÉCNICO ENCONTROU

{{os_diagnostico}}

3. O QUE ENTROU COM O APARELHO

Equipamento: {{equipamento_marca}} {{equipamento_modelo}} — série {{equipamento_serie}}
Acessórios recebidos: {{equipamento_acessorios}}

Conferir os acessórios na entrega é responsabilidade das duas partes. O que não estiver escrito nesta linha não entrou conosco.

4. VALOR

Total do serviço: {{valor_total}} ({{valor_extenso}})
Em aberto nesta data: {{valor_aberto}} · forma combinada: {{forma_pagamento}}

5. CONDIÇÕES

O serviço só é executado após a aprovação do orçamento pelo CONTRATANTE, registrada no link de acompanhamento com confirmação de CPF/CNPJ.

Serviço adicional identificado durante a execução é submetido a nova aprovação antes de ser realizado.

A entrega do equipamento é liberada com o pagamento acertado, e o recebimento é registrado com fotografia e assinatura de quem recebe.

Este documento acompanha o equipamento e não substitui a nota fiscal.

Acompanhe esta ordem em tempo real pelo link enviado no WhatsApp de {{cliente_telefone}}.

{{empresa_nome}} · {{empresa_telefone}}
{{cidade_foro}}, {{hoje}}.`,
  },

  NOTA_PROMISSORIA: {
    nome: 'Nota promissória da O.S.',
    descricao: 'Título de crédito para quem leva o aparelho e paga depois.',
    corpo: `NOTA PROMISSÓRIA Nº {{os_numero}}

Valor: {{valor_aberto}}

Aos ____ de ______________ de ______, pagarei por esta única via de NOTA PROMISSÓRIA a {{empresa_razao}}, inscrita no CNPJ sob o nº {{empresa_cnpj}}, ou à sua ordem, a quantia de {{valor_aberto_extenso}}, em moeda corrente nacional.

Referente aos serviços da Ordem de Serviço nº {{os_numero}}, no equipamento {{equipamento_marca}} {{equipamento_modelo}}, série {{equipamento_serie}}.

Pagável em {{cidade_foro}}.

EMITENTE: {{cliente_nome}}
Documento: {{cliente_documento}}
Endereço: {{cliente_endereco}}

{{cidade_foro}}, {{hoje_extenso}}.`,
  },
}
