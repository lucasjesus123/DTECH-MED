'use client'

import { useActionState, useState } from 'react'
import { salvarEquipamento } from '@/server/acoes/cadastros'
import estilo from '../painel.module.css'

type Resposta = { ok: true; mensagem?: string } | { ok: false; motivo: string }
const inicial: Resposta = { ok: false, motivo: '' }

/** O que o formulário precisa saber para EDITAR. Ausente, ele cadastra. */
export type EquipamentoParaEditar = {
  id: string
  clienteId: string | null
  clienteNome: string | null
  marca: string
  modelo: string
  numeroSerie: string | null
  patrimonio: string | null
  categoria: string | null
  voltagem: string | null
  anoFabricacao: number | null
  acessorios: string | null
  observacoes: string | null
  temFoto: boolean
}

/**
 * CADASTRAR E CORRIGIR UM EQUIPAMENTO — o mesmo formulário.
 *
 * =============================================================================
 * POR QUE UM SÓ, E NÃO UM IRMÃO PARA EDITAR
 * =============================================================================
 * São os mesmos doze campos, as mesmas regras e a mesma ação de servidor
 * (`salvarEquipamento` já fazia os dois: com `id`, atualiza). Um segundo
 * formulário seria um segundo lugar para lembrar que "ano em branco é ausência,
 * não zero" — e dois lugares assim é ter um que vai esquecer.
 *
 * O que muda entre os dois modos é o que TEM de mudar: o título, o verbo do
 * botão, os valores iniciais, e os três avisos abaixo, que só fazem sentido
 * quando já existe um aparelho com história.
 *
 * =============================================================================
 * OS TRÊS CUIDADOS DA CORREÇÃO
 * =============================================================================
 *
 * 1. TROCAR O DONO MUDA DE LUGAR A VIDA INTEIRA DA MÁQUINA.
 *    O prontuário pendura no equipamento, não no cliente: toda ordem, toda
 *    peça trocada, toda garantia. Passar o aparelho para outro cliente leva
 *    tudo junto — e é uma operação legítima (clínica vendeu o aparelho,
 *    cadastro duplicado sendo unificado), que só não pode acontecer por
 *    distração num `select`. Por isso o aviso aparece VIVO, no instante em que
 *    o campo muda, e não numa nota fixa que ninguém lê.
 *
 * 2. O NÚMERO DE SÉRIE É A IDENTIDADE FÍSICA.
 *    É por ele que o histórico se amarra. O servidor já recusa duplicata; aqui
 *    a tela diz para que serve, para que a correção seja consciente.
 *
 * 3. A FOTO EM BRANCO NÃO APAGA A FOTO.
 *    Campo de arquivo vazio é o estado normal de quem veio corrigir a
 *    voltagem — e se isso limpasse a imagem, a pessoa perderia a foto sem ter
 *    pedido. O servidor só grava quando vem arquivo; a tela diz isso com todas
 *    as letras, porque a dúvida aparece na hora de salvar.
 */
export default function FormularioEquipamento({
  clientes,
  equipamento,
}: {
  clientes: Array<{ id: string; nome: string }>
  equipamento?: EquipamentoParaEditar
}) {
  const [estado, acao, pendente] = useActionState(salvarEquipamento, inicial)
  const editando = Boolean(equipamento)

  // O dono escolhido AGORA, para comparar com o de antes. Só isto: nenhuma
  // outra troca deste formulário muda o significado do que já está gravado.
  const [donoAgora, setDonoAgora] = useState(equipamento?.clienteId ?? '')
  const donoMudou = editando && donoAgora !== (equipamento?.clienteId ?? '')
  const nomeDoNovoDono = clientes.find((c) => c.id === donoAgora)?.nome

  return (
    <form action={acao} className={`${estilo.bloco} ${estilo.form}`}>
      <p className={estilo.blocoTitulo}>
        {editando ? `Corrigir ${equipamento!.marca} ${equipamento!.modelo}` : 'Novo equipamento'}
      </p>

      {/* O id vai escondido: é ele que faz a ação atualizar em vez de criar. */}
      {editando ? <input type="hidden" name="id" value={equipamento!.id} /> : null}

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

      <div className={estilo.grade}>
        {/* O DONO É OPCIONAL, e isso é o que faz esta tela ser um catálogo.
            Ver o cabeçalho de `salvarEquipamento`: obrigar o dono aqui
            obrigava a inventar um cliente para cadastrar um aparelho que
            ainda estava chegando. */}
        <label className={estilo.rotulo} style={{ gridColumn: 'span 2' }}>
          Cliente dono
          <select
            className={estilo.selecao}
            name="clienteId"
            value={donoAgora}
            onChange={(e) => setDonoAgora(e.target.value)}
            style={{ width: '100%' }}
          >
            <option value="">Sem dono ainda — só catálogo</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
          {donoMudou ? (
            <span className={estilo.avisoCaixaForte} role="status">
              <strong>Isto muda o dono do aparelho.</strong> Todo o prontuário — as{' '}
              ordens, as peças trocadas e a garantia — vai junto de{' '}
              {equipamento!.clienteNome ?? 'sem dono'} para{' '}
              {nomeDoNovoDono ?? 'sem dono (catálogo)'}. Faça isso quando o aparelho mudou
              mesmo de mãos, ou quando estiver unificando um cadastro duplicado.
            </span>
          ) : (
            <span className={estilo.dica}>
              Pode ficar em branco. O aparelho se amarra ao cliente quando você o puxar numa O.S.
            </span>
          )}
        </label>

        <label className={estilo.rotulo}>
          Marca *
          <input
            className={estilo.campo}
            name="marca"
            required
            minLength={2}
            defaultValue={equipamento?.marca ?? ''}
          />
        </label>
        <label className={estilo.rotulo}>
          Modelo *
          <input className={estilo.campo} name="modelo" required defaultValue={equipamento?.modelo ?? ''} />
        </label>
        <label className={estilo.rotulo}>
          Número de série
          <input
            className={estilo.campo}
            name="numeroSerie"
            defaultValue={equipamento?.numeroSerie ?? ''}
          />
          <span className={estilo.dica}>
            A identidade física do aparelho — é por ela que o histórico se amarra. Dois aparelhos
            do mesmo dono não podem repetir.
          </span>
        </label>
        <label className={estilo.rotulo}>
          Patrimônio
          <input className={estilo.campo} name="patrimonio" defaultValue={equipamento?.patrimonio ?? ''} />
        </label>
        <label className={estilo.rotulo}>
          Categoria
          <input
            className={estilo.campo}
            name="categoria"
            placeholder="Laser, autoclave, ultrassom…"
            defaultValue={equipamento?.categoria ?? ''}
          />
        </label>
        <label className={estilo.rotulo}>
          Voltagem
          <input
            className={estilo.campo}
            name="voltagem"
            placeholder="127V, 220V, bivolt"
            defaultValue={equipamento?.voltagem ?? ''}
          />
        </label>
        <label className={estilo.rotulo}>
          Ano de fabricação
          <input
            className={estilo.campo}
            name="anoFabricacao"
            type="number"
            min={1970}
            max={2100}
            defaultValue={equipamento?.anoFabricacao ?? ''}
          />
        </label>
      </div>

      <label className={estilo.rotulo}>
        Acessórios
        <input
          className={estilo.campo}
          name="acessorios"
          placeholder="Cabo, pedal, ponteira, maleta…"
          defaultValue={equipamento?.acessorios ?? ''}
        />
      </label>

      <label className={estilo.rotulo}>
        Observações
        <textarea className={estilo.area} name="observacoes" rows={2} defaultValue={equipamento?.observacoes ?? ''} />
      </label>

      {/* A FOTO DO APARELHO.
          Marca e modelo não bastam para reconhecer um aparelho na bancada: o
          mesmo modelo muda de cara entre gerações, e o cliente descreve o dele
          pela aparência, não pelo número de série. */}
      <label className={estilo.rotulo}>
        Foto do aparelho
        <input className={estilo.campo} type="file" name="foto" accept="image/*" />
        <span className={estilo.dica}>
          {editando
            ? equipamento!.temFoto
              ? 'Deixe em branco para manter a foto atual. Escolher outra substitui.'
              : 'Este aparelho ainda não tem foto. É ela que o identifica de relance.'
            : 'Opcional. É ela que identifica o aparelho de relance — dá para trocar depois.'}
        </span>
      </label>

      <div className={estilo.acoesForm}>
        <button type="submit" className={estilo.btn} disabled={pendente}>
          {pendente ? 'Salvando…' : editando ? 'Salvar a correção' : 'Cadastrar equipamento'}
        </button>
      </div>
    </form>
  )
}
