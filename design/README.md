# Direção visual — DTECH MED

Três protótipos navegáveis que fixam a linguagem antes do código de produção.
São HTML autocontido (fontes embutidas em base64) — abrem em qualquer celular,
sem servidor.

| Arquivo | Superfície | Modo |
|---|---|---|
| `site.html` | Site institucional | Persuadir |
| `sistema.html` | Painel de gestão | Operar |
| `app.html` | PWA do Motorista e do Técnico | Operar, mobile-first |

## A tese

O concorrente vende "sistema de OS". A DTECH entrega **prontuário do
equipamento**: ficha, histórico, laudo e alta assinada.

Isso não é slogan — é a decisão de arquitetura. O sistema atual navega por
módulo (Pessoas, Cadastros, Financeiro, Produtos, Vendas, Caixa, OS) e por isso
nada se conversa. Aqui a navegação é a **esteira**: cada etapa mostra quantos
aparelhos estão parados nela e há quanto tempo. O trabalho procura o operador,
não o contrário.

## O mundo visual

**Sala de instrumentação no escuro.** A luz vem do próprio equipamento ligado:
violeta DTECH luminoso sobre quase-preto violeta. É coerente com a tela de login
real da DTECH, que já é escura.

Decisões que sustentam isso:

- **Fundo `#08040F`** — quase-preto puxado para o violeta, não cinza neutro. A
  base pertence à mesma família da marca.
- **A aurora de fundo é o único elemento decorativo do projeto**, e se justifica:
  é a luz da sala. Anima apenas `transform`, nunca propriedade de layout.
- **Monoespaçada carrega o registro técnico**: número de série, O.S., horário e
  valor. É de onde vem a personalidade — não de uma fonte da moda.
- **O brilho é funcional**, não halo decorativo: marca o que está ativo (etapa
  travada, nó aceso, ação primária). Elemento inerte não brilha.

## O movimento

Cinco camadas orquestradas, cada uma amarrada a um dado real:

| Camada | O que faz | Por quê |
|---|---|---|
| Aurora | respira em ciclo de 26–32 s | a sala está ligada |
| Título | revela linha a linha na abertura | dá tempo de ler a tese |
| Linha do tempo | a etapa **trava** com pulso de luz | é o que o carimbo faz na vida real |
| Esteira | a luz percorre o trilho e acende os nós | mostra a ordem dos avisos |
| Contadores | sobem até o valor com desaceleração | o número vira leitura, não enfeite |

Ease-out exponencial em tudo. Nada de bounce. O conteúdo é visível por padrão —
o script melhora a entrada, não condiciona a existência. Com
`prefers-reduced-motion`, tudo aparece pronto e o feed para de rodar.

## Cores e contraste

Todos os pares passam em WCAG AA, medidos com a fórmula de luminância relativa,
não estimados a olho:

| Papel | Cor | Contraste |
|---|---|---|
| Texto principal sobre fundo | `#F4F0FB` | 18,1:1 |
| Texto secundário | `#B9AAD4` | 9,4:1 |
| Texto terciário (piso) | `#8375A0` | 4,9:1 |
| Violeta claro (destaque) | `#A78BFA` | 7,5:1 |
| Ao vivo / aprovado | `#2DD4A0` | 10,7:1 |
| Atrasado / reprovado | `#FB7185` | 7,5:1 |
| Aguardando | `#FBBF24` | 12,2:1 |
| Branco sobre botão primário | `#6D28D9` | 7,1:1 |

O detalhe que se erra fácil no escuro: **superfície colorida clara pede tinta
escura por cima, não branco**. Branco sobre o violeta `#8B5CF6` dá 3,4:1 e
reprova; por isso o botão nasce no `#6D28D9`, e o verde de sucesso leva texto
`#04231A`.

## Conteúdo

São reais: razão social, endereço (Av. Alberto Pasqualini, 2073, São Cristóvão,
Lajeado/RS) e telefone (51) 98044-9274.

**É ilustrativo todo o resto** — nomes de clientes, equipamentos, valores,
técnicos e indicadores. Cada página carrega uma faixa dizendo isso. Antes de ir
ao ar, trocar por material real: fotos da oficina e da equipe, marcas
efetivamente atendidas, prazos e garantia praticados, e depoimentos com
autorização.

## Verificação

Inspecionado em Chromium (1440×950 e 390×844), em rodadas fechadas:

- sem scroll horizontal em nenhuma das seis combinações;
- nenhum erro de script no carregamento;
- nenhuma imagem quebrada;
- fonte real aplicada (Barlow / Barlow Condensed / Azeret Mono, embutidas).

A assinatura no app do motorista funciona de verdade: rabisque no quadro com o
dedo ou o mouse. O contador de fotos do técnico trava a entrada abaixo de seis.
