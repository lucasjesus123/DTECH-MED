import type { Conteudo } from '@/lib/conteudo'

/**
 * O MAPA DA TELA DE EDIÇÃO.
 *
 * ---------------------------------------------------------------------------
 * POR QUE UM MAPA, E NÃO UM FORMULÁRIO ESCRITO À MÃO
 * ---------------------------------------------------------------------------
 * São setenta e poucos campos. Escritos à mão, seriam setenta e poucos blocos
 * de JSX quase idênticos — e cada campo novo do site exigiria lembrar de
 * acrescentar mais um, no lugar certo, com o rótulo certo. Esquecer um é o
 * defeito mais provável, e o mais silencioso: o campo existe no site e não
 * aparece na tela para editar.
 *
 * Aqui a tela é DESCRITA. Acrescentar um campo é acrescentar uma linha nesta
 * lista, e ele aparece com o tipo de entrada certo, na aba certa, com a ajuda
 * certa embaixo.
 *
 * ---------------------------------------------------------------------------
 * O QUE CADA COISA SIGNIFICA
 * ---------------------------------------------------------------------------
 *  · `caminho` — onde o valor mora dentro do conteúdo, no mesmo formato do
 *    `data-c` que marca o texto no site. É o que liga o campo à prévia.
 *  · `tipo` — decide a entrada: uma linha, várias linhas, ou número.
 *  · `ajuda` — o que aparece embaixo do campo. Vale ouro nos campos onde a
 *    escolha tem consequência que não se vê na hora.
 */

export type TipoCampo = 'texto' | 'area' | 'numero'

export type Campo = {
  caminho: string
  rotulo: string
  tipo?: TipoCampo
  ajuda?: string
}

/** Uma lista de itens repetidos (serviços, etapas, avaliações…). */
export type Lista = {
  caminho: string
  rotulo: string
  /** Como cada item é chamado no botão de acrescentar. */
  item: string
  /** Campos de CADA item. O caminho aqui é relativo ao item. */
  campos: Campo[]
  /** O que criar quando a pessoa aperta "acrescentar". */
  novo: () => Record<string, unknown>
  max: number
}

export type Aba = {
  id: string
  nome: string
  /** Para onde a prévia rola quando a aba é aberta. Vazio fica no topo. */
  ancora: string
  descricao: string
  campos: Campo[]
  listas?: Lista[]
  /** Lista simples de textos, sem sub-campos (as marcas, os itens do prontuário). */
  listasSimples?: Array<{ caminho: string; rotulo: string; item: string; max: number }>
}

export const ABAS: Aba[] = [
  {
    id: 'dobra',
    nome: 'Primeira dobra',
    ancora: '',
    descricao: 'O que a pessoa vê antes de rolar. É a parte que mais decide se ela fica.',
    campos: [
      {
        caminho: 'dobra.chamada',
        rotulo: 'Chamada',
        tipo: 'area',
        ajuda: 'A frase grande. Comece pelo que a pessoa procura, não pelo nome da empresa.',
      },
      { caminho: 'dobra.subChamada', rotulo: 'Subtítulo', tipo: 'area' },
      { caminho: 'dobra.botaoWhatsapp', rotulo: 'Botão do WhatsApp' },
      { caminho: 'dobra.botaoFormulario', rotulo: 'Botão do formulário' },
    ],
    listas: [
      {
        caminho: 'dobra.provas',
        rotulo: 'Os números',
        item: 'número',
        max: 6,
        novo: () => ({ valor: '0', sufixo: '', rotulo: 'Novo número' }),
        campos: [
          { caminho: 'valor', rotulo: 'Número' },
          { caminho: 'sufixo', rotulo: 'Sufixo', ajuda: 'Ex.: +, dias. Pode ficar vazio.' },
          { caminho: 'rotulo', rotulo: 'Rótulo' },
        ],
      },
    ],
  },
  {
    id: 'marcas',
    nome: 'Marcas',
    ancora: '',
    descricao: 'A faixa que responde "vocês mexem no MEU aparelho?".',
    campos: [{ caminho: 'marcas.titulo', rotulo: 'Título da faixa' }],
    listasSimples: [{ caminho: 'marcas.lista', rotulo: 'Marcas atendidas', item: 'marca', max: 24 }],
  },
  {
    id: 'servicos',
    nome: 'Serviços',
    ancora: '#servicos',
    descricao: 'O que a assistência faz, em blocos curtos.',
    campos: [
      { caminho: 'servicos.titulo', rotulo: 'Título' },
      { caminho: 'servicos.lead', rotulo: 'Texto de apoio', tipo: 'area' },
    ],
    listas: [
      {
        caminho: 'servicos.lista',
        rotulo: 'Os serviços',
        item: 'serviço',
        max: 12,
        novo: () => ({ icone: 'chave', titulo: 'Novo serviço', texto: 'Descreva o serviço.' }),
        campos: [
          {
            caminho: 'icone',
            rotulo: 'Ícone',
            ajuda: 'chave, calendario, medidor, laudo, caixa ou escudo',
          },
          { caminho: 'titulo', rotulo: 'Título' },
          { caminho: 'texto', rotulo: 'Texto', tipo: 'area' },
        ],
      },
    ],
  },
  {
    id: 'especialidades',
    nome: 'Especialidades',
    ancora: '#servicos',
    descricao: 'Os quatro tipos de equipamento, com a foto de cada um.',
    campos: [
      { caminho: 'especialidades.titulo', rotulo: 'Título' },
      { caminho: 'especialidades.lead', rotulo: 'Texto de apoio', tipo: 'area' },
    ],
    listas: [
      {
        caminho: 'especialidades.lista',
        rotulo: 'As especialidades',
        item: 'especialidade',
        max: 8,
        novo: () => ({ nome: 'Nova', texto: 'Descreva.', foto: '' }),
        campos: [
          { caminho: 'nome', rotulo: 'Nome' },
          { caminho: 'texto', rotulo: 'Texto', tipo: 'area' },
          {
            caminho: 'foto',
            rotulo: 'Foto',
            ajuda:
              'Nome do arquivo em public/fotos, sem extensão. Vazio, ou nome que não existe, ' +
              'mostra a marca d’água.',
          },
        ],
      },
    ],
  },
  {
    id: 'prontuario',
    nome: 'Prontuário',
    ancora: '#prontuario',
    descricao: 'A seção que explica o diferencial. A linha do tempo é o exemplo mostrado.',
    campos: [
      { caminho: 'prontuario.titulo', rotulo: 'Título' },
      {
        caminho: 'prontuario.destaque',
        rotulo: 'Palavra em destaque',
        ajuda: 'Sai em itálico e cor de destaque, logo depois do título.',
      },
      { caminho: 'prontuario.lead', rotulo: 'Texto de apoio', tipo: 'area' },
      { caminho: 'prontuario.ordemExemplo.numero', rotulo: 'Número da ordem de exemplo' },
      { caminho: 'prontuario.ordemExemplo.equipamento', rotulo: 'Equipamento de exemplo' },
      { caminho: 'prontuario.ordemExemplo.detalhe', rotulo: 'Detalhe do equipamento' },
    ],
    listasSimples: [
      { caminho: 'prontuario.itens', rotulo: 'As promessas', item: 'promessa', max: 10 },
    ],
    listas: [
      {
        caminho: 'prontuario.etapas',
        rotulo: 'Etapas da linha do tempo',
        item: 'etapa',
        max: 16,
        novo: () => ({ titulo: 'Nova etapa', quem: 'Quem fez', quando: 'dd/mm · hh:mm' }),
        campos: [
          { caminho: 'titulo', rotulo: 'O que aconteceu' },
          { caminho: 'quem', rotulo: 'Quem fez' },
          { caminho: 'quando', rotulo: 'Quando' },
        ],
      },
    ],
  },
  {
    id: 'sobre',
    nome: 'A empresa',
    ancora: '#a-empresa',
    descricao: 'Quem é a DTECH, missão, visão e valores.',
    campos: [
      { caminho: 'sobre.titulo', rotulo: 'Título' },
      { caminho: 'sobre.botao', rotulo: 'Texto do botão' },
      { caminho: 'sobre.clientesNumero', rotulo: 'Número de clientes' },
      { caminho: 'sobre.clientesTexto', rotulo: 'Frase dos clientes', tipo: 'area' },
      { caminho: 'sobre.missao', rotulo: 'Missão', tipo: 'area' },
      { caminho: 'sobre.visao', rotulo: 'Visão', tipo: 'area' },
      { caminho: 'sobre.valores', rotulo: 'Valores', tipo: 'area' },
    ],
    listasSimples: [
      { caminho: 'sobre.paragrafos', rotulo: 'Parágrafos', item: 'parágrafo', max: 6 },
    ],
  },
  {
    id: 'google',
    nome: 'Google',
    ancora: '#tit-google',
    descricao:
      'As avaliações. Transcreva o que está no seu perfil; nota inventada aqui é problema com o Google.',
    campos: [
      { caminho: 'google.categoria', rotulo: 'Categoria mostrada' },
      { caminho: 'google.nota', rotulo: 'Nota', tipo: 'numero' },
      { caminho: 'google.quantidade', rotulo: 'Quantidade de avaliações', tipo: 'numero' },
      { caminho: 'google.tituloFotos', rotulo: 'Título da faixa de fotos' },
      { caminho: 'google.botao', rotulo: 'Texto do botão' },
    ],
    listas: [
      {
        caminho: 'google.avaliacoes',
        rotulo: 'Avaliações',
        item: 'avaliação',
        max: 12,
        novo: () => ({ autor: 'Nome', quando: 'há 1 mês', nota: 5, texto: '' }),
        campos: [
          { caminho: 'autor', rotulo: 'Quem avaliou' },
          { caminho: 'quando', rotulo: 'Quando' },
          { caminho: 'nota', rotulo: 'Nota', tipo: 'numero' },
          {
            caminho: 'texto',
            rotulo: 'Texto',
            tipo: 'area',
            ajuda: 'Vazio mostra "Avaliou com N estrelas". Não invente o que a pessoa não escreveu.',
          },
        ],
      },
    ],
  },
  {
    id: 'bastidores',
    nome: 'Bastidores',
    ancora: '#tit-insta',
    descricao: 'O carrossel de fotos. A seção some sozinha se não houver foto nem feed.',
    campos: [
      { caminho: 'bastidores.titulo', rotulo: 'Título' },
      { caminho: 'bastidores.lead', rotulo: 'Texto', tipo: 'area' },
      { caminho: 'bastidores.botao', rotulo: 'Texto do botão' },
    ],
  },
  {
    id: 'formulario',
    nome: 'Formulário',
    ancora: '#solicitar',
    descricao: 'Onde o cliente pede a retirada. A seção que fecha negócio.',
    campos: [
      { caminho: 'formulario.titulo', rotulo: 'Título' },
      { caminho: 'formulario.lead', rotulo: 'Texto de apoio', tipo: 'area' },
      { caminho: 'formulario.botao', rotulo: 'Texto do botão' },
      { caminho: 'formulario.nota', rotulo: 'Aviso de privacidade', tipo: 'area' },
      { caminho: 'formulario.contatoDireto', rotulo: 'Frase antes do telefone' },
    ],
  },
  {
    id: 'onde',
    nome: 'Onde estamos',
    ancora: '#onde-estamos',
    descricao: 'Endereço e mapa.',
    campos: [
      { caminho: 'onde.titulo', rotulo: 'Título' },
      { caminho: 'onde.lead', rotulo: 'Texto de apoio', tipo: 'area' },
      { caminho: 'onde.botaoRota', rotulo: 'Botão da rota' },
      { caminho: 'onde.botaoGoogle', rotulo: 'Botão do Google' },
    ],
  },
  {
    id: 'contato',
    nome: 'Contato e endereço',
    ancora: '#onde-estamos',
    descricao: 'Aparece no rodapé, no mapa, nos botões de WhatsApp e nos documentos.',
    campos: [
      { caminho: 'identidade.nome', rotulo: 'Nome da empresa' },
      { caminho: 'identidade.razaoSocial', rotulo: 'Razão social' },
      { caminho: 'identidade.descricaoSite', rotulo: 'O que a empresa faz', tipo: 'area' },
      { caminho: 'identidade.cnpj', rotulo: 'CNPJ', ajuda: 'Vazio some do rodapé.' },
      {
        caminho: 'contato.whatsapp',
        rotulo: 'WhatsApp (só números)',
        ajuda: 'Com país e DDD, sem sinais. Ex.: 5551980449274.',
      },
      { caminho: 'contato.telefoneExibicao', rotulo: 'Telefone como aparece' },
      { caminho: 'contato.email', rotulo: 'E-mail', ajuda: 'Vazio some do rodapé.' },
      {
        caminho: 'contato.horarioAtendimento',
        rotulo: 'Horário',
        ajuda: 'Ex.: Seg a Sex · 8h às 18h. Vazio some.',
      },
      { caminho: 'endereco.logradouro', rotulo: 'Rua' },
      { caminho: 'endereco.numero', rotulo: 'Número' },
      { caminho: 'endereco.complemento', rotulo: 'Complemento' },
      { caminho: 'endereco.bairro', rotulo: 'Bairro' },
      { caminho: 'endereco.cidade', rotulo: 'Cidade' },
      { caminho: 'endereco.uf', rotulo: 'UF' },
      { caminho: 'endereco.cep', rotulo: 'CEP' },
    ],
  },
  {
    id: 'redes',
    nome: 'Redes e mapa',
    ancora: '',
    descricao: 'Cada campo vazio esconde o botão correspondente, em vez de deixar link morto.',
    campos: [
      { caminho: 'redes.instagram', rotulo: 'Instagram', ajuda: 'Com a arroba. Ex.: @dtechmed_assistencia' },
      {
        caminho: 'redes.instagramFeed',
        rotulo: 'Endereço do feed',
        tipo: 'area',
        ajuda:
          'O endereço JSON de um serviço de feed (Behold, LightWidget). Com ele, as publicações ' +
          'aparecem nos bastidores no lugar do carrossel de fotos.',
      },
      { caminho: 'redes.googleMeuNegocio', rotulo: 'Perfil no Google', tipo: 'area' },
      { caminho: 'redes.facebook', rotulo: 'Facebook', tipo: 'area' },
      {
        caminho: 'redes.mapaEmbed',
        rotulo: 'Mapa do Google',
        tipo: 'area',
        ajuda:
          'No Maps: Compartilhar → Incorporar um mapa → copie só o valor do src. Vazio monta o ' +
          'mapa a partir do endereço.',
      },
    ],
  },
  {
    id: 'seo',
    nome: 'Busca do Google',
    ancora: '',
    descricao: 'O que aparece no resultado da busca. Não muda nada na página em si.',
    campos: [
      {
        caminho: 'seo.titulo',
        rotulo: 'Título na busca',
        tipo: 'area',
        ajuda: 'Até uns 60 caracteres. Acima disso o Google corta com reticências.',
      },
      {
        caminho: 'seo.descricao',
        rotulo: 'Descrição na busca',
        tipo: 'area',
        ajuda: 'Entre 120 e 160 caracteres é a faixa que costuma aparecer inteira.',
      },
      {
        caminho: 'seo.verificacaoGoogle',
        rotulo: 'Código de verificação do Google',
        tipo: 'texto',
        ajuda:
          'Só para provar ao Google que o site é seu. No Search Console, escolha ' +
          '"Prefixo do URL", depois "Tag HTML", e cole aqui SÓ o código de dentro das ' +
          'aspas do content — não a linha inteira. Salve, e volte lá para clicar em ' +
          'Verificar. Pode deixar vazio: enquanto estiver, nada é escrito na página.',
      },
      {
        caminho: 'seo.ga4Id',
        rotulo: 'Google Analytics (relatório de visitas)',
        tipo: 'texto',
        ajuda:
          'O relatório que diz quantas pessoas entraram e de onde vieram. No Analytics, ' +
          'em Administrador → Fluxos de dados, o código aparece como G-XXXXXXXXXX. ' +
          'Se você já mede tudo pelo Tag Manager abaixo, DEIXE VAZIO: preencher os dois ' +
          'conta a mesma visita duas vezes, e relatório com o dobro do movimento é pior ' +
          'que relatório nenhum.',
      },
      {
        caminho: 'seo.googleAdsId',
        rotulo: 'Google Ads — conta',
        tipo: 'texto',
        ajuda:
          'É o que faz a conversão voltar até o anúncio que a gerou. Sem ele, o Ads mostra ' +
          'cliques e gasto e para por aí. Em Ferramentas → Conversões, o código tem o ' +
          'formato AW-000000000.',
      },
      {
        caminho: 'seo.googleAdsRotulo',
        rotulo: 'Google Ads — rótulo da conversão',
        tipo: 'texto',
        ajuda:
          'O Ads exige os dois: a conta diz QUAL conta, o rótulo diz QUAL conversão dela. ' +
          'Um sem o outro não dispara nada — e falha calada, que é como se descobre um mês ' +
          'depois que a campanha inteira rodou sem medição. Na mesma tela de Conversões, ' +
          'em "Instalar a tag manualmente", é o valor de send_to depois da barra.',
      },
      {
        caminho: 'seo.gtmId',
        rotulo: 'Google Tag Manager (tráfego pago)',
        tipo: 'texto',
        ajuda:
          'O contêiner que mede as visitas e as conversões dos anúncios. No Tag Manager, ' +
          'o código fica no alto da tela, no formato GTM-XXXXXXX — cole só ele. ' +
          'A tag roda SÓ no site público: o painel, os aplicativos e o link que o cliente ' +
          'recebe ficam de fora de propósito, porque aquele link é a senha da ordem dele. ' +
          'Vazio desliga tudo.',
      },
    ],
  },
]

/** Lê um valor pelo caminho: `ler(c, 'dobra.chamada')`. */
export function ler(obj: unknown, caminho: string): unknown {
  return caminho.split('.').reduce<unknown>((atual, parte) => {
    if (atual === null || typeof atual !== 'object') return undefined
    return (atual as Record<string, unknown>)[parte]
  }, obj)
}

/**
 * Devolve uma CÓPIA com o valor trocado. Não mexe no original.
 *
 * Isso importa no React: mudar o objeto no lugar não avisa ninguém de que algo
 * mudou, e a tela não redesenha. O defeito aparece como "digitei e não
 * aconteceu nada", que é dos mais difíceis de entender quando acontece.
 */
export function escrever<T>(obj: T, caminho: string, valor: unknown): T {
  const partes = caminho.split('.')
  const raiz: unknown = Array.isArray(obj) ? [...(obj as unknown[])] : { ...(obj as object) }

  let atual = raiz as Record<string, unknown>
  for (let i = 0; i < partes.length - 1; i++) {
    const k = partes[i]!
    const dentro = atual[k]
    atual[k] = Array.isArray(dentro) ? [...dentro] : { ...(dentro as object) }
    atual = atual[k] as Record<string, unknown>
  }
  atual[partes[partes.length - 1]!] = valor
  return raiz as T
}

export type { Conteudo }
