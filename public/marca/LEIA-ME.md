# Logotipo oficial da DTECH MED

Esta pasta está vazia de propósito.

Tentei baixar o logotipo direto de `dtechmed.com.br`, mas o ambiente onde o
sistema foi construído bloqueia o acesso àquele domínio. Sem o arquivo em mãos,
a alternativa seria **desenhar um parecido** — e uma marca aproximada é pior
que marca nenhuma: ela vai parar em contrato, em orçamento assinado e no
WhatsApp do cliente, e ninguém percebe que está errada até alguém de fora
apontar.

Enquanto o arquivo não chega, a marca aparece desenhada em texto (o "D" em
caixa violeta seguido de TECH**MED**), que é como está hoje no site, no painel
e nos aplicativos. Funciona bem e não finge ser o que não é.

## Como colocar o logotipo de verdade

Coloque os arquivos aqui com estes nomes exatos:

| Arquivo | Para quê | Formato ideal |
|---|---|---|
| `logo.svg` | Site, painel e apps | SVG, fundo transparente |
| `logo-claro.svg` | Versão para fundo claro | SVG, fundo transparente |
| `logo.png` | Onde SVG não serve (PDF, WhatsApp) | PNG, 1024 px de largura, fundo transparente |

O SVG é o que mais importa: ele fica nítido em qualquer tamanho, do favicon ao
cabeçalho do PDF impresso. Se você só tiver o PNG, mande do maior tamanho que
existir — dá para gerar o resto a partir dele, mas não dá para recuperar o que
já se perdeu numa imagem pequena.

Se tiver o **manual da marca** (as cores exatas em HEX, a fonte do logotipo, a
área de respiro), mande junto. As cores atuais do sistema foram calibradas para
o violeta `#4A0D8F`; se a marca usa outro tom, é um ajuste em um arquivo só
(`src/app/globals.css`).

## Logotipo de cada franquia

Este aqui é o da matriz. **Cada franquia tem o seu**, e ele não vem desta
pasta: vem do cadastro da empresa, no campo `logoUrl` — é o que faz o PDF de
uma franquia sair com a marca dela, e não com a de Lajeado.
