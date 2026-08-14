# A marca DTECH MED

Três arquivos, todos vetoriais, extraídos do PDF oficial que o Lucas enviou em
agosto de 2026.

| Arquivo | Proporção | Onde usar |
| --- | --- | --- |
| `dtechmed.svg` | 6,02 : 1 | topo do site, rodapé, cabeçalho de PDF |
| `dtechmed-simbolo.svg` | 0,99 : 1 | favicon, ícone do PWA, avatar, marca d'água |
| `dtechmed-palavra.svg` | 5,60 : 1 | quando o símbolo já aparece perto |

## Cor

**`#34005E`** — violeta profundo. No PDF ela é CMYK **87 / 96 / 11 / 58**.

Não confunda com o violeta claro da interface (`--vio`, `#8B5CF6`): aquele é
cor de instrumento, calibrado para brilhar sobre fundo escuro. O `#34005E` é a
cor impressa, a que está no cartão e na van.

## Como usar

Os três arquivos usam `fill="currentColor"`. Não têm cor própria: herdam a do
texto ao redor.

```jsx
<span style={{ color: 'var(--vio-tinta)', width: 180 }}>
  <Logo />
</span>
```

Sobre fundo escuro, use branco ou `--vio-claro`. Sobre fundo claro, `#34005E`.
Nunca ponha o violeta escuro sobre o quase-preto do site — some.

## Como foram extraídos

Não havia nenhuma ferramenta de PDF nesta máquina — nem `pdftoppm`, nem
Ghostscript, nem PyMuPDF. Os arquivos foram gerados lendo o PDF direto: os
fluxos de conteúdo foram descomprimidos e os operadores de caminho traduzidos
para SVG, que é quase um-para-um (`m`→`M`, `l`→`L`, `c`→`C`, `h`→`Z`), com o
eixo Y invertido por um `scale(1 -1)`, porque no PDF ele cresce para cima.

Duas limpezas foram necessárias:

- **832 caminhos viraram 10.** O resto eram fragmentos de 1 a 7 unidades perto
  da origem, restos do arquivo de origem. Um deles, sozinho, inflava a moldura
  em 250 unidades e deixava o logo perdido num canto.
- **O corte entre símbolo e palavra foi medido, não chutado**: o script procura
  o vão real entre os caminhos (achou 190,4) em vez de dividir por uma
  porcentagem da largura.

## Se o logo mudar

Substitua os três arquivos mantendo os nomes. Nada no código precisa mudar —
tudo aponta para estes caminhos.
