'use client'

import Link from 'next/link'
import { useActionState, useState } from 'react'
import { devolverFerramenta, emprestarFerramenta } from '@/server/acoes/estoque'
import estilo from '../painel.module.css'

type Resposta = { ok: true; aviso?: string } | { ok: false; motivo: string }
const inicial: Resposta = { ok: false, motivo: '' }

export type FerramentaDisponivel = {
  id: string
  sku: string
  nome: string
  patrimonio: string | null
  livre: number
  unidade: string
}

export type EmCampo = {
  id: string
  pecaId: string
  nome: string
  sku: string
  patrimonio: string | null
  quantidade: number
  responsavelNome: string
  ordemId: string | null
  ordemNumero: number | null
  retiradoEm: string
  previstoPara: string | null
  diasFora: number
  atrasada: boolean
}

export type Pessoa = { id: string; nome: string; papel: string }

/**
 * COM QUEM ESTÁ CADA FERRAMENTA.
 *
 * =============================================================================
 * A TELA É A LISTA DO QUE ESTÁ FORA, E NÃO O CATÁLOGO
 * =============================================================================
 * O catálogo de ferramentas está na aba Itens, junto com o resto. Aqui a
 * pergunta é outra e só uma: o que saiu e ainda não voltou. Começar pelo
 * catálogo faria a pessoa procurar, entre quarenta ferramentas paradas na
 * parede, as três que estão na rua.
 *
 * A ordem é pela MAIS ANTIGA primeiro, porque a ferramenta que some é a que
 * está fora há quatro meses e ninguém lembra — ela nunca está no topo de uma
 * lista ordenada por data decrescente.
 *
 * =============================================================================
 * DEVOLVER É UM BOTÃO NA PRÓPRIA LINHA
 * =============================================================================
 * Devolução é o gesto mais frequente desta tela e acontece com a ferramenta na
 * mão, na bancada, muitas vezes pelo celular. Um formulário separado, com um
 * `select` de empréstimos abertos, seria três toques a mais para uma ação de
 * um — e o custo de não registrar é a ferramenta continuar "fora" para sempre.
 */
export default function Ferramentas({
  emCampo,
  disponiveis,
  pessoas,
  podeMexer,
}: {
  emCampo: EmCampo[]
  disponiveis: FerramentaDisponivel[]
  pessoas: Pessoa[]
  podeMexer: boolean
}) {
  const [abrindo, setAbrindo] = useState(false)
  const [estadoEmp, acaoEmp, salvandoEmp] = useActionState(emprestarFerramenta, inicial)
  const [estadoDev, acaoDev, salvandoDev] = useActionState(devolverFerramenta, inicial)
  /** Qual linha está com o campo de condição aberto. */
  const [devolvendo, setDevolvendo] = useState<string | null>(null)

  const atrasadas = emCampo.filter((e) => e.atrasada).length

  return (
    <>
      {podeMexer ? (
        <div className={estilo.acoesForm} style={{ marginBottom: 'var(--s4)' }}>
          <button
            type="button"
            className={abrindo ? estilo.btn : estilo.btnPrimario}
            onClick={() => setAbrindo(!abrindo)}
          >
            {abrindo ? 'Fechar' : 'Registrar saída de ferramenta'}
          </button>
        </div>
      ) : null}

      {abrindo ? (
        <form action={acaoEmp} className={`${estilo.bloco} ${estilo.form}`} style={{ marginBottom: 'var(--s4)' }}>
          <p className={estilo.blocoTitulo}>Quem está levando o quê</p>
          {!estadoEmp.ok && estadoEmp.motivo ? (
            <p className={estilo.erro} role="alert">
              {estadoEmp.motivo}
            </p>
          ) : null}
          {estadoEmp.ok ? (
            <p className={estilo.sucesso} role="status">
              Saída registrada. A ferramenta continua sendo da empresa — ela só mudou de lugar.
            </p>
          ) : null}

          {disponiveis.length === 0 ? (
            <p className={estilo.texto}>
              Nenhuma ferramenta disponível para sair. Cadastre um item com o tipo{' '}
              <strong>Ferramenta</strong> na aba Itens e dê entrada nele.
            </p>
          ) : (
            <>
              <div className={estilo.grade}>
                <label className={estilo.rotulo} style={{ gridColumn: 'span 2' }}>
                  Ferramenta *
                  <select className={estilo.selecao} name="pecaId" required style={{ width: '100%' }}>
                    <option value="">Escolha…</option>
                    {disponiveis.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.sku} — {f.nome}
                        {f.patrimonio ? ` (patr. ${f.patrimonio})` : ''} · {f.livre} {f.unidade}{' '}
                        {f.livre === 1 ? 'disponível' : 'disponíveis'}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={estilo.rotulo}>
                  Quem está levando *
                  <select className={estilo.selecao} name="responsavelId" required style={{ width: '100%' }}>
                    <option value="">Escolha…</option>
                    {pessoas.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nome}
                      </option>
                    ))}
                  </select>
                  <span className={estilo.dica}>
                    O nome fica gravado no registro, e continua lá mesmo que a pessoa saia da equipe.
                  </span>
                </label>
                <label className={estilo.rotulo}>
                  Quantidade
                  <input
                    className={estilo.campo}
                    name="quantidade"
                    type="number"
                    min="0.001"
                    step="0.001"
                    defaultValue={1}
                  />
                </label>
                <label className={estilo.rotulo}>
                  Previsão de volta
                  <input className={estilo.campo} name="previstoPara" type="date" />
                  <span className={estilo.dica}>
                    Opcional — mas é o que faz a ferramenta aparecer como atrasada em vez de sumir
                    devagar.
                  </span>
                </label>
              </div>

              <label className={estilo.rotulo}>
                Para quê
                <input
                  className={estilo.campo}
                  name="observacao"
                  placeholder="Atendimento externo, bancada, empréstimo a parceiro…"
                />
              </label>

              <div className={estilo.acoesForm}>
                <button type="submit" className={estilo.btn} disabled={salvandoEmp}>
                  {salvandoEmp ? 'Registrando…' : 'Registrar saída'}
                </button>
              </div>
            </>
          )}
        </form>
      ) : null}

      {!estadoDev.ok && estadoDev.motivo ? (
        <p className={estilo.erro} role="alert">
          {estadoDev.motivo}
        </p>
      ) : null}

      {emCampo.length === 0 ? (
        <p className={estilo.vazio}>
          Nenhuma ferramenta fora. Tudo o que a empresa tem está na prateleira — que é exatamente o
          que esta tela existe para conseguir afirmar.
        </p>
      ) : (
        <>
          <p className={estilo.dica} style={{ marginBottom: 'var(--s3)' }}>
            {emCampo.length} {emCampo.length === 1 ? 'ferramenta está' : 'ferramentas estão'} fora
            {atrasadas > 0 ? (
              <>
                {' '}
                — <strong>{atrasadas}</strong> {atrasadas === 1 ? 'passou' : 'passaram'} da data
                prometida de volta
              </>
            ) : null}
            . As mais antigas vêm primeiro: é a esquecida que esta lista existe para achar.
          </p>

          <ul className={estilo.colunaLista}>
            {emCampo.map((e) => (
              <li key={e.id} className={estilo.bloco}>
                <div className={estilo.modeloCartaoTopo}>
                  <div>
                    <p className={estilo.modeloCartaoNome}>
                      <Link href={`/painel/estoque/${e.pecaId}`}>{e.nome}</Link>
                      {e.quantidade !== 1 ? (
                        <span className={estilo.fraco}> · {e.quantidade} unidades</span>
                      ) : null}
                    </p>
                    <p className={estilo.dica}>
                      {e.sku}
                      {e.patrimonio ? ` · patrimônio ${e.patrimonio}` : ''}
                    </p>
                    <p className={estilo.texto} style={{ marginTop: 'var(--s2)' }}>
                      Com <strong>{e.responsavelNome}</strong> desde {e.retiradoEm}
                      {e.ordemNumero ? (
                        <>
                          {' '}
                          · O.S.{' '}
                          <Link href={`/painel/ordens/${e.ordemId}`}>
                            #{String(e.ordemNumero).padStart(4, '0')}
                          </Link>
                        </>
                      ) : null}
                    </p>
                  </div>
                  <div className={estilo.selosCab}>
                    {/* O número de dias é o que denuncia a esquecida. A partir
                        de três: "há 0 dias" em toda saída de hoje é ruído. */}
                    {e.diasFora >= 3 ? (
                      <span
                        className={`${estilo.tag} ${e.diasFora >= 30 ? estilo.tagAlerta : estilo.tagNeutra}`}
                      >
                        {e.diasFora} dias fora
                      </span>
                    ) : null}
                    {e.atrasada ? (
                      <span className={`${estilo.tag} ${estilo.tagAlerta}`}>
                        prometida para {e.previstoPara}
                      </span>
                    ) : e.previstoPara ? (
                      <span className={`${estilo.tag} ${estilo.tagEspera}`}>volta {e.previstoPara}</span>
                    ) : null}
                  </div>
                </div>

                {podeMexer ? (
                  devolvendo === e.id ? (
                    <form action={acaoDev} className={estilo.form}>
                      <input type="hidden" name="emprestimoId" value={e.id} />
                      <label className={estilo.rotulo}>
                        Como voltou
                        <input
                          className={estilo.campo}
                          name="condicaoVolta"
                          placeholder="Ex.: voltou sem a ponteira; bateria viciada"
                          autoFocus
                        />
                        <span className={estilo.dica}>
                          Opcional. É aqui que a avaria fica escrita no dia em que aconteceu, e não
                          na discussão de três meses depois.
                        </span>
                      </label>
                      <div className={estilo.acoesForm}>
                        <button
                          type="button"
                          className={estilo.btnSec}
                          onClick={() => setDevolvendo(null)}
                        >
                          Cancelar
                        </button>
                        <button type="submit" className={estilo.btn} disabled={salvandoDev}>
                          {salvandoDev ? 'Registrando…' : 'Confirmar devolução'}
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div className={estilo.modeloCartaoAcoes}>
                      <button
                        type="button"
                        className={estilo.btnPrimario}
                        onClick={() => setDevolvendo(e.id)}
                      >
                        Devolveu
                      </button>
                    </div>
                  )
                ) : null}
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  )
}
