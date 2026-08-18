'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { QuadroAssinatura, type QuadroRef } from '@/components/quadro-assinatura'
import { assinarNoVisor } from '@/server/acoes/ordem'
import estilo from '../../app.module.css'

/**
 * Coleta da assinatura em campo.
 *
 * Decisões que vêm da rua, não da mesa:
 *
 *  • **Sem rede, sem "salvo".** O botão trava quando o aparelho está offline.
 *    Mostrar sucesso antes da confirmação do servidor é o erro que faz o
 *    motorista sair, o cliente não receber nada, e ninguém entender por quê.
 *  • **GPS é opcional.** Subsolo, prédio e celular velho derrubam o sinal.
 *    Exigir coordenada deixaria a pessoa presa na porta do cliente. Pedimos,
 *    esperamos pouco, e seguimos sem ela registrando que não houve.
 *  • **O nome de quem recebeu vale mais que o traço.** É ele que identifica a
 *    pessoa meses depois, quando aparece a discussão.
 */
export function FormularioAssinatura({
  ordemId,
  tipo,
  contatoSugerido,
  endereco,
}: {
  ordemId: string
  tipo: 'RETIRADA' | 'ENTREGA'
  contatoSugerido: string
  endereco: string
}) {
  const router = useRouter()
  const quadro = useRef<QuadroRef>(null)
  const [nome, setNome] = useState(contatoSugerido)
  const [documento, setDocumento] = useState('')
  const [temTraco, setTemTraco] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [online, setOnline] = useState(true)
  const [geo, setGeo] = useState<{ lat: number; lng: number; precisao: number } | null>(null)
  const [geoEstado, setGeoEstado] = useState<'buscando' | 'ok' | 'indisponivel'>('buscando')

  useEffect(() => {
    setOnline(navigator.onLine)
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    addEventListener('online', on)
    addEventListener('offline', off)
    return () => {
      removeEventListener('online', on)
      removeEventListener('offline', off)
    }
  }, [])

  useEffect(() => {
    if (!navigator.geolocation) {
      setGeoEstado('indisponivel')
      return
    }
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setGeo({ lat: p.coords.latitude, lng: p.coords.longitude, precisao: p.coords.accuracy })
        setGeoEstado('ok')
      },
      () => setGeoEstado('indisponivel'),
      // Espera curta de propósito: ninguém fica parado 30 segundos na calçada
      // esperando o GPS decidir.
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30_000 },
    )
  }, [])

  async function enviar() {
    setErro(null)
    const dataUrl = quadro.current?.capturar()
    if (!dataUrl) return setErro('Assine no quadro antes de confirmar.')
    if (nome.trim().length < 3) return setErro('Escreva o nome de quem está assinando.')
    // Na ENTREGA o documento é exigido: é o que amarra quem ficou com o
    // equipamento. Na retirada é opcional — quem entrega já está no cadastro.
    if (tipo === 'ENTREGA' && documento.length !== 11 && documento.length !== 14) {
      return setErro('Informe o CPF (11 dígitos) ou CNPJ (14) de quem está recebendo.')
    }
    if (!online) return setErro('Sem internet. Espere o sinal voltar para finalizar.')

    setEnviando(true)
    const fd = new FormData()
    fd.set('ordemId', ordemId)
    fd.set('tipo', tipo)
    fd.set('assinanteNome', nome.trim())
    if (documento) fd.set('assinanteDocumento', documento)
    fd.set('dataUrl', dataUrl)
    if (geo) {
      fd.set('latitude', String(geo.lat))
      fd.set('longitude', String(geo.lng))
      fd.set('precisaoM', String(Math.round(geo.precisao)))
    }

    const r = await assinarNoVisor(fd)
    setEnviando(false)
    if (!r.ok) return setErro(r.motivo)
    router.push('/app/motorista')
    router.refresh()
  }

  return (
    <div className={estilo.form}>
      {!online ? (
        <p className={estilo.avisoRede}>
          Sem internet agora. Você pode assinar, mas só dá para finalizar quando o
          sinal voltar.
        </p>
      ) : null}

      <div className={estilo.campo}>
        <label htmlFor="nome">
          {tipo === 'RETIRADA' ? 'Quem está entregando o aparelho' : 'Quem está recebendo'}
        </label>
        <input
          id="nome"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Nome completo"
          autoComplete="off"
        />
      </div>

      {/* O documento identifica quem ficou com o aparelho. Nome repete;
          documento não. Obrigatório na entrega, opcional na retirada — quem
          entrega o aparelho é quem já está no cadastro. */}
      <div className={estilo.campo}>
        <label htmlFor="documento">
          CPF ou CNPJ de quem {tipo === 'RETIRADA' ? 'entregou' : 'recebeu'}
          {tipo === 'ENTREGA' ? '' : ' (opcional)'}
        </label>
        <input
          id="documento"
          value={documento}
          onChange={(e) => setDocumento(e.target.value.replace(/\D/g, '').slice(0, 14))}
          placeholder="Só os números"
          inputMode="numeric"
          autoComplete="off"
        />
      </div>

      <div className={estilo.campo}>
        <label>Assinatura</label>
        <QuadroAssinatura rotulo="Assine com o dedo" aoMudar={setTemTraco} ref={quadro} />
      </div>

      <p className={estilo.geo}>
        {geoEstado === 'ok' && geo
          ? `Local registrado · precisão de ${Math.round(geo.precisao)} m`
          : geoEstado === 'buscando'
            ? 'Procurando a localização…'
            : 'Sem localização — a assinatura vale igual, e fica registrado que o GPS não respondeu.'}
      </p>
      <p className={estilo.enderecoNota}>{endereco}</p>

      {erro ? (
        <p className={estilo.erro} role="alert">
          {erro}
        </p>
      ) : null}

      <button
        type="button"
        className={estilo.btnConfirmar}
        onClick={enviar}
        disabled={enviando || !temTraco || !online}
      >
        {enviando
          ? 'Registrando…'
          : tipo === 'RETIRADA'
            ? 'Confirmar retirada'
            : 'Confirmar entrega'}
      </button>

      <p className={estilo.ajudaCampo}>
        Ao confirmar, o cliente recebe um WhatsApp na hora com a data, o horário, o
        endereço e o seu nome, mais o PDF assinado.
      </p>
    </div>
  )
}
