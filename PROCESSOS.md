<title>Processos DTECH MED</title>

# Como o sistema funciona, passo a passo

Tirado da máquina de estados do código, não de memória. Se um dia divergir, o código é que está certo — e este arquivo é que precisa ser corrigido.

---

## 1. A esteira: 18 etapas, 11 passos, 3 fases

É o órgão vital. Todo equipamento que entra percorre esta linha, e cada passagem de etapa fica registrada com **quem fez**, **quando** e **de onde** — é isso que vira o prontuário que o cliente lê.

O mesmo caminho é contado em três alturas, e cada uma serve a uma pergunta:

| Contagem | Onde mora | Para que serve |
| --- | --- | --- |
| **18 etapas** | `maquina-estados.ts` | São as **travas**. Cada uma confere assinatura, foto, orçamento ou pagamento antes de deixar a ordem andar. É o que valida. |
| **11 passos** | `roteiro.ts` | É o **dia**. É como o dono conta o trabalho em voz alta ao telefone. |
| **3 fases** | `fases.ts` | É a **tela**. É o que a pessoa vê antes de ler qualquer coisa. |

Agrupar é desenho, nunca permissão: ninguém pula uma trava porque seis quadradinhos viraram um botão.

```mermaid
flowchart TB
    subgraph F1["FASE 1 · BUSCAR O APARELHO — central e motorista"]
        direction LR
        A1["1<br/>Solicitação<br/>recebida"] --> A2["2<br/>Ordem<br/>gerada"] --> A3["3<br/>Retirada<br/>agendada"] --> A4["4<br/>Em rota<br/>de retirada"] --> A5["5<br/>Coletado<br/><i>assinado</i>"]
    end

    subgraph F2["FASE 2 · CONSERTAR — técnico e gestão"]
        direction LR
        B1["6<br/>Recebido<br/><i>com fotos</i>"] --> B2["7<br/>Em<br/>análise"] --> B3["8<br/>Orçamento<br/>interno"] --> B4["9<br/>Orçamento<br/>enviado"] --> B5["10<br/>Aprovado<br/><i>virou contrato</i>"] --> B6["11<br/>Em<br/>manutenção"] --> B7["12<br/>Manutenção<br/>concluída"] --> B8["13<br/>Aprovação<br/>da gestão"]
    end

    subgraph F3["FASE 3 · DEVOLVER E RECEBER — financeiro e motorista"]
        direction LR
        D1["14<br/>Faturamento"] --> D2["15<br/>Faturado<br/><i>pago</i>"] --> D3["16<br/>Em rota<br/>de entrega"] --> D4["17<br/>Entregue<br/><i>assinado</i>"] --> D5["18<br/>Finalizado"]
    end

    A5 --> B1
    B4 -.->|"recusou"| X["Devolvido<br/>sem reparo"]
    B8 --> D1
    X -.-> D3

    style A1 fill:#6D28D9,color:#fff,stroke:#4A0D8F
    style B5 fill:#0F6B4F,color:#fff,stroke:#0A4A37
    style D5 fill:#0F6B4F,color:#fff,stroke:#0A4A37
    style X fill:#8A5300,color:#fff,stroke:#5C3800
```

**A fase é o lugar do aparelho no mundo**, e é por isso que o corte é aí: na fase 1 ele está com o cliente ou na rua; na 2 está na bancada; na 3 já está consertado e o que falta é dinheiro e estrada. Trocar de fase é o equipamento mudar de lugar — dá para dizer em que fase uma ordem está sem abrir nada.

**Uma cor nunca conta a história sozinha.** Verde (pronta), laranja (acontecendo agora) e vermelho (ainda não começou) são a leitura de longe; ao lado de cada uma vai um selo desenhado (✓ ● ○ !) e a situação escrita. Cerca de um homem em cada doze não separa verde de vermelho, e um sistema que só diz "está verde" está mandando essa pessoa adivinhar.

**A trava da fase é de olho, não de mão.** Uma fase adiante pode ser aberta e lida — conferir o que vem depois não faz mal a ninguém. O que ela não tem é botão que ande a esteira, porque quem impede a fase 2 de começar antes da 1 é a máquina de estados, e não a tela.

**Ramos alternativos**, que existem porque a vida real tem: `Orçamento reprovado` → o aparelho volta sem conserto. `Cancelado` → a ordem é encerrada antes do fim. Nenhum dos dois apaga o histórico; eles são mais uma etapa registrada.

---

## 2. Quem faz o quê

```mermaid
flowchart TB
    SA["SUPER ADMIN<br/><i>dono da plataforma</i>"] --> EMP["Empresa"] --> ADM["ADMIN DA EMPRESA"] --> USR["Usuários"]

    USR --> AT["ATENDENTE<br/><i>etapas 1–3</i><br/>cadastra cliente<br/>gera ordem · agenda"]
    USR --> MO["MOTORISTA<br/><i>etapas 4, 5, 16, 17</i><br/>retira e entrega<br/>coleta assinatura"]
    USR --> TE["TÉCNICO<br/><i>etapas 6, 7, 11, 12</i><br/>recebe · fotografa<br/>lauda · executa"]
    USR --> GE["GESTOR<br/><i>etapas 8, 13, 18</i><br/>aprova orçamento<br/>aprova serviço · baixa"]
    USR --> FI["FINANCEIRO<br/><i>etapas 14, 15</i><br/>lança pagamento<br/>fecha fatura"]

    style SA fill:#6D28D9,color:#fff,stroke:#4A0D8F
    style ADM fill:#4A0D8F,color:#fff,stroke:#3A0A70
```

O papel decide **o que aparece na tela** e **o que a pessoa pode fazer**. As duas coisas são conferidas separadamente: esconder o botão é conforto, quem autoriza de verdade é a trava na ação e a política no banco.

---

## 3. As quatro faces do mesmo sistema

```mermaid
flowchart TB
    subgraph PUB["Aberto ao público"]
        SITE["SITE · dtechmed.com.br<br/><i>captação e prova</i>"]
        PORT["PORTAL DO CLIENTE · /os/token<br/><i>acompanha, aprova, assina</i>"]
    end

    subgraph INT["Com login"]
        PAN["SISTEMA · /painel<br/><i>central, gestão, financeiro</i>"]
        APPT["APP DO TÉCNICO<br/><i>celular, na bancada</i>"]
        APPM["APP DO MOTORISTA<br/><i>celular, na rua</i>"]
    end

    SITE -->|"formulário de retirada"| PAN
    PAN -->|"link por WhatsApp"| PORT
    PORT -->|"aprovação assinada"| PAN
    APPT --> PAN
    APPM --> PAN

    style SITE fill:#6D28D9,color:#fff
    style PAN fill:#4A0D8F,color:#fff
```

O portal do cliente **não pede senha**: o link que chega no WhatsApp carrega um token longo que faz o papel de chave. Por isso ele é bloqueado no `robots.txt` e marcado como não-indexável — link de ordem de serviço no Google seria o prontuário de uma clínica achável por qualquer pessoa.

---

## 4. O orçamento, do rascunho ao contrato

```mermaid
stateDiagram-v2
    [*] --> RASCUNHO: técnico monta
    RASCUNHO --> EM_REVISAO: envia para a gestão
    EM_REVISAO --> RASCUNHO: gestão devolve
    EM_REVISAO --> ENVIADO: gestão libera
    ENVIADO --> APROVADO: cliente assina
    ENVIADO --> REPROVADO: cliente recusa
    ENVIADO --> EXPIRADO: passou da validade
    EM_REVISAO --> CANCELADO
    APROVADO --> [*]: vira contrato e gera a O.S.
```

A assinatura do cliente no portal é o que transforma orçamento em contrato. Ela é guardada com o CPF/CNPJ conferido, o horário e o endereço de onde veio.

---

## 5. O que dispara sozinho

```mermaid
flowchart LR
    ET["Mudança de etapa"] --> FILA["Fila de automação"]
    FILA --> W1["WhatsApp ao cliente"]
    FILA --> W2["PDF do orçamento"]
    FILA --> W3["Comprovante de retirada"]
    FILA --> W4["Aviso à equipe"]

    style FILA fill:#8A5300,color:#fff
```

Nada disso acontece dentro do clique de quem está usando o sistema: entra numa fila e um processo separado executa. É o que impede a geração de um PDF de travar a tela de quem está atendendo — e o que permite tentar de novo quando o WhatsApp está fora do ar.

> ⚠️ **Hoje esta parte está parada.** O `UAZAPI_ADMIN_TOKEN` está vazio, então não há número de WhatsApp conectado. A fila funciona e acumula; ela só não tem para onde entregar. Enquanto isso, o cliente não recebe o link da ordem, nem o orçamento, nem aviso de etapa.

---

## 6. O dinheiro

```mermaid
flowchart LR
    OS["O.S. aprovada"] --> FAT["Fatura gerada"]
    FAT --> P1["Pagamento parcial"]
    FAT --> P2["Pagamento total"]
    P1 --> SALDO["Saldo em aberto"]
    SALDO --> P1
    P2 --> QUIT["Quitada"]
    SALDO -->|"último pagamento"| QUIT
    QUIT --> LIB["Libera a entrega"]
```

A fatura aceita **pagamento fracionado**: várias baixas parciais até quitar. A entrega só é liberada com a fatura quitada — é a trava que impede o equipamento de sair sem o pagamento fechado.

---

## 7. O isolamento entre empresas

O sistema é multiempresa e vai virar franquia. O isolamento não depende do código lembrar de filtrar:

```mermaid
flowchart TB
    APP["Aplicação<br/><i>papel dtechmed_app</i>"] --> RLS["PostgreSQL · Row Level Security<br/><i>FORCE em todas as 25 tabelas</i>"]
    RLS --> E1["Empresa A"]
    RLS --> E2["Empresa B"]
    E1 -.->|"impossível"| E2

    style RLS fill:#0F6B4F,color:#fff
```

O papel que serve a aplicação **não é superusuário e não ignora RLS**. Uma consulta sem filtro devolve zero linhas em vez de devolver tudo. Cada `subir.sh` confere isso e recusa o deploy se alguma tabela estiver frouxa.
