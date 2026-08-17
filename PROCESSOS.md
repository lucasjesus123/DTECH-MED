<title>Processos DTECH MED</title>

# Como o sistema funciona, passo a passo

Tirado da máquina de estados do código, não de memória. Se um dia divergir, o código é que está certo — e este arquivo é que precisa ser corrigido.

---

## 1. A esteira: as 18 etapas de um equipamento

É o órgão vital. Todo equipamento que entra percorre esta linha, e cada passagem de etapa fica registrada com **quem fez**, **quando** e **de onde** — é isso que vira o prontuário que o cliente lê.

```mermaid
flowchart TD
    A["1 · Solicitação recebida<br/><i>site ou WhatsApp</i>"] --> B["2 · Ordem de retirada gerada<br/><i>central</i>"]
    B --> C["3 · Retirada agendada<br/><i>data, hora e motorista</i>"]
    C --> D["4 · Em rota de retirada<br/><i>motorista saiu</i>"]
    D --> E["5 · Coletado<br/><i>cliente assinou</i>"]
    E --> F["6 · Recebido na empresa<br/><i>técnico deu entrada com fotos</i>"]
    F --> G["7 · Em análise<br/><i>diagnóstico e parecer</i>"]
    G --> H["8 · Orçamento interno<br/><i>gestora revisa e fecha</i>"]
    H --> I["9 · Orçamento enviado<br/><i>WhatsApp do cliente</i>"]

    I --> J["10 · Aprovado<br/><i>cliente assinou · virou contrato</i>"]
    I --> R["Reprovado"]

    J --> K["11 · Em manutenção"]
    K --> L["12 · Manutenção concluída<br/><i>testes finais aprovados</i>"]
    L --> M["13 · Aprovação da gestão"]
    M --> N["14 · Faturamento"]
    N --> O["15 · Faturado<br/><i>pago · liberado</i>"]
    O --> P["16 · Em rota de entrega"]
    P --> Q["17 · Entregue<br/><i>assinado na porta</i>"]
    Q --> S["18 · Finalizado<br/><i>baixa final</i>"]

    R --> T["Devolvido sem reparo"]
    T --> P

    style A fill:#6D28D9,color:#fff
    style J fill:#0F6B4F,color:#fff
    style S fill:#0F6B4F,color:#fff
    style R fill:#A8203C,color:#fff
    style T fill:#8A5300,color:#fff
```

**Ramos alternativos**, que existem porque a vida real tem: `Orçamento reprovado` → o aparelho volta sem conserto. `Cancelado` → a ordem é encerrada antes do fim. Nenhum dos dois apaga o histórico; eles são mais uma etapa registrada.

---

## 2. Quem faz o quê

```mermaid
flowchart LR
    SA["SUPER ADMIN<br/><i>dono da plataforma</i>"] -->|cria| EMP["Empresa"]
    SA -->|cria| ADM["ADMIN DA EMPRESA"]
    ADM -->|cria| USR["Usuários da empresa"]

    USR --> AT["ATENDENTE"]
    USR --> GE["GESTOR"]
    USR --> TE["TÉCNICO"]
    USR --> MO["MOTORISTA"]
    USR --> FI["FINANCEIRO"]

    AT -->|"cadastra cliente<br/>gera ordem · agenda"| E1["Etapas 1–3"]
    MO -->|"retira e entrega<br/>coleta assinatura"| E2["Etapas 4, 5, 16, 17"]
    TE -->|"recebe · fotografa<br/>lauda · executa"| E3["Etapas 6, 7, 11, 12"]
    GE -->|"aprova orçamento<br/>aprova serviço · dá baixa"| E4["Etapas 8, 13, 18"]
    FI -->|"lança pagamento<br/>fecha fatura"| E5["Etapas 14, 15"]

    style SA fill:#6D28D9,color:#fff
    style ADM fill:#4A0D8F,color:#fff
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
