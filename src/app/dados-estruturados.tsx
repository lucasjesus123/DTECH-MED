import { headers } from 'next/headers'
import { EMPRESA, instagramUsuario } from '@/lib/empresa'
import { env } from '@/lib/env'

/**
 * Dados estruturados (JSON-LD) para o Google.
 *
 * ---------------------------------------------------------------------------
 * O QUE ISTO FAZ
 * ---------------------------------------------------------------------------
 * O texto da página diz para uma PESSOA o que a DTECH faz. Este bloco diz o
 * mesmo para uma MÁQUINA, num formato que ela não precisa interpretar: nome,
 * endereço, telefone, área atendida, e a lista de serviços.
 *
 * É o que alimenta o painel lateral da busca ("Knowledge Panel"), o resultado
 * do Maps e as respostas de "assistência técnica de equipamento estético perto
 * de mim". Sem ele, o Google tem que adivinhar o endereço lendo o rodapé — e
 * às vezes adivinha errado.
 *
 * ---------------------------------------------------------------------------
 * POR QUE NÃO TEM NOTA (aggregateRating) AQUI
 * ---------------------------------------------------------------------------
 * Seria tentador marcar o "5,0 em 3 avaliações" e tentar as estrelinhas no
 * resultado da busca. Não fazemos, de propósito.
 *
 * A política do Google para trecho de avaliação proíbe duas coisas que se
 * aplicam exatamente ao nosso caso: avaliação que a própria empresa hospeda
 * sobre si mesma, e avaliação recolhida de terceiro (as nossas vêm do perfil
 * do Google) republicada como se fosse do site. O risco de marcar assim não é
 * "não aparecer" — é ação manual no domínio, que derruba o site inteiro da
 * busca e leva semanas para reverter.
 *
 * A nota continua aparecendo para quem visita, no painel da seção de
 * avaliações. E ela já conta para o Google pelo lugar certo: o perfil do
 * Google Meu Negócio, que é de onde ela veio.
 *
 * ---------------------------------------------------------------------------
 * O NONCE
 * ---------------------------------------------------------------------------
 * A política de segurança do sistema só autoriza script com o nonce da
 * requisição. JSON-LD não executa nada, mas continua sendo uma tag `<script>`
 * — e navegador que aplica a política ao rasgo inteiro simplesmente apaga o
 * bloco. O resultado seria o pior possível: o site parece certo, o Google não
 * vê nada, e nenhum erro aparece em lugar nenhum.
 *
 * Por isso o nonce é lido do cabeçalho que o middleware carimba, e não
 * inventado aqui.
 */
export async function DadosEstruturados() {
  const nonce = (await headers()).get('x-nonce') ?? undefined
  const base = env.APP_URL.replace(/\/$/, '')

  /** Só entram os perfis que existem de verdade. Link vazio vira 404. */
  const perfis = [
    EMPRESA.instagram ? `https://instagram.com/${instagramUsuario()}` : null,
    EMPRESA.googleMeuNegocio || null,
    EMPRESA.facebook || null,
  ].filter(Boolean)

  const dados = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': `${base}/#site`,
        url: `${base}/`,
        name: EMPRESA.nome,
        inLanguage: 'pt-BR',
        publisher: { '@id': `${base}/#empresa` },
      },
      {
        // Dois tipos: é uma empresa local (endereço, telefone, atendimento
        // presencial) e é um serviço profissional. O Google usa o mais
        // específico que reconhecer.
        '@type': ['LocalBusiness', 'ProfessionalService'],
        '@id': `${base}/#empresa`,
        name: EMPRESA.nome,
        legalName: EMPRESA.razaoSocial,
        description: EMPRESA.descricaoSite,
        url: `${base}/`,
        logo: `${base}/icone-512.png`,
        image: `${base}/icone-512.png`,
        telephone: `+${EMPRESA.whatsapp}`,
        ...(EMPRESA.email ? { email: EMPRESA.email } : {}),
        ...(EMPRESA.cnpj ? { taxID: EMPRESA.cnpj } : {}),
        ...(perfis.length ? { sameAs: perfis } : {}),
        address: {
          '@type': 'PostalAddress',
          streetAddress: EMPRESA.endereco.complemento
            ? `${EMPRESA.endereco.logradouro}, ${EMPRESA.endereco.numero}, ${EMPRESA.endereco.complemento}`
            : `${EMPRESA.endereco.logradouro}, ${EMPRESA.endereco.numero}`,
          addressLocality: EMPRESA.endereco.cidade,
          addressRegion: EMPRESA.endereco.uf,
          postalCode: EMPRESA.endereco.cep,
          addressCountry: 'BR',
        },
        // Quem procura assistência procura por região, não por rua. Declarar o
        // estado é o que faz a empresa aparecer para a clínica de Caxias que
        // aceita mandar o aparelho para Lajeado.
        areaServed: [
          { '@type': 'State', name: 'Rio Grande do Sul' },
          { '@type': 'City', name: EMPRESA.endereco.cidade },
        ],
        knowsAbout: EMPRESA.marcas,
        // Lista de serviços: é o que responde a busca por "calibração de
        // equipamento estético" em vez de só pelo nome da empresa.
        hasOfferCatalog: {
          '@type': 'OfferCatalog',
          name: 'Serviços de assistência técnica',
          itemListElement: EMPRESA.servicos.map((s) => ({
            '@type': 'Offer',
            itemOffered: {
              '@type': 'Service',
              name: s.titulo,
              description: s.texto,
              serviceType: s.titulo,
              provider: { '@id': `${base}/#empresa` },
              areaServed: { '@type': 'State', name: 'Rio Grande do Sul' },
            },
          })),
        },
        ...(EMPRESA.horarioAtendimento ? { openingHours: EMPRESA.horarioAtendimento } : {}),
      },
    ],
  }

  return (
    <script
      type="application/ld+json"
      nonce={nonce}
      // O conteúdo é montado por nós a partir de constantes tipadas, sem nada
      // vindo do visitante. `JSON.stringify` já escapa aspas; o que ele não
      // escapa é `</script>` dentro de uma string, e é por isso que a barra
      // vai escapada — sem isso, um dia alguém escreve isso num texto e a
      // página quebra em silêncio.
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(dados).replace(/</g, '\\u003c'),
      }}
    />
  )
}
