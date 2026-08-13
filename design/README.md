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
- **O brilho é funcional**, não halo decorativo: marca o que está ativo (etapa
  travada, nó aceso, ação primária). Elemento inerte não brilha.
- **O claro entra como respiro, não como tema alternativo.** No site, duas
  seções brancas cortam a sequência escura: "o que atendemos" e "solicitar
  retirada" — justamente onde o leitor precisa parar e decidir.

## Tipografia

| Papel | Fonte | Por quê |
|---|---|---|
| Títulos | **Sora** 600–800 | Geométrica e técnica; ecoa o desenho do logotipo DTECHMED |
| Texto | **Manrope** 400–700 | Humanista, contraforma larga; aguenta parágrafo longo |
| Registro técnico | **JetBrains Mono** 400–700 | Série, O.S., horário e valor com cara de engenharia |

As três são embutidas em base64 (218 KB) e também gravadas em `public/fonts`
para o app real servir localmente. Nenhum CDN externo, nas duas pontas.

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

### A superfície clara

A classe `.claro` reescreve a paleta para o ramo em que aparece — serve tanto
para a seção branca do site quanto para o modo claro do painel, sem duplicar
folha de estilo e sem risco das duas divergirem.

O que muda não é só o fundo: **no claro os tons de sinal precisam escurecer**.
O violeta `#A78BFA` brilha sobre preto e some sobre branco (2,4:1). O mesmo
vale para verde, carmim e âmbar — cor de instrumento luminoso não sobrevive em
papel. Por isso o claro usa `#6D28D9`, `#0F6B4F`, `#A8203C` e `#8A5300`.

O painel traz um alternador claro/escuro no topo. Não é enfeite: é a tela em
que a gestora passa o dia, e a escolha é dela. Abrir com `#claro` na URL já
entra no modo claro.

## Conteúdo

São reais: razão social, endereço (Av. Alberto Pasqualini, 2073, São Cristóvão,
Lajeado/RS) e telefone (51) 98044-9274.

**É ilustrativo todo o resto** — nomes de clientes, equipamentos, valores,
técnicos e indicadores. Cada página carrega uma faixa dizendo isso. Antes de ir
ao ar, trocar por material real: fotos da oficina e da equipe, marcas
efetivamente atendidas, prazos e garantia praticados, e depoimentos com
autorização.

## O texto

Passada de UX writing sobre as três telas, feita depois do visual e verificada
contra os vícios de escrita gerada por máquina: saturação de travessão, palavra
de marketing, cadência de aforismo ("X. Não Y.") e jargão interno vazando.

Medido no texto que o usuário lê de fato (`innerText` das páginas renderizadas),
não no código-fonte:

| Vício | Site | Painel | Apps |
|---|---|---|---|
| Travessão (—) | 0 | 0 | 1 |
| Palavra de marketing | 0 | 0 | 0 |
| Cadência de aforismo | 0 | 0 | 0 |
| Jargão interno | nenhum | "esteira" | nenhum |

O achado que mais valeu: **"esteira" estava na cara do cliente**, no botão do
hero e no rótulo de uma seção. É palavra nossa, de dentro da oficina — a dona
de uma clínica não faz ideia do que seja. No site virou "Ver como funciona" e
"O caminho do seu aparelho". No painel ela fica: quem trabalha ali ganha em ter
uma palavra curta para a coisa. Jargão só atrapalha quando atravessa para quem
não é do time.

Os outros três padrões que a passada corrigiu:

- **Língua de nota fiscal.** "Registrado antes de qualquer intervenção" virou
  "fotografado antes de alguém encostar a chave nele". "As peças aplicadas"
  virou "no serviço e nas peças".
- **Rótulo que descreve o gesto, não o resultado.** "Enviar solicitação" virou
  "Pedir a retirada".
- **Mensagem montada por concatenação.** O app do técnico exibia "Falta 2 foto"
  — número e plural discordando porque a frase era colada de pedaços. Agora a
  mensagem é escrita inteira nas duas formas, o que também a deixa traduzível.

Uma decisão de conteúdo, não de estilo: a mensagem de WhatsApp cumprimentava a
razão social ("Olá, Clínica Bella Pelle!"). Quem lê WhatsApp é uma pessoa, e ela
tem nome. Passou a cumprimentar a Mariana.

## Verificação

Inspecionado em Chromium (1440×950 e 390×844), em rodadas fechadas:

- sem scroll horizontal em nenhuma das seis combinações;
- nenhum erro de script no carregamento;
- nenhuma imagem quebrada;
- fonte real aplicada (Barlow / Barlow Condensed / Azeret Mono, embutidas).

A assinatura no app do motorista funciona de verdade: rabisque no quadro com o
dedo ou o mouse. O contador de fotos do técnico trava a entrada abaixo de seis.
