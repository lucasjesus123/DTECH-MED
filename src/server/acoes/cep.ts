'use server'

/**
 * O CEP QUE PUXA O ENDEREÇO.
 *
 * =============================================================================
 * ELA NUNCA PODE TRAVAR O CADASTRO
 * =============================================================================
 * Esta é a única regra que importa aqui, e ela decide todo o resto do arquivo.
 *
 * A consulta depende de um serviço de fora. Serviço de fora cai, fica lento,
 * muda de formato e devolve coisa estranha — e nada disso pode impedir alguém
 * de cadastrar um cliente. O endereço sempre pode ser digitado à mão; a busca é
 * uma COMODIDADE, não um passo do cadastro.
 *
 * Por isso: prazo curto (3 s), toda falha vira "não achei" em vez de erro, e o
 * formulário segue funcionando com os campos vazios.
 *
 * =============================================================================
 * POR QUE NO SERVIDOR, E NÃO NO NAVEGADOR
 * =============================================================================
 * Três motivos, em ordem de peso:
 *
 * 1. O navegador de quem trabalha na oficina está num 4G ruim, atrás do
 *    Wi-Fi da clínica, às vezes com o DNS do provedor. O servidor tem rota
 *    estável e é o mesmo para todo mundo.
 * 2. A resposta é a mesma para o mesmo CEP, sempre. No servidor ela pode ser
 *    guardada; no navegador de cada pessoa, não.
 * 3. Bloqueio de terceiros no navegador não derruba o cadastro sem aviso.
 *
 * =============================================================================
 * DOIS SERVIÇOS, E POR QUÊ
 * =============================================================================
 * ViaCEP primeiro, BrasilAPI como reserva. Não é excesso: são os dois serviços
 * públicos de CEP do Brasil, os dois caem de vez em quando, e a consulta é
 * barata. Tentar o segundo custa mais 3 segundos no pior caso e evita a
 * pergunta "por que o CEP parou de funcionar hoje".
 */

export type EnderecoDoCep =
  | { ok: true; logradouro: string; bairro: string; cidade: string; uf: string }
  | { ok: false; motivo: string }

/** Só os oito dígitos. O que a pessoa digita vem com ponto, traço e espaço. */
function limpar(cep: string): string {
  return cep.replace(/\D/g, '')
}

async function buscarEm(url: string, mapear: (j: unknown) => EnderecoDoCep): Promise<EnderecoDoCep | null> {
  try {
    const controle = new AbortController()
    const prazo = setTimeout(() => controle.abort(), 3000)
    const r = await fetch(url, { signal: controle.signal, headers: { accept: 'application/json' } })
    clearTimeout(prazo)
    if (!r.ok) return null
    return mapear(await r.json())
  } catch {
    // Qualquer coisa: rede caída, prazo estourado, JSON inválido. Todas viram
    // "não deu" e a próxima tentativa (ou o preenchimento à mão) assume.
    return null
  }
}

export async function buscarCep(cep: string): Promise<EnderecoDoCep> {
  const d = limpar(cep)
  if (d.length !== 8) return { ok: false, motivo: 'O CEP precisa ter 8 dígitos.' }

  const viaCep = await buscarEm(`https://viacep.com.br/ws/${d}/json/`, (j) => {
    const o = j as Record<string, unknown>
    // O ViaCEP responde 200 com `{ erro: true }` para CEP inexistente — não é
    // erro de HTTP, é sucesso dizendo "não existe". Sem esta linha o endereço
    // sairia com quatro campos vazios e a pessoa acharia que a busca funcionou.
    if (o.erro) return { ok: false, motivo: 'CEP não encontrado.' }
    return {
      ok: true,
      logradouro: String(o.logradouro ?? ''),
      bairro: String(o.bairro ?? ''),
      cidade: String(o.localidade ?? ''),
      uf: String(o.uf ?? ''),
    }
  })
  if (viaCep) return viaCep

  const brasil = await buscarEm(`https://brasilapi.com.br/api/cep/v1/${d}`, (j) => {
    const o = j as Record<string, unknown>
    return {
      ok: true,
      logradouro: String(o.street ?? ''),
      bairro: String(o.neighborhood ?? ''),
      cidade: String(o.city ?? ''),
      uf: String(o.state ?? ''),
    }
  })
  if (brasil) return brasil

  return {
    ok: false,
    // A frase diz o que fazer, e não só o que houve. "Erro ao consultar CEP"
    // deixa a pessoa parada olhando para o formulário.
    motivo: 'Não consegui consultar o CEP agora. Preencha o endereço à mão — o cadastro salva do mesmo jeito.',
  }
}
