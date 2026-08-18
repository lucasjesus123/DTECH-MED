/**
 * Datas de calendário, no fuso de quem usa o sistema.
 *
 * ---------------------------------------------------------------------------
 * O ERRO QUE ESTE ARQUIVO EXISTE PARA IMPEDIR
 * ---------------------------------------------------------------------------
 * `data.toISOString().slice(0, 10)` parece a forma óbvia de tirar o dia de um
 * instante, e aparecia em três lugares deste sistema. Ela é UTC por definição,
 * e não acompanha fuso nenhum.
 *
 * Lajeado está três horas atrás de UTC. Então TODA hora entre 21h e meia-noite
 * já é o dia seguinte em UTC — e é justamente a faixa do fim do expediente, em
 * que se corre atrás do que ficou. Os três sintomas, todos vistos na tela:
 *
 *   • A agenda arquivava a entrega das 22h sob "Amanhã". O motorista que abre
 *     para ver o que ainda tem hoje não a via.
 *   • A ficha da ordem mostrava "prazo 24/08" no cabeçalho e 25/08 no campo de
 *     edição, na mesma tela. Quem salvasse a ordem empurrava o prazo um dia.
 *   • O nome do arquivo de exportação saía com a data de amanhã.
 *
 * `toDateString()` e `getDate()` erram por outro caminho: eles seguem o fuso do
 * PROCESSO. Na VPS o contêiner roda com `TZ=America/Sao_Paulo` e a conta dá
 * certo; na máquina de desenvolvimento, num contêiner de ensaio ou num servidor
 * novo, dá errado. Depender do fuso do processo é depender de configuração que
 * não viaja junto com o código — e o defeito só aparece no ambiente que não foi
 * configurado, que é sempre o próximo.
 *
 * Aqui o fuso é DECLARADO. O resultado é o mesmo em qualquer máquina.
 */

/** Onde a empresa opera. É daqui que sai o que conta como "hoje". */
export const FUSO = 'America/Sao_Paulo'

/**
 * `en-CA` não é exotismo: é o locale cuja data curta já é `AAAA-MM-DD`. Sai
 * ordenável como texto e no formato que `<input type="date">` espera, sem
 * remontagem de pedaços.
 */
const fmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: FUSO,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** O dia do calendário, em Lajeado, no formato `AAAA-MM-DD`. */
export function diaLocal(d: Date = new Date()): string {
  return fmt.format(d)
}

/** O dia de hoje em Lajeado. */
export function hoje(): string {
  return diaLocal()
}

/** O dia seguinte a hoje, em Lajeado. */
export function amanha(): string {
  return diaLocal(new Date(Date.now() + 86_400_000))
}
