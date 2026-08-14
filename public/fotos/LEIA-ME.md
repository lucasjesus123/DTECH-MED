# As fotos do site

Sete nomes. Cada arquivo que cair aqui aparece no próximo build; enquanto não
cair, o site mostra a alternativa que já existe — nunca uma imagem quebrada.

| Arquivo | Onde aparece | O que fotografar |
| --- | --- | --- |
| `oficina` | **primeira dobra, tela cheia** | a bancada com equipamento aberto, de cima ou 3/4, iluminada |
| `bancada` | seção do prontuário | mão de técnico com ferramenta de precisão dentro do aparelho |
| `estetica` | card Estética | laser, luz pulsada, criolipólise, radiofrequência |
| `medico` | card Médico | monitor multiparâmetro, bisturi, bomba de infusão |
| `odontologico` | card Odontológico | cadeira, autoclave, fotopolimerizador |
| `hospitalar` | card Hospitalar | autoclave grande, mesa cirúrgica, aspirador |
| `logistica` | serviço de transporte | van ou caixa lacrada com etiqueta |

A extensão pode ser `.avif`, `.webp` ou `.jpg`, nesta ordem de preferência — a
primeira que existir é a usada. AVIF pesa cerca de metade de um JPEG para a
mesma qualidade aparente, e o Next converte sozinho se você mandar JPEG.

**A `oficina` é a que mais importa.** É a primeira coisa que a pessoa vê, e é o
que faz um site parecer caro ou parecer um panfleto.

## Tamanho

Mande na maior resolução que tiver — o Next redimensiona e serve o tamanho
certo para cada tela. Mínimo útil: **1600px** no lado maior para a `oficina`,
**1000px** para as demais.

## Como subir

Pelo GitHub, sem terminal:

1. Abra `https://github.com/lucasjesus123/DTECH-MED/tree/claude/dtech-med-technical-management-mta9r4/public/fotos`
2. **Add file → Upload files**
3. Arraste os arquivos, com os nomes exatos da tabela acima
4. **Commit changes**
5. Na VPS: `cd /opt/gavetas/DTECHMED && git fetch origin claude/dtech-med-technical-management-mta9r4 && git reset --hard FETCH_HEAD && bash infra/subir.sh`

## Sobre direito de uso

Foto puxada de busca de imagens **não serve** para site comercial: a cobrança
por uso indevido costuma chegar anos depois e é cara. Três caminhos seguros:

- **foto da oficina de vocês** — a melhor de todas, porque cliente reconhece
  oficina de verdade e desconfia de banco de imagens;
- **Unsplash** ou **Pexels**, que são gratuitos inclusive para uso comercial;
- banco pago com a licença no nome da empresa.

Foto de catálogo de fabricante (Cutera, HTM e afins) é material de marketing
**deles**. Para a DTECH, que é assistência autorizada, usar a imagem da marca
que atende pode ser aceitável — mas isso se pergunta ao fabricante, não se
presume.
