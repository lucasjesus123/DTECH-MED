import type { Metadata } from 'next'
import { exigirSuperAdmin } from '@/server/auth/guarda'
import { configWhatsappParaTela } from '@/server/plataforma/config'
import { listarEmpresas } from '@/server/consultas/listas'
import ContaWhatsapp from './conta'
import estilo from '../painel.module.css'

export const metadata: Metadata = { title: 'WhatsApp da plataforma', robots: { index: false } }
export const dynamic = 'force-dynamic'

/**
 * A conta de WhatsApp da rede.
 *
 * ---------------------------------------------------------------------------
 * O DESENHO, EM UMA FRASE
 * ---------------------------------------------------------------------------
 * Uma conta na uazapi para a plataforma inteira, e uma instância de WhatsApp
 * por franquia pendurada nela. O contrato com o provedor é do dono do SaaS; o
 * número que fala com o cliente é de cada casa.
 *
 * É por isso que esta tela existe aqui em cima e a de conectar o número existe
 * lá dentro, em Retaguarda → WhatsApp: são duas perguntas diferentes, feitas
 * por duas pessoas diferentes, e juntá-las numa tela só faria o gestor de uma
 * franquia olhar para o token que controla todas as outras.
 */
export default async function PaginaWhatsappDaPlataforma() {
  const { ctx } = await exigirSuperAdmin()
  const [conf, empresas] = await Promise.all([configWhatsappParaTela(ctx), listarEmpresas()])

  const conectadas = empresas.filter((e) => e.whats === 'CONECTADA').length
  const semInstancia = empresas.filter((e) => !e.whats).length

  return (
    <>
      <div className={estilo.cab}>
        <div>
          <p className={estilo.grav}>Plataforma</p>
          <h1 className={estilo.titulo}>WhatsApp da rede</h1>
        </div>
      </div>

      <div className={estilo.resumo}>
        <Indicador
          rotulo="Conta"
          valor={conf.temToken ? 'configurada' : 'vazia'}
          nota={
            conf.origemToken === 'ambiente'
              ? 'token vindo do arquivo de ambiente'
              : conf.origemToken === 'tela'
                ? 'token guardado cifrado no banco'
                : 'nenhum número vai sair enquanto estiver assim'
          }
        />
        <Indicador rotulo="Empresas" valor={String(empresas.length)} nota="na rede" />
        <Indicador rotulo="Números conectados" valor={String(conectadas)} nota="prontos para avisar o cliente" />
        <Indicador
          rotulo="Sem instância"
          valor={String(semInstancia)}
          nota="ainda não conectaram um número"
        />
      </div>

      <ContaWhatsapp conf={conf} />

      <div className={`${estilo.quadro} ${estilo.rolaX}`} style={{ marginTop: 'var(--s5)' }}>
        <table className={estilo.tabela}>
          <thead>
            <tr>
              <th>Empresa</th>
              <th>Número</th>
              <th>Situação</th>
            </tr>
          </thead>
          <tbody>
            {empresas.map((e) => (
              <tr key={e.id}>
                <td className={estilo.forte}>{e.nome}</td>
                <td className={estilo.num}>{e.whatsNumero ?? <span className={estilo.fraco}>—</span>}</td>
                <td>
                  <span
                    className={`${estilo.tag} ${e.whats === 'CONECTADA' ? estilo.tagOk : estilo.tagNeutra}`}
                  >
                    {e.whats ? e.whats.toLowerCase() : 'sem instância'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className={estilo.fraco} style={{ marginTop: 'var(--s4)' }}>
        Quem conecta o número é cada empresa, em Retaguarda → WhatsApp, já dentro
        dela. Daqui você vê quais estão de pé — e, se quiser resolver por lá,
        entre na empresa pela visão da rede.
      </p>
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
