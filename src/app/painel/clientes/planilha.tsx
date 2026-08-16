'use client'

import { useRef, useState, useTransition } from 'react'
import { importarClientes, type RelatorioImportacao } from '@/server/acoes/clientes-importar'
import estilo from '../painel.module.css'

/**
 * Exportar e importar a carteira em planilha.
 *
 * ---------------------------------------------------------------------------
 * POR QUE CONFERIR ANTES DE GRAVAR
 * ---------------------------------------------------------------------------
 * Importação de planilha é a operação mais fácil de estragar em massa: um
 * arquivo errado sobrescreve trezentos cadastros de uma vez, e não tem botão de
 * desfazer.
 *
 * Então o caminho tem dois passos, e o primeiro não toca no banco. A pessoa
 * escolhe o arquivo, o sistema lê inteiro e responde: tantos entram novos,
 * tantos são atualizados, e estas aqui foram recusadas com o número da linha e
 * o motivo. Só depois de olhar isso é que aparece o botão de gravar.
 *
 * O passo a mais custa cinco segundos. O que ele evita custa uma tarde.
 */
export default function Planilha() {
  const [aberto, setAberto] = useState(false)
  const [relatorio, setRelatorio] = useState<RelatorioImportacao | null>(null)
  const [trabalhando, iniciar] = useTransition()
  const entrada = useRef<HTMLInputElement>(null)

  function rodar(modo: 'conferir' | 'gravar') {
    const arquivo = entrada.current?.files?.[0]
    if (!arquivo) return
    iniciar(async () => {
      const r = await importarClientes({ arquivo, modo })
      setRelatorio(r)
      // Depois de gravar, o arquivo sai do campo. Sem isso, um segundo clique
      // no mesmo botão importaria a mesma planilha de novo — e a pessoa
      // pensaria que dobrou a carteira.
      if (modo === 'gravar' && r.ok && entrada.current) entrada.current.value = ''
    })
  }

  return (
    <div className={estilo.cartao}>
      <div className={estilo.planilhaTopo}>
        <div>
          <h2 className={estilo.cartaoTitulo}>Planilha de clientes</h2>
          <p className={estilo.cartaoNota}>
            Baixe a carteira inteira, corrija no Excel e suba de volta. O arquivo que sai
            daqui é o mesmo formato que entra.
          </p>
        </div>
        <div className={estilo.planilhaBotoes}>
          {/* Link comum, e não botão com JavaScript: baixar arquivo é o
              navegador pedindo um endereço. Funciona com clique do meio, com
              "salvar como", e sem script nenhum. */}
          <a href="/painel/clientes/exportar" className={estilo.btnPrimario} download>
            Exportar todos
          </a>
          <button
            type="button"
            className={estilo.btnLinha}
            onClick={() => { setAberto((v) => !v); setRelatorio(null) }}
          >
            {aberto ? 'Fechar importação' : 'Importar planilha'}
          </button>
        </div>
      </div>

      {aberto ? (
        <div className={estilo.planilhaCorpo}>
          <label className={estilo.campoArquivo}>
            <span>Arquivo CSV</span>
            <input
              ref={entrada}
              type="file"
              accept=".csv,text/csv"
              onChange={() => setRelatorio(null)}
            />
          </label>

          <p className={estilo.cartaoNota}>
            Precisa ter, no mínimo, as colunas <strong>Nome</strong> e{' '}
            <strong>Documento</strong> (CPF ou CNPJ). As outras são opcionais:
            WhatsApp, Telefone, E-mail, Contato, CEP, Logradouro, Número, Bairro,
            Cidade, UF, Observações. Quem já existe é atualizado pelo CPF/CNPJ, e
            coluna em branco não apaga o que já estava.
          </p>

          <div className={estilo.planilhaBotoes}>
            <button
              type="button"
              className={estilo.btnLinha}
              onClick={() => rodar('conferir')}
              disabled={trabalhando}
            >
              {trabalhando ? 'Lendo…' : '1. Conferir sem gravar'}
            </button>
            <button
              type="button"
              className={estilo.btnPrimario}
              onClick={() => rodar('gravar')}
              // Só libera depois da conferência, e só se houver o que gravar.
              disabled={
                trabalhando ||
                !relatorio?.ok ||
                relatorio.modo !== 'conferir' ||
                relatorio.novos + relatorio.atualizados === 0
              }
            >
              2. Gravar
            </button>
          </div>

          {relatorio ? <Relatorio r={relatorio} /> : null}
        </div>
      ) : null}
    </div>
  )
}

function Relatorio({ r }: { r: RelatorioImportacao }) {
  if (!r.ok) return <p className={estilo.erro} role="alert">{r.motivo}</p>

  const gravou = r.modo === 'gravar'
  return (
    <div className={estilo.planilhaRelatorio} role="status">
      <p className={gravou ? estilo.sucesso : estilo.aviso}>
        {gravou
          ? `Pronto. ${r.novos} ${r.novos === 1 ? 'cliente novo' : 'clientes novos'} e ` +
            `${r.atualizados} ${r.atualizados === 1 ? 'atualizado' : 'atualizados'}.`
          : `Conferido, nada foi gravado. ${r.lidas} ${r.lidas === 1 ? 'linha lida' : 'linhas lidas'}: ` +
            `${r.novos} ${r.novos === 1 ? 'entraria novo' : 'entrariam novos'} e ` +
            `${r.atualizados} ${r.atualizados === 1 ? 'seria atualizado' : 'seriam atualizados'}.`}
      </p>

      {r.recusadas.length > 0 ? (
        <>
          <p className={estilo.cartaoNota}>
            <strong>{r.recusadas.length}</strong>{' '}
            {r.recusadas.length === 1 ? 'linha recusada' : 'linhas recusadas'}. As outras
            {gravou ? ' entraram' : ' entram'} do mesmo jeito — corrija estas e suba só elas
            depois.
          </p>
          <ul className={estilo.planilhaRecusas}>
            {r.recusadas.slice(0, 60).map((x) => (
              <li key={`${x.linha}-${x.motivo}`}>
                <strong>linha {x.linha}</strong> · {x.nome} — {x.motivo}
              </li>
            ))}
          </ul>
          {r.recusadas.length > 60 ? (
            <p className={estilo.cartaoNota}>
              e mais {r.recusadas.length - 60}. Corrija estas primeiro e confira de novo.
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  )
}
