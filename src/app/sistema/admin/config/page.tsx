import Link from 'next/link'
import { redirect } from 'next/navigation'
import { comEscopo } from '@/lib/db'
import { juntarEndereco } from '@/lib/endereco'
import { exigirTela } from '@/server/sistema/guarda'
import {
  Bloco,
  CabecalhoTela,
  Chip,
  StatCardRow,
  type Stat,
} from '@/components/sistema/pecas'
import estilo from '@/components/sistema/pecas.module.css'

/**
 * CONFIGURAÇÕES DA EMPRESA.
 *
 * =============================================================================
 * O QUE ESTES CAMPOS DECIDEM, E POR QUE ISSO PRECISA ESTAR ESCRITO
 * =============================================================================
 * Eles parecem cadastro e não são. O endereço e o CNPJ daqui vão para o
 * CABEÇALHO DE TODO PDF que a empresa emite — laudo, orçamento, contrato,
 * recibo. Um CNPJ errado aqui é um contrato com CNPJ errado, assinado pelo
 * cliente.
 *
 * Por isso cada bloco diz onde aquele dado aparece. "Telefone" não significa
 * nada; "o número que o motorista disca no SOS e que sai no rodapé do laudo"
 * significa.
 *
 * =============================================================================
 * A FLAG ui_v2 APARECE AQUI, E APARECE LIGADA
 * =============================================================================
 * Quem está lendo esta tela está dentro do sistema novo — a flag está ligada
 * por definição. Mostrá-la não é redundância: é dizer à pessoa em que versão
 * ela está, para que a frase "no meu sistema não é assim" tenha resposta.
 *
 * Desligar continua sendo um `UPDATE`, feito por quem administra a plataforma.
 * Um botão de "voltar para o painel antigo" nesta tela seria a decisão mais
 * fácil de tomar por engano do sistema inteiro.
 */
export default async function ConfigDoTenant() {
  const { ctx, sessao } = await exigirTela('config')
  if (!sessao.tenantId) redirect('/sistema')

  const empresa = await comEscopo(ctx, (tx) =>
    tx.tenant.findUnique({
      where: { id: sessao.tenantId! },
      select: {
        nome: true,
        razaoSocial: true,
        cnpj: true,
        email: true,
        telefone: true,
        whatsapp: true,
        logradouro: true,
        numero: true,
        complemento: true,
        bairro: true,
        cidade: true,
        uf: true,
        cep: true,
        plano: true,
        ativo: true,
        uiV2: true,
        criadoEm: true,
        _count: { select: { usuarios: true, clientes: true, ordens: true } },
      },
    }),
  )
  if (!empresa) redirect('/sistema')

  const endereco = juntarEndereco(empresa)

  const stats: Stat[] = [
    { rotulo: 'Pessoas', valor: empresa._count.usuarios, apoio: 'com acesso', icone: 'usuarios' },
    { rotulo: 'Clientes', valor: empresa._count.clientes, apoio: 'no cadastro', icone: 'clientes' },
    { rotulo: 'O.S. no total', valor: empresa._count.ordens, apoio: 'desde o início', icone: 'ordens' },
    {
      rotulo: 'No ar desde',
      valor: empresa.criadoEm.toLocaleDateString('pt-BR'),
      apoio: `plano ${empresa.plano}`,
      icone: 'agenda',
    },
  ]

  return (
    <>
      <CabecalhoTela
        titulo="Configurações"
        apoio="O que esta empresa é, para o sistema e para os documentos que ela emite."
        acao={
          <Link href="/painel/empresas" className={estilo.acaoLinha}>
            Editar no cadastro da rede
          </Link>
        }
      />

      <StatCardRow stats={stats} />

      <div className={estilo.split}>
        <div className={estilo.blocos}>
          <Bloco titulo="Identificação">
            <div className={estilo.dinheiro}>
              <p className={estilo.dinheiroLinha}>
                <span>Nome de fantasia</span>
                <strong>{empresa.nome}</strong>
              </p>
              <p className={estilo.dinheiroLinha}>
                <span>Razão social</span>
                <strong className={empresa.razaoSocial ? undefined : estilo.vivoVago}>
                  {empresa.razaoSocial ?? 'não informada'}
                </strong>
              </p>
              <p className={estilo.dinheiroLinha}>
                <span>CNPJ</span>
                <strong className={empresa.cnpj ? undefined : estilo.vivoVago}>
                  {empresa.cnpj ?? 'não informado'}
                </strong>
              </p>
            </div>
            <p className={estilo.campoDica}>
              Estes três saem no cabeçalho de todo PDF: laudo, orçamento,
              contrato, recibo. Um CNPJ errado aqui é um contrato com CNPJ
              errado, assinado pelo cliente.
            </p>
          </Bloco>

          <Bloco titulo="Contato">
            <div className={estilo.dinheiro}>
              <p className={estilo.dinheiroLinha}>
                <span>Telefone</span>
                <strong className={empresa.telefone ? undefined : estilo.vivoVago}>
                  {empresa.telefone ?? 'não informado'}
                </strong>
              </p>
              <p className={estilo.dinheiroLinha}>
                <span>WhatsApp</span>
                <strong className={empresa.whatsapp ? undefined : estilo.vivoVago}>
                  {empresa.whatsapp ?? 'não informado'}
                </strong>
              </p>
              <p className={estilo.dinheiroLinha}>
                <span>E-mail</span>
                <strong className={empresa.email ? undefined : estilo.vivoVago}>
                  {empresa.email ?? 'não informado'}
                </strong>
              </p>
            </div>
            <p className={estilo.campoDica}>
              O telefone é o número que o motorista disca no SOS do aplicativo de
              campo. Sem ele, a tela de emergência dele fica sem a linha da
              central.
            </p>
          </Bloco>

          <Bloco titulo="Endereço">
            <p>{endereco || 'Nenhum endereço cadastrado.'}</p>
            {empresa.cep ? <p className={estilo.campoDica}>CEP {empresa.cep}</p> : null}
            <p className={estilo.campoDica}>
              É o endereço que sai nos documentos e o que o cliente usa para
              levar um aparelho pessoalmente.
            </p>
          </Bloco>
        </div>

        <aside className={estilo.blocos}>
          <Bloco titulo="Versão do sistema">
            <div className={estilo.dinheiro}>
              <p className={estilo.dinheiroLinha}>
                <span>Interface</span>
                <strong>
                  <Chip tom="ok">Sistema novo</Chip>
                </strong>
              </p>
              <p className={estilo.dinheiroLinha}>
                <span>Situação</span>
                <strong>
                  <Chip tom={empresa.ativo ? 'ok' : 'danger'}>
                    {empresa.ativo ? 'ativa' : 'suspensa'}
                  </Chip>
                </strong>
              </p>
            </div>
            <p className={estilo.campoDica}>
              Esta empresa está no redesenho, com menu por intenção, radar de
              ações pendentes e botão-da-vez. Voltar ao painel antigo é uma
              decisão de quem administra a plataforma.
            </p>
            <Link href="/painel" className={estilo.acaoLinha}>
              Abrir o painel antigo
            </Link>
          </Bloco>

          <Bloco titulo="Onde mexer em cada coisa">
            <p className={estilo.campoDica}>
              <strong>Texto dos documentos:</strong> Modelos, aqui ao lado.
            </p>
            <p className={estilo.campoDica}>
              <strong>Quem entra:</strong> Usuários &amp; Papéis.
            </p>
            <p className={estilo.campoDica}>
              <strong>Número do WhatsApp:</strong> Integrações.
            </p>
            <p className={estilo.campoDica}>
              <strong>Dados desta empresa:</strong> o cadastro da rede — é lá que
              o CNPJ e o endereço são editados, porque eles valem para o contrato
              entre a franquia e a plataforma.
            </p>
          </Bloco>
        </aside>
      </div>
    </>
  )
}
