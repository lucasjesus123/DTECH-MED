import 'dotenv/config'
import { hashToken, novoToken } from '../src/lib/cripto'
import { comContextoAuth, prisma } from '../src/lib/db'
import { linkDe } from '../src/server/auth/recuperacao'

/**
 * Gera um link de recuperação e IMPRIME na tela.
 *
 * =============================================================================
 * PARA QUE EXISTE, JÁ QUE A TELA "ESQUECI MINHA SENHA" EXISTE
 * =============================================================================
 * Porque a tela depende de um canal, e o canal pode não existir ainda:
 *
 *   • A empresa não conectou o WhatsApp — é o caso de toda franquia no primeiro
 *     dia, e continua sendo enquanto ninguém apertar "conectar".
 *   • A pessoa foi cadastrada sem telefone.
 *   • O dono da plataforma, que não é funcionário de empresa nenhuma e por isso
 *     não tem instância de WhatsApp para chamar de sua.
 *
 * Nesses casos a tela abre o pedido e a trilha registra "sem canal" — está
 * certo, mas não resolve o dia de quem ficou de fora. Isto resolve.
 *
 * Para o dono da plataforma existe também `definir-super-admin.mts`, que troca
 * a senha direto. A diferença: lá VOCÊ escolhe a senha e ela passa pelo
 * histórico do shell; aqui o link vai para a pessoa e é ELA quem escolhe. Para
 * devolver o acesso de outra pessoa, o link é o caminho certo — ninguém além
 * dela precisa saber a senha dela.
 *
 * =============================================================================
 * COMO RODAR (na gaveta, na VPS)
 * =============================================================================
 *   docker compose -p dtechmed --profile manutencao run --rm \
 *     -e ALVO_EMAIL=pessoa@empresa.com.br \
 *     migrador npx tsx scripts/link-de-recuperacao.mts
 *
 * O e-mail vai por variável de ambiente e não por argumento pelo mesmo motivo
 * do outro script: argumento aparece em `ps` para qualquer processo da máquina.
 *
 * =============================================================================
 * O LINK É UMA CHAVE
 * =============================================================================
 * Quem tem o link troca a senha daquela conta, sem mais nada. Vale 30 minutos e
 * funciona uma vez só, mas dentro dessa janela ele É o acesso. Entregue pessoa
 * a pessoa. Não cole em grupo, não deixe no histórico de um chat de equipe.
 */

const MINUTOS = 30

async function main() {
  const email = (process.env.ALVO_EMAIL ?? '').trim().toLowerCase()
  if (!email) {
    console.error('Faltou ALVO_EMAIL. Exemplo: -e ALVO_EMAIL=pessoa@empresa.com.br')
    process.exit(1)
  }

  const contas = await comContextoAuth((tx) =>
    tx.user.findMany({
      where: { email, ativo: true },
      select: {
        id: true,
        nome: true,
        papel: true,
        tenantId: true,
        tenant: { select: { nome: true, ativo: true, bloqueado: true } },
      },
    }),
  )

  if (contas.length === 0) {
    // Aqui PODE dizer que não existe: quem roda isto já está dentro do
    // servidor. O silêncio da tela pública protege contra quem está fora, e
    // repeti-lo aqui só faria você perder tempo procurando erro de digitação.
    console.error(`Nenhuma conta ATIVA com o e-mail ${email}.`)
    process.exit(1)
  }

  for (const c of contas) {
    const suspensa = c.papel !== 'SUPER_ADMIN' && (!c.tenant?.ativo || c.tenant?.bloqueado)

    console.log('')
    console.log('─'.repeat(72))
    console.log(`  ${c.nome}  ·  ${c.papel}  ·  ${c.tenant?.nome ?? 'plataforma'}`)

    if (suspensa) {
      // Gerar o link seria enganoso: a pessoa trocaria a senha e continuaria
      // sem conseguir entrar, porque o login recusa antes por causa da empresa.
      console.log('  A EMPRESA ESTÁ SUSPENSA — reative antes, senão o login recusa mesmo com a senha nova.')
      continue
    }

    const token = novoToken()

    // Pela MESMA função que a tela usa. Um caminho paralelo aqui viraria, com o
    // tempo, um caminho com regras diferentes — sem o freio, sem a invalidação
    // do link anterior — e ninguém lembraria de manter os dois iguais.
    const linhas = await prisma.$queryRaw<Array<{ ok: boolean }>>`
      SELECT app.criar_recuperacao(
        ${c.id}, ${c.tenantId ?? ''}, ${hashToken(token)}, ${MINUTOS}, ${0}, ${'terminal'}
      ) AS ok
    `

    if (linhas[0]?.ok !== true) {
      console.log('  Não foi possível abrir o pedido. Tente de novo.')
      continue
    }

    console.log('')
    console.log(`  ${linkDe(token)}`)
    console.log('')
    console.log(`  Vale ${MINUTOS} minutos e funciona uma vez só. Entregue em mãos.`)
  }

  console.log('')
  console.log('─'.repeat(72))
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
