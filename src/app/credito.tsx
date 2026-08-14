import { DESENVOLVEDOR } from '@/lib/empresa'

/**
 * O crédito de quem construiu, para o rodapé.
 *
 * Um componente, e não a frase escrita à mão em cada tela. Ele aparece no site,
 * na tela de login, no painel, nos dois aplicativos de campo e no portal do
 * cliente — sete lugares. Escrito à mão, seria uma frase que envelhece em seis
 * deles no dia em que alguma coisa mudar.
 *
 * O link abre em aba nova porque leva para fora do sistema: quem está no meio
 * de uma ordem de serviço não pode perder a tela por um clique de curiosidade.
 * Com `rel="noopener"`, que impede a página de destino de mexer nesta pela
 * referência `window.opener`.
 */
export function Credito({ className }: { className?: string }) {
  return (
    <span className={className}>
      Desenvolvido por{' '}
      <a href={DESENVOLVEDOR.site} target="_blank" rel="noopener noreferrer">
        {DESENVOLVEDOR.nome}
      </a>
    </span>
  )
}
