import { Papel } from '@/generated/prisma/enums'
import { hashSenha, hashToken, novoToken } from '@/lib/cripto'
import { comContextoAuth, prisma, type ContextoAcesso } from '@/lib/db'
import { env } from '@/lib/env'
import { auditar } from '@/server/auth/guarda'
import { normalizarNumero } from '@/server/whatsapp/mensagens'
import { enviarTexto, tokenDaEmpresa } from '@/server/whatsapp/uazapi'

/**
 * RECUPERAÇÃO DE SENHA.
 *
 * =============================================================================
 * O BURACO QUE ISTO FECHA
 * =============================================================================
 * Até aqui, esquecer a senha era problema de outra pessoa: o técnico chamava o
 * administrador, o administrador chamava o dono da plataforma — e o dono da
 * plataforma não tinha a quem chamar. A conta que manda no sistema inteiro era
 * a única sem saída, e "abrir o banco pelo terminal" não é uma saída, é uma
 * emergência.
 *
 * =============================================================================
 * COMO O LINK CHEGA: WHATSAPP, NÃO E-MAIL
 * =============================================================================
 * Este sistema não manda e-mail — não há servidor de SMTP em lugar nenhum dele,
 * e inventar um só para isto significaria mais um segredo para guardar, mais uma
 * conta para vencer e mais um remetente para cair em caixa de spam.
 *
 * O que ele já sabe fazer é falar por WhatsApp, pelo número da própria empresa,
 * com a instância que o gestor conectou. É por ali que o orçamento vai, é por
 * ali que o cliente é avisado, e é por ali que a chave de volta chega.
 *
 * **A consequência honesta:** enquanto a empresa não tiver WhatsApp conectado, e
 * para o dono da plataforma — que não é de empresa nenhuma e por isso não tem
 * instância —, não há canal. Para esses casos existe a saída de terminal
 * (`npm run senha:link`), que não depende de canal algum. Isso está escrito no
 * guia de deploy, e não escondido aqui.
 *
 * =============================================================================
 * A RESPOSTA É SEMPRE A MESMA
 * =============================================================================
 * Pediu recuperação para um e-mail que não existe? Mesma tela, mesmo texto,
 * mesmo tempo de resposta. Responder "esse e-mail não está cadastrado" entrega
 * de graça a lista de quem trabalha na empresa — e a lista é a metade do
 * trabalho de quem vai atacar as senhas depois.
 */

/** Quanto tempo o link vale. Meia hora: dá para achar o celular, não dá para esquecer aberto. */
const MINUTOS_DE_VIDA = 30

/**
 * Espera mínima entre dois pedidos da mesma conta.
 *
 * Não protege a senha — o link vai para o dono do número de qualquer jeito. O
 * que ele impede é o botão "esqueci" virar máquina de encher o WhatsApp de
 * outra pessoa. O freio mora no BANCO, não aqui: a aplicação conta em memória, e
 * dois processos contariam separado.
 */
const ESPERA_SEGUNDOS = 120

export type PedidoRecuperacao = {
  email: string
  ip?: string | null
  userAgent?: string | null
}

/**
 * Abre o pedido e tenta entregar o link.
 *
 * Não devolve nada de propósito: não há resposta possível que não conte algo
 * sobre a existência da conta. Quem chama mostra sempre o mesmo aviso.
 */
export async function pedirRecuperacao(entrada: PedidoRecuperacao): Promise<void> {
  const email = entrada.email.trim().toLowerCase()

  // A mesma janela estreita que o login usa: libera apenas a LEITURA de
  // `usuarios` e `tenants`, e só. Precisa existir porque quem pede está
  // deslogado — sem empresa no contexto, o RLS devolveria zero linhas.
  const contas = await comContextoAuth((tx) =>
    tx.user.findMany({
      where: { email, ativo: true },
      select: {
        id: true,
        nome: true,
        telefone: true,
        papel: true,
        tenantId: true,
        tenant: { select: { nome: true, ativo: true, bloqueado: true } },
      },
    }),
  )

  // O mesmo e-mail pode existir em duas franquias. No login a senha desempata;
  // aqui não há senha, então cada conta recebe o próprio link, e a mensagem diz
  // de qual empresa ele é. Escolher uma por conta própria deixaria a outra
  // pessoa sem saída sem nunca saber por quê.
  const elegiveis = contas.filter(
    (c) => c.papel === Papel.SUPER_ADMIN || (c.tenant?.ativo && !c.tenant.bloqueado),
  )

  await auditar(ctxPlataforma(), null, {
    acao: 'senha.esqueci.pedido',
    detalhes: { email: mascarar(email), contas: elegiveis.length },
    ip: entrada.ip,
    userAgent: entrada.userAgent,
  })

  for (const conta of elegiveis) {
    const ctx = ctxDaConta(conta.tenantId)

    const token = novoToken()
    const aberto = await abrirPedido({
      userId: conta.id,
      tenantId: conta.tenantId,
      tokenHash: hashToken(token),
      ip: entrada.ip ?? null,
    })

    // Recusado pelo freio: já existe um link vivo, mandado há menos de dois
    // minutos. Sair em silêncio é o certo — a pessoa já tem o link.
    if (!aberto) continue

    const numero = normalizarNumero(conta.telefone)
    const entregue = numero
      ? await entregarPorWhatsapp({
          tenantId: conta.tenantId,
          numero,
          nome: conta.nome,
          empresa: conta.tenant?.nome ?? null,
          link: linkDe(token),
        })
      : false

    await auditar(ctx, null, {
      acao: entregue ? 'senha.esqueci.entregue' : 'senha.esqueci.sem_canal',
      entidade: 'usuario',
      entidadeId: conta.id,
      detalhes: entregue ? { canal: 'whatsapp' } : { motivo: numero ? 'envio falhou' : 'sem telefone' },
      ip: entrada.ip,
      userAgent: entrada.userAgent,
      // Sem canal não é ataque, mas é uma pessoa que ficou sem saída: precisa
      // saltar na trilha para alguém resolver, não se perder no meio dela.
      negado: !entregue,
    })
  }
}

/** Grava o pedido pela função do banco. Devolve `false` quando o freio barrou. */
async function abrirPedido(d: {
  userId: string
  tenantId: string | null
  tokenHash: string
  ip: string | null
}): Promise<boolean> {
  const linhas = await prisma.$queryRaw<Array<{ ok: boolean }>>`
    SELECT app.criar_recuperacao(
      ${d.userId}, ${d.tenantId ?? ''}, ${d.tokenHash},
      ${MINUTOS_DE_VIDA}, ${ESPERA_SEGUNDOS}, ${d.ip ?? ''}
    ) AS ok
  `
  return linhas[0]?.ok === true
}

/**
 * Manda o link pelo WhatsApp da empresa da pessoa.
 *
 * Falha aqui NÃO derruba o pedido: o link já existe e já está válido. Só não
 * chegou — e é exatamente isso que a trilha vai registrar, para alguém entregar
 * de outro jeito.
 */
async function entregarPorWhatsapp(d: {
  tenantId: string | null
  numero: string
  nome: string
  empresa: string | null
  link: string
}): Promise<boolean> {
  // Sem empresa não há instância: é o caso do dono da plataforma, que não é
  // funcionário de franquia nenhuma. Para ele existe a saída de terminal.
  if (!d.tenantId) return false

  try {
    const token = await tokenDaEmpresa({ tenantId: d.tenantId, userId: null, ehSuperAdmin: false })
    if (!token) return false

    await enviarTexto({ token, numero: d.numero, texto: textoDoAviso(d), delayMs: 600 })
    return true
  } catch {
    // O motivo do erro não pode subir para a tela: ele contaria que a conta
    // existe. Vai para a trilha como "não entregue", que é o fato.
    return false
  }
}

function textoDoAviso(d: { nome: string; empresa: string | null; link: string }): string {
  const primeiro = d.nome.trim().split(/\s+/)[0] ?? ''
  const onde = d.empresa ? ` da ${d.empresa}` : ''
  return [
    `Olá, ${primeiro}.`,
    '',
    `Alguém pediu para trocar a senha do seu acesso ao sistema${onde}.`,
    '',
    `Se foi você, abra este link — ele vale por ${MINUTOS_DE_VIDA} minutos e funciona uma vez só:`,
    d.link,
    '',
    'Se não foi você, ignore esta mensagem. Sua senha continua a mesma.',
  ].join('\n')
}

export function linkDe(token: string): string {
  return `${env.APP_URL.replace(/\/+$/, '')}/redefinir/${token}`
}

// ---------------------------------------------------------------------------
// Gastar o link
// ---------------------------------------------------------------------------

export type ResultadoRedefinicao = { ok: true } | { ok: false; motivo: string }

/**
 * Troca a senha com o token do link.
 *
 * A função do banco faz as quatro coisas juntas ou nenhuma: gasta o link, grava
 * a senha, zera o contador de tentativas e **derruba todas as sessões daquela
 * conta**. A derrubada é o passo que costuma faltar — se a conta foi tomada,
 * trocar a senha sem encerrar as sessões deixa o invasor logado exatamente onde
 * estava, e a pessoa acredita ter resolvido.
 */
export async function redefinirComToken(entrada: {
  token: string
  senha: string
  ip?: string | null
  userAgent?: string | null
}): Promise<ResultadoRedefinicao> {
  // Formato conferido antes de ir ao banco: o token é gerado por
  // `novoToken()`, que é base64url de 32 bytes. Qualquer outra coisa é lixo
  // colado na barra de endereço e não merece uma consulta.
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(entrada.token)) {
    return { ok: false, motivo: MOTIVO_LINK_RUIM }
  }

  const hash = await hashSenha(entrada.senha)

  const linhas = await prisma.$queryRaw<Array<{ user_id: string | null }>>`
    SELECT app.usar_recuperacao(${hashToken(entrada.token)}, ${hash}) AS user_id
  `
  const userId = linhas[0]?.user_id ?? null

  if (!userId) {
    await auditar(ctxPlataforma(), null, {
      acao: 'senha.esqueci.invalido',
      ip: entrada.ip,
      userAgent: entrada.userAgent,
      negado: true,
    })
    return { ok: false, motivo: MOTIVO_LINK_RUIM }
  }

  // Para registrar a troca na trilha DA EMPRESA da pessoa, e não só na da
  // plataforma: quem administra a franquia precisa ver a senha mudando lá.
  const conta = await comContextoAuth((tx) =>
    tx.user.findUnique({ where: { id: userId }, select: { tenantId: true, nome: true } }),
  )

  await auditar(ctxDaConta(conta?.tenantId ?? null), null, {
    acao: 'senha.esqueci.usado',
    entidade: 'usuario',
    entidadeId: userId,
    detalhes: { quem: conta?.nome ?? null, sessoes: 'encerradas' },
    ip: entrada.ip,
    userAgent: entrada.userAgent,
  })

  return { ok: true }
}

/**
 * Um motivo só para link inexistente, vencido e já usado.
 *
 * Separar os três diria a quem está tateando que aquele link chegou a existir —
 * e "existiu e venceu" é informação suficiente para valer a pena tentar de novo
 * mais rápido da próxima vez.
 */
const MOTIVO_LINK_RUIM =
  'Este link não vale mais. Peça um novo em "Esqueci minha senha" — cada link dura 30 minutos e só pode ser usado uma vez.'

// ---------------------------------------------------------------------------

function ctxPlataforma(): ContextoAcesso {
  return { tenantId: null, userId: null, ehSuperAdmin: true }
}

function ctxDaConta(tenantId: string | null): ContextoAcesso {
  return tenantId
    ? { tenantId, userId: null, ehSuperAdmin: false }
    : { tenantId: null, userId: null, ehSuperAdmin: true }
}

/** Guarda o e-mail na trilha sem escrever o endereço inteiro. */
function mascarar(email: string): string {
  const [u, d] = email.split('@')
  if (!u || !d) return '***'
  return `${u.slice(0, 2)}***@${d}`
}
