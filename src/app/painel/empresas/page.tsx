import type { Metadata } from 'next'
import { exigirSuperAdmin } from '@/server/auth/guarda'
import { formatarBRL } from '@/lib/dinheiro'
import { listarEmpresas, listarUsuarios } from '@/server/consultas/listas'
import Empresas from './empresas'
import estilo from '../painel.module.css'

export const metadata: Metadata = { title: 'Empresas', robots: { index: false } }
export const dynamic = 'force-dynamic'

/**
 * A plataforma vista de cima.
 *
 * Esta é a única tela do sistema em que a consulta legitimamente atravessa a
 * fronteira entre franquias, e ainda assim ela mostra só o que administrar um
 * contrato exige: nome, plano, quantos usuários, quantas ordens, se o WhatsApp
 * está de pé. Nenhum dado de cliente final aparece aqui — o dono da plataforma
 * não precisa ver a carteira de ninguém para cobrar mensalidade, e o que não é
 * exibido não vaza.
 */
export default async function PaginaEmpresas() {
  const { ctx } = await exigirSuperAdmin()

  const [empresas, usuarios] = await Promise.all([listarEmpresas(), listarUsuarios(ctx)])

  const operando = empresas.filter((e) => e.online > 0).length
  const pessoasOnline = empresas.reduce((s, e) => s + e.online, 0)

  return (
    <>
      <div className={estilo.cab}>
        <div>
          <p className={estilo.grav}>Plataforma</p>
          <h1 className={estilo.titulo}>Empresas</h1>
        </div>
      </div>

      <div className={estilo.resumo}>
        <Indicador rotulo="Empresas" valor={String(empresas.length)} nota="na rede" />
        <Indicador
          rotulo="Ativas"
          valor={String(empresas.filter((e) => !e.bloqueado).length)}
          nota="sem suspensão"
        />
        {/* O número que responde "a rede está viva agora?" — e é a pergunta
            que se faz ao abrir esta tela de manhã. */}
        <Indicador
          rotulo="Operando agora"
          valor={String(operando)}
          nota={
            operando === 0
              ? 'nenhuma franquia com gente dentro'
              : `${pessoasOnline} ${pessoasOnline === 1 ? 'pessoa' : 'pessoas'} trabalhando`
          }
        />
        <Indicador
          rotulo="Recebido no mês"
          valor={formatarBRL(empresas.reduce((s, e) => s + e.recebidoMes, 0))}
          nota="a rede inteira, sem estornos"
        />
        <Indicador
          rotulo="Pessoas"
          valor={String(empresas.reduce((s, e) => s + e.usuarios, 0))}
          nota="somando todas as franquias"
        />
        <Indicador
          rotulo="Na esteira"
          valor={String(empresas.reduce((s, e) => s + e.abertas, 0))}
          nota="ordens em andamento na rede"
        />
      </div>

      <Empresas
        empresas={empresas.map((e) => ({
          id: e.id,
          nome: e.nome,
          slug: e.slug,
          cnpj: e.cnpj,
          cidade: e.cidade,
          uf: e.uf,
          plano: e.plano,
          bloqueado: e.bloqueado,
          motivoBloqueio: e.motivoBloqueio,
          usuarios: e.usuarios,
          ordens: e.ordens,
          abertas: e.abertas,
          whats: e.whats,
          criadoEm: e.criadoEm.toISOString(),
          razaoSocial: e.razaoSocial,
          email: e.email,
          telefone: e.telefone,
          whatsapp: e.whatsapp,
          cep: e.cep,
          logradouro: e.logradouro,
          numero: e.numero,
          complemento: e.complemento,
          bairro: e.bairro,
          online: e.online,
          recebidoMes: e.recebidoMes,
        }))}
        usuarios={usuarios.map((u) => ({
          id: u.id,
          nome: u.nome,
          email: u.email,
          papel: u.papel,
          ativo: u.ativo,
          empresa: u.tenant?.nome ?? 'Plataforma',
          ultimoLogin: u.ultimoLogin?.toISOString() ?? null,
          trocarSenha: u.trocarSenha,
        }))}
      />
    </>
  )
}

function Indicador({ rotulo, valor, nota }: { rotulo: string; valor: string; nota: string }) {
  return (
    <div className={estilo.indicador}>
      <span className={estilo.grav}>{rotulo}</span>
      <strong className={estilo.indValor}>{valor}</strong>
      <span className={estilo.indNota}>{nota}</span>
    </div>
  )
}
