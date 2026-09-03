'use client'

import { useActionState, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { salvarPeca } from '@/server/acoes/estoque'
import { formatarBRL } from '@/lib/dinheiro'
import estilo from '../painel.module.css'

type Resposta = { ok: true; aviso?: string } | { ok: false; motivo: string }
const inicial: Resposta = { ok: false, motivo: '' }

export type ItemParaEditar = {
  id: string
  sku: string
  nome: string
  tipo: string
  patrimonio: string | null
  categoria: string | null
  aplicacao: string | null
  unidade: string
  localizacao: string | null
  fornecedor: string | null
  precoVendaCentavos: number
  custoMedioCentavos: number
  estoqueMinimo: number
}

/**
 * O FORMULÁRIO DO ITEM — o mesmo para cadastrar e para corrigir.
 *
 * =============================================================================
 * POR QUE UM SÓ, E NÃO DOIS
 * =============================================================================
 * A tela de cadastro e a de edição pedem exatamente os mesmos campos, com as
 * mesmas regras condicionais (ferramenta tem patrimônio e não tem preço de
 * venda). Dois formulários gêmeos é a receita conhecida de um ganhar campo e o
 * outro não — e ninguém percebe até alguém reclamar que "no editar não tem o
 * fornecedor".
 *
 * =============================================================================
 * O CUSTO MÉDIO NÃO É EDITÁVEL, E A TELA DIZ POR QUÊ
 * =============================================================================
 * Ele é consequência das ENTRADAS: média ponderada recalculada a cada compra.
 * Digitá-lo por cima faria o relatório de margem mentir sem deixar rastro — e
 * o "dinheiro parado" da aba Compras, que é saldo × custo, mentiria junto.
 *
 * A ação do servidor já o ignorava na edição. O que faltava era a tela DIZER
 * isso: um campo que aceita digitação e joga fora o valor é pior que campo
 * nenhum, porque a pessoa confia que corrigiu.
 *
 * No cadastro ele aparece, porque aí ele é o custo da primeira compra — não há
 * entrada anterior de onde deduzi-lo.
 */
export default function FormularioItem({
  item,
  aoFechar,
}: {
  /** Nulo para cadastro; preenchido para correção. */
  item?: ItemParaEditar | null
  aoFechar?: () => void
}) {
  const [estado, acao, salvando] = useActionState(salvarPeca, inicial)
  const router = useRouter()
  const editando = Boolean(item)

  /**
   * QUE COISA É O ITEM — e o formulário muda com a resposta.
   *
   * Ferramenta não tem preço de venda (não se vende) e tem patrimônio (a
   * plaquinha por onde se acha a que sumiu). Peça é o contrário. Mostrar os
   * dois campos sempre faria metade da ficha ser ignorada em cada cadastro, e
   * campo ignorado é campo preenchido errado.
   */
  const [especie, setEspecie] = useState<'PECA' | 'INSUMO' | 'FERRAMENTA'>(
    (item?.tipo as 'PECA' | 'INSUMO' | 'FERRAMENTA') ?? 'PECA',
  )
  const ferramenta = especie === 'FERRAMENTA'

  /**
   * Depois de salvar uma correção, a ficha ao redor continua com os dados
   * VELHOS até alguém recarregar — e a pessoa acha que não salvou.
   *
   * `router.refresh()` mora num efeito, e não no corpo da renderização: no
   * corpo ele seria efeito colateral durante o render, e o React pode renderizar
   * duas vezes — o que dispararia duas recargas por salvamento.
   */
  useEffect(() => {
    if (editando && estado.ok) router.refresh()
  }, [estado, editando, router])

  return (
    <form action={acao} className={`${estilo.bloco} ${estilo.form}`} style={{ marginTop: 'var(--s4)' }}>
      <p className={estilo.blocoTitulo}>{editando ? 'Corrigir o cadastro' : 'Novo item do estoque'}</p>

      {!estado.ok && estado.motivo ? (
        <p className={estilo.erro} role="alert">
          {estado.motivo}
        </p>
      ) : null}
      {estado.ok && !salvando ? (
        <p className={estilo.sucesso} role="status">
          {estado.aviso ?? (editando ? 'Cadastro corrigido.' : 'Item cadastrado.')}
        </p>
      ) : null}

      {item ? <input type="hidden" name="id" value={item.id} /> : null}

      {/* O TIPO VEM PRIMEIRO porque ele muda o resto do formulário — e, mais
          que isso, muda o que o sistema faz com o item. Peça é vendida na O.S.;
          insumo é gasto no trabalho; ferramenta VOLTA, e é a única que pode
          sair emprestada. */}
      <div className={estilo.abasLista} role="radiogroup" aria-label="Que tipo de item">
        {(
          [
            ['PECA', 'Peça', 'Vendida na O.S. e entra no orçamento'],
            ['INSUMO', 'Insumo', 'Gasto no trabalho: solda, álcool, graxa'],
            ['FERRAMENTA', 'Ferramenta', 'Sai com alguém e volta — não se consome'],
          ] as const
        ).map(([v, r, nota]) => (
          <label key={v} className={estilo.abaOpcao}>
            <input
              type="radio"
              name="tipo"
              value={v}
              checked={especie === v}
              onChange={() => setEspecie(v)}
            />
            <span>
              {r}
              <span className={estilo.dica}>{nota}</span>
            </span>
          </label>
        ))}
      </div>

      <div className={estilo.grade}>
        <label className={estilo.rotulo}>
          Código *
          <input
            className={estilo.campo}
            name="sku"
            required
            maxLength={40}
            placeholder="Ex.: FT-2200"
            defaultValue={item?.sku ?? ''}
          />
        </label>
        <label className={estilo.rotulo} style={{ gridColumn: 'span 2' }}>
          Nome *
          <input
            className={estilo.campo}
            name="nome"
            required
            minLength={2}
            defaultValue={item?.nome ?? ''}
          />
        </label>
        <label className={estilo.rotulo}>
          Categoria
          <input
            className={estilo.campo}
            name="categoria"
            placeholder="Fonte, placa, sensor…"
            defaultValue={item?.categoria ?? ''}
          />
        </label>
        <label className={estilo.rotulo}>
          Unidade
          <input
            className={estilo.campo}
            name="unidade"
            defaultValue={item?.unidade ?? 'UN'}
            maxLength={6}
          />
        </label>
        <label className={estilo.rotulo}>
          Onde fica
          <input
            className={estilo.campo}
            name="localizacao"
            placeholder="Prateleira B3"
            defaultValue={item?.localizacao ?? ''}
          />
        </label>
        <label className={estilo.rotulo}>
          Fornecedor
          <input className={estilo.campo} name="fornecedor" defaultValue={item?.fornecedor ?? ''} />
        </label>

        {/* Ver o cabeçalho: na correção o custo médio é LEITURA, porque ele é
            consequência das entradas. Um campo que aceita digitação e joga
            fora o valor é pior que campo nenhum. */}
        {editando ? (
          <div className={estilo.rotulo}>
            Custo médio
            <p className={estilo.texto} style={{ margin: 0, fontWeight: 600 }}>
              {formatarBRL(item!.custoMedioCentavos)}
            </p>
            <span className={estilo.dica}>
              Não se corrige por aqui: ele é a média ponderada das entradas e muda a cada compra.
              Para acertá-lo, lance a entrada com o custo certo.
            </span>
          </div>
        ) : (
          <label className={estilo.rotulo}>
            Custo de compra (R$)
            <input
              className={estilo.campo}
              name="custoMedio"
              type="number"
              min="0"
              step="0.01"
              defaultValue={0}
            />
            <span className={estilo.dica}>
              Depois disso, o custo médio passa a ser recalculado a cada entrada.
            </span>
          </label>
        )}

        {ferramenta ? (
          <label className={estilo.rotulo}>
            Patrimônio
            <input
              className={estilo.campo}
              name="patrimonio"
              placeholder="Nº da plaquinha"
              defaultValue={item?.patrimonio ?? ''}
            />
            <span className={estilo.dica}>É por ele que se acha a ferramenta que sumiu.</span>
          </label>
        ) : (
          <label className={estilo.rotulo}>
            Preço de venda (R$)
            <input
              className={estilo.campo}
              name="precoVenda"
              type="number"
              min="0"
              step="0.01"
              defaultValue={item ? item.precoVendaCentavos / 100 : 0}
            />
          </label>
        )}

        <label className={estilo.rotulo}>
          Estoque mínimo
          <input
            className={estilo.campo}
            name="estoqueMinimo"
            type="number"
            min="0"
            step="0.001"
            defaultValue={item?.estoqueMinimo ?? 0}
          />
          <span className={estilo.dica}>
            {ferramenta
              ? 'Quantas você precisa ter sempre na parede.'
              : 'Abaixo disso, a peça grita no Dashboard.'}
          </span>
        </label>
      </div>

      <label className={estilo.rotulo}>
        {ferramenta ? 'Para que serve' : 'Em que equipamentos serve'}
        <input
          className={estilo.campo}
          name="aplicacao"
          placeholder={ferramenta ? 'Onde esta ferramenta é usada' : 'Modelos compatíveis'}
          defaultValue={item?.aplicacao ?? ''}
        />
      </label>

      {/* A FOTO ENTRA AQUI, no cadastro, e não num segundo passo.
          Ela existia só depois do item nascer — e "cadastre agora, fotografe
          depois" é um passo que ninguém dá. O resultado era um catálogo sem
          foto, que é o mesmo que catálogo nenhum. Se ela falhar, o item
          continua cadastrado. */}
      <label className={estilo.rotulo}>
        {ferramenta ? 'Foto da ferramenta' : 'Foto da peça'}
        <input className={estilo.campo} type="file" name="foto" accept="image/*" />
        <span className={estilo.dica}>
          {editando
            ? 'Escolher uma nova troca a que está lá. Deixe em branco para manter.'
            : 'Opcional. É por ela que se acha a certa na prateleira — dá para trocar depois.'}
        </span>
      </label>

      <div className={estilo.acoesForm}>
        {aoFechar ? (
          <button type="button" className={estilo.btnSec} onClick={aoFechar}>
            {estado.ok && !salvando ? 'Fechar' : 'Cancelar'}
          </button>
        ) : null}
        <button type="submit" className={estilo.btn} disabled={salvando}>
          {salvando ? 'Salvando…' : editando ? 'Salvar correção' : 'Cadastrar'}
        </button>
      </div>
    </form>
  )
}
