import Link from 'next/link'
import { EMPRESA, linkWhatsapp } from '@/lib/empresa'
import { FormularioRetirada } from './formulario-retirada'
import estilo from './site.module.css'

/**
 * Home institucional.
 *
 * A primeira dobra mostra o produto trabalhando — a linha do tempo de uma
 * ordem — em vez de uma foto de banco de imagens. A tese é que a DTECH entrega
 * prontuário, então a prova disso tem que estar visível antes de qualquer
 * argumento escrito.
 *
 * Renderizada estaticamente: é a página mais visitada e a que mais depende de
 * abrir rápido no 4G de quem está com o aparelho parado.
 */
export const dynamic = 'force-static'

const ETAPAS = [
  ['Retirada assinada pelo cliente', 'Motorista · Adriano M.', '08/08 14:22'],
  ['Recebido na oficina · 8 fotos', 'Técnico · Rafael S.', '08/08 17:05'],
  ['Laudo e orçamento enviados', 'Gestora · Camila R.', '09/08 10:40'],
  ['Orçamento aprovado e assinado', 'Cliente · portal, CNPJ conferido', '09/08 16:18'],
  ['Em manutenção · troca da fonte', 'Técnico · Rafael S.', '12/08 09:12'],
] as const

const AVISOS = [
  ['01', 'Agendamento', 'Você chama pelo site ou WhatsApp e recebe a data com janela de horário.'],
  ['02', 'Retirada', 'O motorista apresenta a ordem na tela e coleta sua assinatura no local.'],
  ['03', 'Entrada', 'Técnico registra no mínimo seis fotos do estado em que o aparelho chegou.'],
  ['04', 'Orçamento', 'Item a item, com prazo e garantia. Você aprova por link e assina na tela.'],
  ['05', 'Execução', 'Só começa depois da sua aprovação. Testes finais ficam anexados à ordem.'],
  ['06', 'Devolução', 'Levamos de volta e coletamos sua assinatura na entrega, com localização.'],
] as const

const ESPECIALIDADES = [
  ['Estética', 'Laser, luz intensa pulsada, criolipólise, radiofrequência e ultrassom micro e macrofocado.', ['Fonte e placa', 'Ponteira e aplicador', 'Sistema de refrigeração', 'Calibração de potência']],
  ['Médico', 'Monitor multiparâmetro, bisturi eletrônico, foco cirúrgico e bomba de infusão.', ['Sensor e cabo', 'Bateria interna', 'Placa de aquisição', 'Teste funcional']],
  ['Odontológico', 'Cadeira, refletor, autoclave, compressor, fotopolimerizador e ultrassom.', ['Sistema hidráulico', 'Pneumática', 'Resistência', 'Vedação e câmara']],
  ['Hospitalar', 'Autoclave de grande porte, mesa cirúrgica, aspirador, seladora e estufa.', ['Comando elétrico', 'Atuador e motor', 'Sensor de pressão', 'Rotina preventiva']],
] as const

export default function Home() {
  return (
    <>
      <header className={estilo.topo}>
        <div className={estilo.container}>
          <div className={estilo.topoIn}>
            <Link href="/" className={estilo.marca} aria-label="DTECH MED, página inicial">
              <span className={estilo.marcaD}>D</span>
              <span className={estilo.marcaTxt}>
                TECH<b>MED</b>
              </span>
            </Link>
            <nav className={estilo.nav}>
              <a href="#como-funciona">Como funciona</a>
              <a href="#a-empresa">A empresa</a>
              <a href="#especialidades">Especialidades</a>
              <a href="#solicitar">Solicitar retirada</a>
              <Link href="/entrar" className={estilo.navEntrar}>
                Entrar
              </Link>
            </nav>
          </div>
        </div>
      </header>

      <main>
        {/* ---------------- Primeira dobra ---------------- */}
        <section className={estilo.dobra}>
          <div className={`${estilo.container} ${estilo.dobraGrid}`}>
            <div>
              <h1 className={estilo.tese}>
                Seu equipamento tem <em>prontuário</em>.
              </h1>
              <p className={estilo.sub}>
                Consertamos aparelho de estética, médico, odontológico e hospitalar,
                de qualquer marca. A gente busca na sua sala, registra cada passo e
                devolve funcionando, com laudo, garantia e assinatura.
              </p>
              <div className={estilo.acoes}>
                <a href="#solicitar" className={estilo.btn}>
                  Solicitar retirada
                </a>
                <a href="#como-funciona" className={`${estilo.btn} ${estilo.btnLinha}`}>
                  Ver como funciona
                </a>
              </div>
            </div>

            {/* O produto trabalhando, não um mockup decorativo. */}
            <div className={estilo.console}>
              <div className={estilo.csBarra}>
                <span className={estilo.csPontos}>
                  <i /><i /><i />
                </span>
                <span className={estilo.csTit}>PAINEL DE ACOMPANHAMENTO</span>
              </div>
              <div className={estilo.csCab}>
                <p className={estilo.gravFria}>Ordem de serviço</p>
                <p className={estilo.csOs}>#DT-2419</p>
                <p className={estilo.csEq}>Laser Lavieen · Duo</p>
                <p className={estilo.csNs}>NS 8842-LV-2021 · 220V · Clínica Bella Pelle</p>
              </div>
              <ol className={estilo.lt}>
                {ETAPAS.map(([nome, quem, hora], i) => (
                  <li key={nome} className={i === ETAPAS.length - 1 ? estilo.etAgora : estilo.etFeita}>
                    <span className={estilo.etPonto} aria-hidden="true" />
                    <span className={estilo.etTxt}>
                      <strong>{nome}</strong>
                      <span>{quem}</span>
                    </span>
                    <time className={estilo.etHora}>{hora}</time>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>

        {/* ---------------- Como funciona ---------------- */}
        <section id="como-funciona" className={estilo.secao}>
          <div className={estilo.container}>
            <p className={estilo.grav}>O caminho do seu aparelho</p>
            <h2 className={estilo.h2}>Você fica sabendo seis vezes.</h2>
            <p className={estilo.lead}>
              E não precisa ligar nenhuma delas para perguntar. A mensagem sai
              sozinha quando a etapa vira.
            </p>
            <ol className={estilo.passos}>
              {AVISOS.map(([n, titulo, texto]) => (
                <li key={n} className={estilo.passo}>
                  <span className={estilo.passoNum}>{n}</span>
                  <div>
                    <h3>{titulo}</h3>
                    <p>{texto}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ---------------- O que a empresa faz e no que acredita ----------
            Texto do site oficial da DTECH MED, palavra por palavra. Missão,
            visão e valores não foram reescritos: são o que a empresa já diz
            de si, e reescrevê-los seria trocar a voz dela pela nossa. */}
        <section id="a-empresa" className={estilo.secao}>
          <div className={estilo.container}>
            <p className={estilo.grav}>O serviço</p>
            <h2 className={estilo.h2}>Conserta o que quebrou. E evita o próximo.</h2>
            <div className={estilo.grade2}>
              {EMPRESA.servicos.map((s) => (
                <article key={s.titulo} className={estilo.carta}>
                  <h3>{s.titulo}</h3>
                  <p>{s.texto}</p>
                </article>
              ))}
            </div>

            <div className={estilo.principios}>
              <div>
                <p className={estilo.grav}>Missão</p>
                <p className={estilo.principioTexto}>{EMPRESA.missao}</p>
              </div>
              <div>
                <p className={estilo.grav}>Visão</p>
                <p className={estilo.principioTexto}>{EMPRESA.visao}</p>
              </div>
              <div>
                <p className={estilo.grav}>Valores</p>
                <p className={estilo.principioTexto}>{EMPRESA.valores}</p>
              </div>
            </div>
          </div>
        </section>

        {/* ---------------- Especialidades (superfície clara) ---------------- */}
        <section id="especialidades" className={`${estilo.secao} claro`}>
          <div className={estilo.container}>
            <p className={estilo.grav}>O que atendemos</p>
            <h2 className={estilo.h2}>Inclusive a marca que ninguém quer pegar.</h2>
            <p className={estilo.lead}>
              Se a peça saiu de linha, a gente procura equivalente e te conta antes,
              não depois. Você decide se vale.
            </p>
            <div className={estilo.grade4}>
              {ESPECIALIDADES.map(([nome, texto, itens]) => (
                <article key={nome} className={estilo.carta}>
                  <h3>{nome}</h3>
                  <p>{texto}</p>
                  <ul>
                    {itens.map((i) => (
                      <li key={i}>{i}</li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ---------------- Solicitar ---------------- */}
        <section id="solicitar" className={estilo.secao}>
          <div className={`${estilo.container} ${estilo.estreito}`}>
            <p className={estilo.grav}>Solicitar retirada</p>
            <h2 className={estilo.h2}>Conta pra gente o que houve.</h2>
            <p className={estilo.lead}>
              A gente responde em até 24 horas úteis, já com a data da retirada.
            </p>
            <FormularioRetirada whatsapp={EMPRESA.whatsapp} />
            <p className={estilo.contatoDireto}>
              Prefere falar agora?{' '}
              <a href={linkWhatsapp(`Olá! Preciso de manutenção em um equipamento.`)} className={estilo.linkZap}>
                {EMPRESA.telefoneExibicao}
              </a>
            </p>
          </div>
        </section>
      </main>

      <footer className={estilo.rodape}>
        <div className={`${estilo.container} ${estilo.rodGrid}`}>
          <div>
            <span className={estilo.marca}>
              <span className={estilo.marcaD}>D</span>
              <span className={estilo.marcaTxt}>
                TECH<b>MED</b>
              </span>
            </span>
            <p className={estilo.rodTexto}>
              {EMPRESA.razaoSocial}. {EMPRESA.descricaoSite}, de qualquer marca.
              {EMPRESA.cnpj ? ` CNPJ ${EMPRESA.cnpj}.` : ''}
            </p>
          </div>
          <div>
            <h4>Contato</h4>
            <ul>
              <li>
                <a href={linkWhatsapp()}>{EMPRESA.telefoneExibicao}</a>
              </li>
              {/* Campo vazio some da tela. Melhor faltar um horário do que
                  publicar um que não é o verdadeiro. */}
              {EMPRESA.horarioAtendimento ? <li>{EMPRESA.horarioAtendimento}</li> : null}
              {EMPRESA.email ? (
                <li>
                  <a href={`mailto:${EMPRESA.email}`}>{EMPRESA.email}</a>
                </li>
              ) : null}
              {EMPRESA.instagram ? (
                <li>
                  <a href={`https://instagram.com/${EMPRESA.instagram.replace('@', '')}`}>
                    {EMPRESA.instagram}
                  </a>
                </li>
              ) : null}
            </ul>
          </div>
          <div>
            <h4>Endereço</h4>
            <ul>
              <li>
                {EMPRESA.endereco.logradouro}, {EMPRESA.endereco.numero}
              </li>
              <li>{EMPRESA.endereco.bairro}</li>
              <li>
                {EMPRESA.endereco.cidade} · {EMPRESA.endereco.uf}
              </li>
              <li>CEP {EMPRESA.endereco.cep}</li>
            </ul>
          </div>
        </div>
        <div className={`${estilo.container} ${estilo.rodFim}`}>
          <span>© {new Date().getFullYear()} {EMPRESA.razaoSocial}</span>
          <Link href="/entrar">Acesso ao sistema</Link>
        </div>
      </footer>
    </>
  )
}
