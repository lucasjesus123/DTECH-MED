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

Tinta violeta chapada sobre papel técnico frio. As referências são a etiqueta de
patrimônio parafusada no equipamento, o laudo de calibração e o canhoto de
romaneio — não o card com iconezinho arredondado.

Decisões que sustentam isso:

- **O violeta da marca é tinta impressa**, campo sólido. Nunca gradiente
  luminoso: degradê roxo-para-azul é a assinatura mais reconhecível de
  interface gerada por IA, e a marca merece coisa melhor.
- **Papel frio** (`#EFF0F4`), não creme. Creme é o off-white automático.
- **Raio de 3px.** Documento técnico não tem canto de bolha.
- **Monoespaçada carrega o registro técnico**: número de série, O.S., horário e
  valor. É de onde vem a personalidade — não de uma fonte da moda.
- **Uma borda definida OU uma elevação**, nunca as duas no mesmo elemento.

## O movimento

Um só momento autoral, orquestrado: **a etapa travando na linha do tempo**, como
um carimbo que assenta e não volta. É o que o objeto faz na vida real.

Ease-out exponencial em tudo. Nada de bounce. O conteúdo é visível por padrão —
o script melhora a entrada, não condiciona a existência. Com
`prefers-reduced-motion`, a linha do tempo aparece pronta.

## Cores e contraste

Todos os pares de texto passam em WCAG AA, medidos e não estimados:

| Papel | Cor | Contraste sobre branco |
|---|---|---|
| Marca / ação | `#4A0D8F` | 12,1:1 |
| Atrasado, reprovado | `#A8203C` | 7,2:1 |
| Aprovado, entregue | `#0F6B4F` | 6,5:1 |
| Aguardando | `#8A5300` | 6,3:1 |
| Ação primária | `#1B4FD8` | 6,7:1 |

Sobre superfície colorida o texto secundário é tingido com o tom da própria cor,
nunca cinza — cinza sobre cor lava e perde legibilidade.

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
