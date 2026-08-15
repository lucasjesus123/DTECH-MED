# As fotos do site

**As fotos da DTECH já estão aqui.** Foram enviadas pelo Lucas em agosto de
2026 e recuperadas do registro desta sessão de trabalho, redimensionadas e com
os metadados removidos (inclusive a localização de GPS que o celular grava sem
avisar).

| Arquivo | O que é | Onde aparece |
| --- | --- | --- |
| `oficina` | a sala com o Heccus, o Lipocavity e as criolipólises | **primeira dobra, tela cheia** |
| `bancada` | mão de luva segurando a ponteira aberta, painel de chaves ao fundo | carrossel dos bastidores |
| `medico` | placa de circuito aberta, ao lado da pasta térmica | card Médico e carrossel |
| `estetica` | o Ozonyx sendo configurado no painel | card Estética e carrossel |
| `bancada2` | o módulo retirado de dentro da ponteira | carrossel |
| `hospitalar` | equipamento de grande porte aberto, eletrônica à mostra | card Hospitalar e carrossel |
| `detalhe` | aplicação de composto, trabalho de precisão | carrossel |

Duas ainda não existem, e o site se vira sem elas: `odontologico` (o card volta
para a marca d'água) e `logistica`.

## Como trocar ou acrescentar

Pelo GitHub, sem terminal:

1. Abra `https://github.com/lucasjesus123/DTECH-MED/tree/claude/dtech-med-technical-management-mta9r4/public/fotos`
2. **Add file → Upload files**
3. Arraste com o nome exato da tabela (minúsculas, sem acento)
4. **Commit changes**
5. Na VPS: `cd /opt/gavetas/DTECHMED && git fetch origin claude/dtech-med-technical-management-mta9r4 && git reset --hard FETCH_HEAD && bash infra/subir.sh`

A extensão pode ser `.avif`, `.webp` ou `.jpg` — a primeira que existir é a
usada. Mande na maior resolução que tiver: o Next reduz e serve o tamanho certo
para cada tela. Mínimo útil: **1600px** no lado maior para a `oficina`,
**1000px** para as demais.

## Duas coisas que valem conferir

**Captura de tela tem barra de aplicativo.** A foto do Ozonyx veio de um story
e trazia a faixa "Enviar mensagem…" no rodapé; ela foi cortada antes de entrar.
Se você mandar outra assim, avise — ou corte antes.

**Rosto de gente na foto.** A `oficina` tem alguém refletido ao fundo. No site
ela aparece escurecida e desfocada pelo véu, então quase não se nota. Se
preferir, mande outra da mesma sala sem ninguém.

## Sobre direito de uso

Estas são fotos da própria oficina, que é o caminho mais seguro dos três — e o
que funciona melhor, porque cliente reconhece oficina de verdade e desconfia de
banco de imagens.

Se um dia precisar de foto de fora: **Unsplash** e **Pexels** são gratuitos
inclusive para uso comercial. Foto puxada de busca de imagens **não serve**: a
cobrança por uso indevido costuma chegar anos depois e é cara. E foto de
catálogo de fabricante (Cutera, HTM e afins) é material de marketing **deles** —
para a DTECH, que é assistência autorizada, isso se pergunta ao fabricante, não
se presume.
