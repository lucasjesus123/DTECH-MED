import 'dotenv/config'
import { Papel } from '../src/generated/prisma/enums'
import { hashSenha } from '../src/lib/cripto'
import { comEscopo, prisma, type ContextoAcesso } from '../src/lib/db'

/**
 * Cria o Super Admin, ou redefine a senha dele.
 *
 * A semeadura (`prisma/seed.ts`) cria o Super Admin uma vez e, se ele já
 * existir, NÃO mexe na senha — de propósito, para um `db seed` acidental não
 * derrubar o acesso de quem está usando o sistema. O efeito colateral é que
 * quem esquece a senha fica trancado do lado de fora, sem saída.
 *
 * Esta é a saída. Roda quando você pede, e só quando você pede.
 *
 * COMO RODAR (na gaveta, na VPS):
 *
 *   docker compose -p dtechmed --profile manutencao run --rm \
 *     -e SUPER_EMAIL=voce@empresa.com.br \
 *     -e SUPER_SENHA='sua-senha-forte' \
 *     migrador npx tsx scripts/definir-super-admin.mts
 *
 * A senha vem por variável de ambiente e não por argumento de linha de comando
 * porque argumento aparece em `ps` para qualquer processo da máquina enquanto
 * o comando roda. Ela também não é impressa em lugar nenhum aqui.
 *
 * O usuário nasce (ou volta) com `trocarSenha`, então o sistema pede uma senha
 * nova no primeiro acesso. Não é frescura: a senha digitada neste comando já
 * passou pelo histórico do shell, e provavelmente por uma janela de chat.
 */

const SUPER: ContextoAcesso = { tenantId: null, userId: null, ehSuperAdmin: true }

const email = (process.env.SUPER_EMAIL ?? '').trim().toLowerCase()
const senha = process.env.SUPER_SENHA ?? ''
const nome = (process.env.SUPER_NOME ?? 'Super Admin').trim()

function morre(mensagem: string): never {
  console.error(`\n  ✗ ${mensagem}\n`)
  process.exit(1)
}

async function main() {
  // Validar antes de tocar no banco. Uma senha de quatro letras aceita aqui
  // vira uma conta de acesso total com senha de quatro letras.
  if (!email.includes('@')) morre('SUPER_EMAIL vazio ou sem @.')
  // Dez, e não um número escolhido aqui: é o mesmo mínimo que a tela de troca
  // de senha e o cadastro de empresa cobram. Regra diferente em cada porta é
  // regra que uma das portas não cumpre.
  if (senha.length < 10) morre('SUPER_SENHA precisa de pelo menos 10 caracteres.')

  const hash = await hashSenha(senha)

  const existente = await comEscopo(SUPER, (tx) =>
    tx.user.findFirst({ where: { email, papel: Papel.SUPER_ADMIN } }),
  )

  if (existente) {
    await comEscopo(SUPER, (tx) =>
      tx.user.update({
        where: { id: existente.id },
        data: {
          senhaHash: hash,
          trocarSenha: true,
          ativo: true,
          // Zera o bloqueio anti-força-bruta junto. Quem chega aqui muitas
          // vezes chegou depois de errar a senha até a conta travar, e sair
          // com a senha certa e a conta ainda bloqueada não resolve nada.
          tentativasFalhas: 0,
          bloqueadoAte: null,
        },
      }),
    )
    console.log(`\n  ✓ Senha redefinida para o Super Admin ${email}\n`)
  } else {
    await comEscopo(SUPER, (tx) =>
      tx.user.create({
        data: {
          tenantId: null,
          nome,
          email,
          senhaHash: hash,
          papel: Papel.SUPER_ADMIN,
          trocarSenha: true,
        },
      }),
    )
    console.log(`\n  ✓ Super Admin criado: ${email}\n`)
  }

  console.log('  Entre em /entrar. O sistema vai pedir uma senha nova.\n')
}

main()
  .catch((e) => {
    console.error('\n  ✗ Falhou:', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
