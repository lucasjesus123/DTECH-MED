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
 * CONFIRMADO — extraído do site oficial (dtechmed.com.br), agosto de 2026:
 *   nome, descricaoSite, endereço completo com CEP, telefone,
 *   missao, visao, valores e os dois serviços.
 *
 * PENDENTE — não consta no site e não foi possível confirmar. Estão vazios de
 * propósito: campo vazio some da tela; campo inventado vira erro impresso em
 * contrato. Assim que você passar, é só preencher aqui.
 *   cnpj, email, instagram, horarioAtendimento
 *
 * O logotipo oficial também está pendente — veja `public/marca/LEIA-ME.md`.
 * Enquanto não chega, a marca é desenhada em texto, como está hoje.
 */

/**
 * Os campos pendentes são tipados como `string`, e não pelo literal vazio.
 *
 * Com `as const` puro, o TypeScript provaria que `EMPRESA.cnpj ? … : null`
 * nunca entra no primeiro ramo — e reclamaria, com razão, de código morto.
 * Como esses campos existem justamente para serem preenchidos depois, a
 * anotação explícita mantém os dois caminhos vivos.
 */
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
    bairro: string
    cidade: string
    uf: string
    cep: string
  }
  instagram: string
  facebook: string
  missao: string
  visao: string
  valores: string
  servicos: ReadonlyArray<{ titulo: string; texto: string }>
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

  // --- Endereço (confirmado no site oficial) ------------------------------
  endereco: {
    logradouro: 'Av. Alberto Pasqualini',
    numero: '2073',
    bairro: 'São Cristóvão',
    cidade: 'Lajeado',
    uf: 'RS',
    cep: '95914-040',
  },

  // --- Redes --------------------------------------------------------------
  /** PENDENTE: informar o @ do Instagram, se houver. */
  instagram: '',
  /** PENDENTE: informar a página do Facebook, se houver. */
  facebook: '',

  // --- O que a empresa diz de si (texto do site oficial) -------------------
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

  /** Os dois serviços que o site oficial descreve. */
  servicos: [
    {
      titulo: 'Manutenção corretiva',
      texto:
        'Reparo completo de equipamentos com defeito, com substituição de peças originais.',
    },
    {
      titulo: 'Manutenção preventiva',
      texto:
        'Revisões periódicas para prevenir falhas e prolongar a vida útil dos equipamentos.',
    },
  ],
}

/** Endereço numa linha, do jeito que se lê em voz alta. */
export function enderecoEmUmaLinha(): string {
  const e = EMPRESA.endereco
  return `${e.logradouro}, ${e.numero} · ${e.bairro} · ${e.cidade}/${e.uf} · CEP ${e.cep}`
}

/** Link do WhatsApp, com mensagem já digitada para a pessoa só apertar enviar. */
export function linkWhatsapp(mensagem?: string): string {
  const base = `https://wa.me/${EMPRESA.whatsapp}`
  return mensagem ? `${base}?text=${encodeURIComponent(mensagem)}` : base
}
