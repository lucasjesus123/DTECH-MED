'use client'

import { useActionState } from 'react'
import { salvarWhatsappDaPlataforma } from '@/server/acoes/plataforma'
import estilo from '../painel.module.css'

type Resposta = { ok: true; mensagem?: string } | { ok: false; motivo: string }
const inicial: Resposta = { ok: false, motivo: '' }

type Conf = {
  baseUrl: string
  origemUrl: 'tela' | 'ambiente'
  temToken: boolean
  origemToken: 'tela' | 'ambiente' | 'nenhuma'
  atualizadoEm: string | null
}

/**
 * Os dois campos que ligam a rede inteira ao provedor de WhatsApp.
 *
 * ---------------------------------------------------------------------------
 * POR QUE O TOKEN APARECE VAZIO MESMO ESTANDO CONFIGURADO
 * ---------------------------------------------------------------------------
 * Porque ele nunca volta do servidor. Um campo de senha preenchido com o valor
 * de verdade é um valor de verdade viajando pela rede, parando no cache do
 * navegador e no histórico de quem usa gerenciador de senhas — para nada, já
 * que ninguém precisa LER o token, só trocá-lo.
 *
 * Então o campo em branco quer dizer "não mexi nele". Quem quer trocar, digita
 * o novo. Quem só veio corrigir o endereço, salva com o campo vazio e o token
 * continua onde estava. A frase ao lado do campo diz isso com todas as letras,
 * porque campo vazio é ambíguo por natureza e a leitura errada aqui apaga a
 * chave da rede inteira.
 */
export default function ContaWhatsapp({ conf }: { conf: Conf }) {
  const [estado, acao, salvando] = useActionState(salvarWhatsappDaPlataforma, inicial)

  return (
    <form action={acao} className={`${estilo.bloco} ${estilo.form}`}>
      <p className={estilo.blocoTitulo}>A conta da rede na uazapi</p>

      {!estado.ok && estado.motivo ? (
        <p className={estilo.erro} role="alert">
          {estado.motivo}
        </p>
      ) : null}
      {estado.ok && estado.mensagem ? (
        <p className={estilo.sucesso} role="status">
          {estado.mensagem}
        </p>
      ) : null}

      <p className={estilo.texto}>
        Uma conta para a plataforma inteira, e um número de WhatsApp por empresa
        pendurado nela. O contrato com o provedor é seu; o número que fala com o
        cliente é de cada franquia.
      </p>

      <div className={estilo.grade}>
        <label className={estilo.rotulo} style={{ gridColumn: 'span 2' }}>
          Server URL *
          <input
            className={estilo.campo}
            name="baseUrl"
            type="url"
            required
            defaultValue={conf.baseUrl}
            placeholder="https://free.uazapi.com"
            autoComplete="off"
          />
          <span className={estilo.dica}>
            O endereço do seu servidor uazapi, sem barra no fim.{' '}
            {conf.origemUrl === 'ambiente'
              ? 'Hoje vem do arquivo de ambiente da VPS — salvar aqui passa a mandar.'
              : 'Guardado aqui no sistema.'}
          </span>
        </label>

        <label className={estilo.rotulo} style={{ gridColumn: 'span 2' }}>
          Admin Token {conf.temToken ? '' : '*'}
          <input
            className={estilo.campo}
            name="adminToken"
            type="password"
            placeholder={conf.temToken ? '••••••••  já configurado' : 'cole aqui o token de administração'}
            autoComplete="new-password"
            required={!conf.temToken}
          />
          <span className={estilo.dica}>
            {conf.temToken ? (
              <>
                Já está configurado
                {conf.origemToken === 'ambiente' ? ', vindo do arquivo de ambiente da VPS' : ' e guardado cifrado'}.
                <strong> Deixe em branco para não mexer nele</strong> — preencha só para trocar.
              </>
            ) : (
              <>
                É a chave-mestra: ela cria e apaga as instâncias de todas as
                empresas. Fica cifrada no banco e nunca mais volta para esta tela.
              </>
            )}
          </span>
        </label>
      </div>

      <div className={estilo.acoesForm}>
        <button type="submit" className={estilo.btn} disabled={salvando}>
          {salvando ? 'Salvando…' : 'Salvar'}
        </button>
        {conf.atualizadoEm ? (
          <span className={estilo.fraco}>
            Última alteração em{' '}
            {new Date(conf.atualizadoEm).toLocaleString('pt-BR', {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
        ) : null}
      </div>
    </form>
  )
}
