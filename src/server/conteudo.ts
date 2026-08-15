import { cache } from 'react'
import { prisma } from '@/lib/db'
import { CONTEUDO_PADRAO, interpretarConteudo, type Conteudo } from '@/lib/conteudo'

/**
 * A leitura do conteúdo do site.
 *
 * ---------------------------------------------------------------------------
 * POR QUE PASSA POR UMA FUNÇÃO DO BANCO
 * ---------------------------------------------------------------------------
 * A tabela `conteudo_site` só é visível para quem tem a marca de Super Admin
 * ligada na conexão. Isso é proposital: ninguém além do dono da plataforma tem
 * o que fazer nela.
 *
 * Mas o SITE é lido por quem não está logado — que é, justamente, todo mundo
 * que interessa. Sem uma saída, a home ficaria em branco para o visitante.
 *
 * A saída é `app.conteudo_publicado()`, uma função `SECURITY DEFINER` que roda
 * com os poderes de quem a criou e atravessa a política. Ela é deliberadamente
 * mínima: não recebe parâmetro, não aceita filtro, devolve uma coluna de uma
 * linha. Não há o que injetar nem o que vazar além do que já está publicado
 * para qualquer um ver.
 *
 * ---------------------------------------------------------------------------
 * POR QUE `cache`
 * ---------------------------------------------------------------------------
 * A home chama isto de vários lugares: os metadados, os dados estruturados, o
 * corpo da página. `cache` do React faz a consulta acontecer UMA vez por
 * requisição — sem ele seriam três idas ao banco para buscar a mesma linha.
 *
 * É cache por requisição, não entre requisições: salvou no painel, a próxima
 * visita já vê o novo. Nada de "espere cinco minutos".
 */
export const lerConteudo = cache(async (): Promise<Conteudo> => {
  try {
    const linhas = await prisma.$queryRaw<Array<{ dados: unknown }>>`
      SELECT app.conteudo_publicado() AS dados
    `
    const { conteudo, erro } = interpretarConteudo(linhas[0]?.dados ?? null)
    if (erro) {
      // Vale registrar: conteúdo gravado que não passa na conferência significa
      // que alguém editou o banco por fora, ou que um campo novo entrou sem
      // padrão. Nos dois casos o site segue de pé com o texto de fábrica, e
      // quem lê o log descobre por quê.
      console.warn('[conteudo] gravado não passou na conferência:', erro)
    }
    return conteudo
  } catch (e) {
    // Banco fora do ar, migração ainda não aplicada, função ausente. O site
    // institucional não pode cair por causa disso: ele é a porta de entrada dos
    // clientes, e o texto de fábrica é bom o bastante para atender.
    console.warn('[conteudo] falha ao ler do banco, usando o padrão:', e)
    return CONTEUDO_PADRAO
  }
})
