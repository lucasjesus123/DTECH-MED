# DTECH MED

Sistema de gestão para assistência técnica de equipamentos estéticos, médicos, odontológicos e hospitalares. Multiempresa, feito para virar franquia.

Três faces, um código:

| Face | Endereço | Para quem |
|---|---|---|
| **Site** | `/` | Cliente que precisa consertar um aparelho |
| **Painel** | `/painel` | Central, gestão, técnicos, financeiro |
| **Aplicativo** | `/app/motorista`, `/app/tecnico` | Quem trabalha na rua e na bancada |
| **Portal do cliente** | `/os/<token>` | Cliente acompanha e aprova, sem login |

---

## A ideia

O ERP que a empresa usava hoje navega por **módulo**: Pessoas, Cadastros, Financeiro, Produtos, Vendas, Caixa, O.S. Sete assuntos lado a lado, e o equipamento sem história — para saber o que estava acontecendo com o aparelho de uma clínica, alguém abria quatro telas e procurava a foto no WhatsApp de quem tinha feito a retirada. O resultado eram 173 ordens vencidas e 32 orçamentos parados, sem ninguém saber.

Aqui a espinha é a **jornada do equipamento**. O painel abre com "onde a esteira está agora": quantos aparelhos estão parados em cada etapa e há quanto tempo, do mais parado para o menos. Cada ordem tem um prontuário — a história inteira numa página.

E a esteira **anda sozinha**: o cliente é avisado no WhatsApp a cada passo, sem ninguém precisar lembrar.

---

## Os 16 passos

1. Cliente chama pelo site ou WhatsApp
2. Central abre a ordem de retirada
3. Retirada agendada, com data e janela de horário
4. Motorista sai — o cliente é avisado
5. Coleta com assinatura na tela, e o PDF sai na hora
6. Técnico dá entrada com no mínimo seis fotos
7. Análise e laudo
8. Orçamento fechado pela gestão e enviado ao cliente
9. Cliente aprova pelo link, confirmando CPF/CNPJ — vira contrato e gera O.S.
10. Execução, com as peças reservadas na aprovação
11. Testes finais e fechamento pelo técnico
12. Conferência da gestão
13. Faturamento, com pagamento fracionado
14. Entrega liberada para o motorista
15. Entrega assinada, com localização
16. Baixa final da gestão

Nenhum passo é opcional e nenhum pula a fila: a máquina de estados recusa o que não faz sentido, e diz por quê numa frase que a pessoa entende.

---

## Como o isolamento entre empresas funciona

Duas camadas independentes. Se uma falhar, a outra segura.

**Na aplicação:** toda consulta de negócio passa por `comEscopo()`, que abre transação e instala a empresa da sessão. O `tenantId` nunca vem do formulário — se viesse, bastaria trocar um campo para operar sobre a franquia do vizinho.

**No banco:** Row Level Security em todas as 24 tabelas, com `USING` e `WITH CHECK`, e `FORCE ROW LEVEL SECURITY` — que alcança até o dono das tabelas. A aplicação conecta com um papel sem `SUPERUSER` e sem `BYPASSRLS`.

Testado, não presumido: logado como administrador de uma empresa e com os identificadores exatos da outra em mãos, prontuário, foto e documento respondem 404.

---

## O que faz o histórico ter valor de prova

Cada evento da linha do tempo é encadeado por hash ao anterior. Alterar um evento antigo obriga a recalcular todos os posteriores; apagar um quebra a corrente no ponto exato — e o prontuário passa a mostrar **"histórico alterado"** em vez de "histórico íntegro".

No banco, o papel da aplicação tem `UPDATE` e `DELETE` revogados em `eventos_ordem`, `assinaturas` e `movimentos_estoque`. Nem um defeito no código reescreve a trilha.

---

## Stack

Next.js 16 (App Router, Server Actions) · React 19 · TypeScript estrito · PostgreSQL 16 · Prisma 7 · Argon2id · sharp · pdfkit · uazapi

---

## Rodando localmente

```bash
npm install
cp .env.example .env        # preencha os segredos
npm run db:deploy           # cria as tabelas
npm run db:seed -- --demo   # Super Admin + dados de demonstração
npm run dev
```

Em outro terminal, para a fila de WhatsApp e PDF:

```bash
npm run worker
```

### Comandos

| Comando | O que faz |
|---|---|
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` | Build de produção |
| `npm run typecheck` | TypeScript, sem emitir |
| `npm test` | Testes de unidade (111) |
| `npm run test:integracao` | Testes de integração contra o banco (39) |
| `npm run test:tudo` | Os dois |
| `npm run db:deploy` | Aplica as migrações |
| `npm run db:seed` | Cria o Super Admin (`-- --demo` para dados de exemplo) |
| `npm run worker` | Processa a fila de automação |

---

## Documentação

- **[DEPLOY.md](./DEPLOY.md)** — do clone ao sistema no ar na VPS, passo a passo
- **[AUDITORIA_SEGURANCA.md](./AUDITORIA_SEGURANCA.md)** — auditoria de segurança com evidência, o que foi corrigido e o que ficou para o servidor

---

## Uma coisa que vale saber antes de mexer

O `DOCUMENT_HASH_SALT` e o `ENCRYPTION_KEY` **não podem mudar** depois que o sistema estiver em uso. O primeiro é o que permite ao portal conferir o CPF/CNPJ do cliente; trocá-lo faz todas as aprovações falharem. O segundo cifra o token de WhatsApp de cada franquia; trocá-lo obriga todas a reconectar o número.
