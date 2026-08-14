# Vídeo da primeira dobra

O fundo em vídeo da home procura estes arquivos, nesta ordem:

| Arquivo | Para quê |
| --- | --- |
| `oficina.webm` | formato preferido — mesmo vídeo, arquivo bem menor |
| `oficina.mp4`  | compatibilidade (Safari mais antigo) |
| `oficina.jpg`  | pôster: o primeiro quadro, mostrado antes de o vídeo carregar |

**Enquanto nenhum deles existir, nada quebra.** A página confere no build: sem
arquivo, o `<video>` nem entra no HTML e o fundo pintado pelo CSS assume, que é
a mesma cor. Ninguém vê retângulo preto nem imagem quebrada.

## O que filmar

Dez a quinze segundos, em laço, sem corte brusco no fim (o começo tem que
emendar no fim sem solavanco). Boas cenas:

- mão de técnico com chave de precisão dentro de um aparelho aberto
- placa iluminada pela luminária da bancada
- multímetro medindo, com o ponteiro ou o número mudando
- o aparelho fechado ligando e a tela acendendo

Evite: rosto identificável sem autorização assinada, marca de cliente visível,
número de série legível na tela.

## Como preparar

O vídeo entra dessaturado e escurecido pelo CSS, então não gaste tempo com cor.
O que importa é peso: a home precisa abrir rápido no 4G de quem está com o
equipamento parado.

```bash
# 1080p, sem áudio (é mudo de qualquer forma), ~10s
ffmpeg -i original.mov -t 10 -an -vf "scale=1920:-2" \
  -c:v libx264 -crf 28 -preset slow -movflags +faststart public/video/oficina.mp4

ffmpeg -i original.mov -t 10 -an -vf "scale=1920:-2" \
  -c:v libvpx-vp9 -crf 36 -b:v 0 public/video/oficina.webm

# o pôster, do primeiro quadro
ffmpeg -i public/video/oficina.mp4 -frames:v 1 -q:v 3 public/video/oficina.jpg
```

**Mire em 2 MB para o `.mp4`.** Acima de 4 MB, o vídeo passa a atrapalhar mais
do que ajuda, e aí é melhor deixar sem.

## Quem não vê o vídeo, e por quê

Três grupos, todos de propósito:

- **quem pediu menos movimento** no sistema operacional — para parte das
  pessoas, movimento de fundo causa enjoo de verdade;
- **quem está com economia de dados ligada** ou em conexão 2G — fica o pôster,
  que pesa uns 60 KB em vez de vários megabytes;
- **quem já rolou a página** — sai da tela, o vídeo pausa; volta, retoma.
