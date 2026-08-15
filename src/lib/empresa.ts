/**
 * Dados institucionais da DTECH MED.
 *
 * Um lugar só. Antes, telefone e endereço estavam escritos à mão na home, no
 * rodapé e na tela de login — três lugares para errar, e três para esquecer de
 * corrigir quando a empresa mudar de sala.
 *
 * ATENÇÃO ao alcance: isto vale para a **matriz**, e é usado pelo SITE e pela
 * tela de login. O painel, os PDFs e as mensagens de WhatsApp NÃO leem daqui —
 * eles leem do cadastro da empresa no banco (`Tenant`), porque cada franquia
 * tem o seu próprio endereço, CNPJ e logotipo. Fixar aqui o que é de cada
 * franquia faria toda ordem de serviço sair com o endereço de Lajeado.
 *
 * ---------------------------------------------------------------------------
 * PROCEDÊNCIA DE CADA CAMPO
 * ---------------------------------------------------------------------------
 * CONFIRMADO — transcrito do site oficial em produção (dtechmed.com.br),
 * agosto de 2026, palavra por palavra:
 *   chamada e subchamada da primeira dobra, os seis serviços com seus textos,
 *   as nove marcas atendidas, os dois parágrafos de "Alta performance e preço
 *   justo", a contagem de clientes, as avaliações do Google, missão, visão e
 *   valores, endereço completo e telefone.
 *
 * PENDENTE — não consta em lugar nenhum que eu pudesse conferir. Estão vazios
 * de propósito: campo vazio some da tela; campo inventado vira erro impresso
 * em contrato. Assim que você passar, é só preencher aqui.
 *   cnpj, email, horarioAtendimento, instagram, googleMeuNegocio, mapaEmbed
 *
 * O logotipo oficial também está pendente — veja `public/marca/LEIA-ME.md`.
 * O vídeo da primeira dobra idem — veja `public/video/LEIA-ME.md`.
 */

/**
 * Os campos pendentes são tipados como `string`, e não pelo literal vazio.
 *
 * Com `as const` puro, o TypeScript provaria que `EMPRESA.cnpj ? … : null`
 * nunca entra no primeiro ramo — e reclamaria, com razão, de código morto.
 * Como esses campos existem justamente para serem preenchidos depois, a
 * anotação explícita mantém os dois caminhos vivos.
 */
type Servico = {
  titulo: string
  texto: string
  /** Nome do ícone desenhado em `src/app/icones.tsx`. */
  icone: 'chave' | 'calendario' | 'medidor' | 'laudo' | 'caixa' | 'escudo'
}

type Avaliacao = {
  autor: string
  quando: string
  nota: number
  texto: string
}

type DadosEmpresa = {
  nome: string
  razaoSocial: string
  descricaoSite: string
  cnpj: string
  whatsapp: string
  telefoneExibicao: string
  email: string
  horarioAtendimento: string
  endereco: {
    logradouro: string
    numero: string
    complemento: string
    bairro: string
    cidade: string
    uf: string
    cep: string
  }
  instagram: string
  /** Endereço JSON de um serviço de feed. Vazio esconde a grade. */
  instagramFeed: string
  facebook: string
  /** Link do perfil no Google Meu Negócio, para o botão "avaliar". */
  googleMeuNegocio: string
  /** URL do `src` do iframe do Google Maps. Vazio esconde o mapa. */
  mapaEmbed: string
  chamada: string
  subChamada: string
  garantia: string
  clientesAtendidos: string
  sobreTitulo: string
  sobre: ReadonlyArray<string>
  missao: string
  visao: string
  valores: string
  servicos: ReadonlyArray<Servico>
  marcas: ReadonlyArray<string>
  google: {
    nota: number
    quantidade: number
    avaliacoes: ReadonlyArray<Avaliacao>
  }
}

export const EMPRESA: DadosEmpresa = {
  // --- Identidade ---------------------------------------------------------
  nome: 'DTECH MED',
  razaoSocial: 'DTECHMED Assistência Especializada LTDA',
  /** O que o site oficial diz que a empresa faz, na ordem em que ele diz. */
  descricaoSite: 'Manutenção de equipamentos médicos, odontológicos e estéticos',

  /** PENDENTE: informar. Some do rodapé enquanto estiver vazio. */
  cnpj: '',

  // --- Contato ------------------------------------------------------------
  /** Formato E.164 sem o "+", como a uazapi espera. */
  whatsapp: '5551980449274',
  telefoneExibicao: '(51) 98044-9274',
  /** PENDENTE: informar. */
  email: '',
  /** PENDENTE: informar. Ex.: 'Seg a Sex · 8h às 18h'. */
  horarioAtendimento: '',

  // --- Endereço -----------------------------------------------------------
  /**
   * Atualizado pelo Lucas em agosto de 2026. O site oficial ainda mostra o
   * endereço antigo (Av. Alberto Pasqualini, 2073, São Cristóvão) — este aqui
   * é o certo, e vale para o site, o rodapé e a tela de login.
   */
  endereco: {
    logradouro: 'R. Sabiá',
    numero: '702',
    complemento: 'Sala 03',
    bairro: 'Universitário',
    cidade: 'Lajeado',
    uf: 'RS',
    cep: '95914-052',
  },

  // --- Redes --------------------------------------------------------------
  /**
   * Confirmado pelo Lucas em agosto de 2026.
   *
   * Vale registrar o quase-erro: uma busca tinha devolvido
   * `@dtechassistenciaslz`, que é outra empresa, de outra cidade. Publicar o
   * Instagram do concorrente no próprio site é pior que não publicar nenhum, e
   * por isso o campo ficou vazio até vir a confirmação de quem é dono do
   * perfil, em vez de ser preenchido com o resultado da busca.
   */
  instagram: '@dtechmed_assistencia',
  /**
   * PENDENTE — e opcional.
   *
   * Cole aqui o endereço JSON que um serviço de feed gera depois que você
   * conectar o @dtechmed_assistencia (Behold, LightWidget, SnapWidget). Com
   * ele preenchido, a grade das últimas publicações aparece na seção
   * "Bastidores da oficina". Vazio, a seção fica com o texto e o botão de
   * seguir, que é o essencial.
   *
   * Deixamos assim, e não com o app do Facebook, porque o serviço assume o
   * trabalho de renovar o token — que vence a cada 60 dias e, quando vence sem
   * ninguém olhando, o feed morre em silêncio.
   */
  instagramFeed: '',
  /** PENDENTE: informar a página do Facebook, se houver. */
  facebook: '',
  /**
   * O link de compartilhamento do perfil, enviado pelo Lucas.
   *
   * É um encurtador do próprio Google: ele redireciona para a ficha no Maps. O
   * botão do site funciona assim, e o Google segue o redirecionamento quando lê
   * o `sameAs` dos dados estruturados.
   *
   * Se um dia quiser trocar pelo endereço completo do Maps (aquele comprido,
   * com `/maps/place/`), pode: os dois servem, e o completo é mais estável
   * porque não depende do encurtador continuar existindo.
   */
  googleMeuNegocio: 'https://share.google/pKuHef6hDaApJqmRN',
  /**
   * PENDENTE. No Google Maps: buscar o endereço → Compartilhar → Incorporar um
   * mapa → copiar SÓ o valor do `src`, sem a tag `<iframe>` em volta.
   * Vazio esconde o mapa e mostra o endereço em texto, que já basta.
   */
  mapaEmbed: '',

  // --- Primeira dobra (texto do site oficial) -----------------------------
  chamada: 'Assistência autorizada de aparelhos médicos e estéticos em RS',
  subChamada: 'Suporte completo com certificação e laudo técnico.',
  /**
   * O site em produção promete duas coisas diferentes: a primeira dobra diz
   * "90 dias" e a seção de serviços diz "até 6 meses". Prazo de garantia é
   * promessa contratual, então as duas não podiam continuar no ar. Confirmado
   * com o Lucas em agosto de 2026: são 90 dias.
   *
   * Este campo é a resposta única. Todo lugar que fala de garantia lê daqui,
   * então não há como o site voltar a se contradizer.
   */
  garantia: '90 dias',
  clientesAtendidos: 'mais de 300',

  // --- Sobre (texto do site oficial, palavra por palavra) -----------------
  sobreTitulo: 'Alta performance e preço justo',
  sobre: [
    'A Dtechmed nasceu para ser a solução inteligente na manutenção, ' +
      'calibragem e conserto de equipamentos médicos, estéticos e odontológicos.',
    'Com equipe qualificada, serviços rápidos e foco total na segurança e ' +
      'eficácia dos tratamentos, oferecemos soluções personalizadas, com ' +
      'confiança, transparência e excelente custo-benefício.',
  ],

  missao:
    'Oferecer assistência técnica especializada, ágil e segura, garantindo o ' +
    'desempenho dos equipamentos e a continuidade dos serviços.',
  visao:
    'Ser referência nacional em assistência técnica no setor médico-estético, ' +
    'reconhecida pela qualidade, inovação e confiança.',
  valores:
    'Atuar com excelência técnica, agilidade e ética, colocando o bem-estar do ' +
    'cliente em primeiro lugar e buscando a inovação constante em cada solução ' +
    'entregue.',

  // --- Os seis serviços (texto do site oficial) ---------------------------
  servicos: [
    {
      titulo: 'Manutenção corretiva',
      texto:
        'Conserto completo de equipamentos com defeito, com reposição de peças originais.',
      icone: 'chave',
    },
    {
      titulo: 'Manutenção preventiva',
      texto:
        'Revisões periódicas para evitar falhas e prolongar a vida útil dos equipamentos.',
      icone: 'calendario',
    },
    {
      titulo: 'Calibração',
      texto:
        'Ajustes técnicos e validações mantendo o equipamento preciso e dentro das normas.',
      icone: 'medidor',
    },
    {
      titulo: 'Laudos técnicos',
      texto:
        'Documentos técnicos com diagnóstico completo, usados em garantias e seguros.',
      icone: 'laudo',
    },
    {
      titulo: 'Logística segura',
      texto:
        'Recebemos e enviamos seu equipamento com embalagem especial e rastreamento.',
      icone: 'caixa',
    },
    {
      titulo: 'Garantia completa',
      texto:
        'Cobrimos com garantia os equipamentos e as manutenções realizadas na nossa oficina.',
      icone: 'escudo',
    },
  ],

  /** As marcas exibidas no site oficial, na ordem em que aparecem. */
  marcas: [
    'HTM',
    'IBRAMED',
    'Medical San',
    'KLD Biosistemas',
    'Fismatek',
    'Body Health',
    'Bioset',
    'Tonederm',
    'Adoxy',
  ],

  // --- Google Meu Negócio (transcrito do site oficial) --------------------
  google: {
    nota: 5,
    quantidade: 3,
    avaliacoes: [
      {
        autor: 'Vendasalugue Estética',
        quando: 'há 1 ano',
        nota: 5,
        texto: 'Rapidez e agilidade no atendimento',
      },
      {
        autor: 'Cari Barbieri',
        quando: 'há 1 ano',
        nota: 5,
        texto: '',
      },
      {
        autor: 'Agata Campos Fontoura',
        quando: 'há 1 ano',
        nota: 5,
        texto: '',
      },
    ],
  },
}

/** Endereço numa linha, do jeito que se lê em voz alta. */
export function enderecoEmUmaLinha(): string {
  const e = EMPRESA.endereco
  const numero = e.complemento ? `${e.numero}, ${e.complemento}` : e.numero
  return `${e.logradouro}, ${numero} · ${e.bairro} · ${e.cidade}/${e.uf} · CEP ${e.cep}`
}

/**
 * Quem construiu o sistema, para o rodapé.
 *
 * Vive aqui junto do resto porque aparece no site E em toda tela do painel e
 * dos aplicativos — e crédito escrito à mão em oito lugares é crédito que fica
 * desatualizado em sete.
 */
export const DESENVOLVEDOR = {
  nome: 'Grupo Conexão',
  site: 'https://conexaomkt.com.br',
} as const

/** O endereço do jeito que se digita numa busca de mapa. */
export function enderecoParaBusca(): string {
  const e = EMPRESA.endereco
  return `${EMPRESA.nome}, ${e.logradouro}, ${e.numero} - ${e.bairro}, ${e.cidade} - ${e.uf}, ${e.cep}`
}

/**
 * O endereço do mapa embutido.
 *
 * Se você colar em `mapaEmbed` o endereço que o Google Maps dá em
 * "Compartilhar → Incorporar um mapa", ele ganha: é o oficial, aceita ajuste
 * de zoom e de recorte, e não depende de nada não documentado.
 *
 * Sem ele, montamos o mapa a partir do endereço escrito. Funciona sem chave de
 * API e sem cadastro — que é o motivo de ser o padrão aqui: um mapa que
 * aparece sozinho vale mais que um mapa perfeito que ninguém configurou.
 */
export function mapaUrl(): string {
  if (EMPRESA.mapaEmbed) return EMPRESA.mapaEmbed
  return `https://www.google.com/maps?q=${encodeURIComponent(enderecoParaBusca())}&output=embed`
}

/** Abrir no aplicativo do Maps, para quem vai dirigir até lá. */
export function linkMaps(): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(enderecoParaBusca())}`
}

/** Link do WhatsApp, com mensagem já digitada para a pessoa só apertar enviar. */
export function linkWhatsapp(mensagem?: string): string {
  const base = `https://wa.me/${EMPRESA.whatsapp}`
  return mensagem ? `${base}?text=${encodeURIComponent(mensagem)}` : base
}

/** O @ do Instagram sem a arroba, para montar a URL. */
export function instagramUsuario(): string {
  return EMPRESA.instagram.replace(/^@/, '')
}
