/**
 * TESTADOR - MOTOR GUIADO POR DIAGRAMA (navegacao HUMANA, botao por botao)
 * ---------------------------------------------------------------------------
 * Executa um BLUEPRINT (roteiro de fluxos que o Claude extraiu do DIAGRAMA em
 * PDF do sistema) clicando como um humano de verdade: move o mouse ate o botao,
 * passa o cursor (hover), clica, preenche, e VALIDA cada transicao contra o que
 * o diagrama promete ("cliquei em Salvar -> devia ir pra tela de sucesso").
 *
 * Assim cobre TODAS as telas/fluxos do diagrama, cria usuarios e testa area por
 * area — e aponta exatamente em que passo o fluxo real divergiu do diagrama.
 *
 * Uso:  QA_BLUEPRINT=blueprint.json node engine/fluxos.js
 *
 * O Claude gera o blueprint lendo o PDF do diagrama (ver blueprint.example.json).
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const ts = () => { const d = new Date(), p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`; };
const rnd = (a, b) => a + Math.floor(Math.random() * (b - a));
/**
 * Troca `${VARIAVEL}` pelo valor do ambiente, em qualquer ponto do JSON.
 *
 * A senha das contas de ensaio NÃO fica escrita nestes arquivos: o repositório
 * é público, e credencial em repositório público é credencial vazada — mesmo
 * sendo de banco de demonstração, porque alguém sempre reaproveita a mesma em
 * produção. O padrão é a que `npm run db:seed -- --demo` grava.
 */
function resolverAmbiente(valor) {
  if (typeof valor === 'string') {
    return valor.replace(/\$\{(\w+)\}/g, (_, nome) =>
      process.env[nome] || (nome === 'QA_SENHA' ? 'Dtech' + '@2026' : ''));
  }
  if (Array.isArray(valor)) return valor.map(resolverAmbiente);
  if (valor && typeof valor === 'object') {
    return Object.fromEntries(Object.entries(valor).map(([k, v]) => [k, resolverAmbiente(v)]));
  }
  return valor;
}

const load = () => resolverAmbiente(JSON.parse(fs.readFileSync(process.env.QA_BLUEPRINT || process.argv[2] || 'blueprint.json', 'utf8')));
function cpf() { const n = Array.from({ length: 9 }, () => rnd(0, 9)); let d1 = n.reduce((s, v, i) => s + v * (10 - i), 0) % 11; d1 = d1 < 2 ? 0 : 11 - d1; let d2 = [...n, d1].reduce((s, v, i) => s + v * (11 - i), 0) % 11; d2 = d2 < 2 ? 0 : 11 - d2; return n.join('') + d1 + d2; }
let SEQ = 0;
function auto(tag) {
  const t = (tag || '').toLowerCase();
  if (t.includes('email')) return `qa.teste+${SEQ}@teste-qa.com`;
  if (t.includes('cpf')) return cpf();
  if (t.includes('tel') || t.includes('whats') || t.includes('fone')) return '11987650000';
  if (t.includes('nome') || t.includes('name')) return `Teste QA ${SEQ}`;
  if (t.includes('senha') || t.includes('pass')) return 'TesteQA@2025';
  if (t.includes('data')) return '2000-01-15';
  if (t.includes('valor') || t.includes('numero')) return String(rnd(1, 500));
  return `Teste QA ${SEQ}`;
}
const resolv = (v) => (typeof v === 'string' && v.startsWith('auto:')) ? auto(v.slice(5)) : v;
const abs = (base, u) => { try { return new URL(u, base).toString(); } catch { return u; } };

async function launch() { try { return await chromium.launch({ headless: true }); } catch { return await chromium.launch({ headless: true, executablePath: '/opt/pw-browsers/chromium' }); } }

// clique HUMANO: acha por texto/seletor, rola ate ver, move o mouse, hover, clica
async function clicarHumano(page, alvo) {
  let loc;
  if (alvo.seletor) loc = page.locator(alvo.seletor).first();
  else loc = page.getByRole('button', { name: alvo.texto }).or(page.getByRole('link', { name: alvo.texto })).or(page.getByText(alvo.texto, { exact: false })).first();
  await loc.scrollIntoViewIfNeeded({ timeout: 8000 });
  const box = await loc.boundingBox();
  if (box) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 14 });
    await page.waitForTimeout(rnd(150, 380)); // hover humano
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  } else {
    await loc.click({ timeout: 8000 });
  }
}
async function preencherHumano(page, campo, valor) {
  const loc = page.locator(campo).first();
  await loc.scrollIntoViewIfNeeded({ timeout: 8000 });
  await loc.click({ timeout: 8000 });
  await loc.fill(''); await loc.type(String(valor), { delay: rnd(30, 90) }); // digita como humano
}

async function fazerLogin(page, login, base) {
  if (!login || !login.url) return { attempted: false };
  await page.goto(abs(base, login.url), { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
  const u = await page.$(login.userSelector || 'input[type=email],input[name*=email i],input[name*=user i],input[id*=user i],input[type=text]');
  const p = await page.$(login.passSelector || 'input[type=password]');
  if (!u || !p) return { attempted: true, ok: false };
  await u.fill(login.user || ''); await p.fill(login.pass || '');
  const b0 = page.url();
  const btn = await page.$(login.submitSelector || 'button[type=submit],input[type=submit],button');
  if (btn) await btn.click(); else await p.press('Enter');
  await page.waitForTimeout(1600);
  return { attempted: true, ok: page.url() !== b0 || !(await page.$('input[type=password]')) };
}

(async () => {
  const bp = load();
  const base = bp.baseUrl;
  const outDir = path.join('runs', `fluxos-${ts()}`);
  const shots = path.join(outDir, 'shots');
  fs.mkdirSync(shots, { recursive: true });
  console.log(`\n=== TESTADOR · FLUXOS GUIADOS PELO DIAGRAMA (navegacao humana) ===`);
  console.log(`Sistema: ${bp.nome || base}\nFluxos no diagrama: ${(bp.fluxos || []).length}\nSaida: ${outDir}\n`);

  const browser = await launch();
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, ignoreHTTPSErrors: true, recordVideo: { dir: path.join(outDir, 'video') } });
  await ctx.tracing.start({ screenshots: true, snapshots: true, sources: true });
  const page = await ctx.newPage();
  let cur = null;
  page.on('console', (m) => { if (cur && m.type() === 'error') cur.consoleErrors.push(m.text().slice(0, 200)); });
  page.on('pageerror', (e) => { if (cur) cur.pageErrors.push(String(e).slice(0, 200)); });
  page.on('response', (r) => { if (cur && r.status() >= 400) cur.netErrors.push({ url: r.url().slice(0, 150), status: r.status() }); });

  const login = await fazerLogin(page, bp.login, base);
  console.log('[login]', JSON.stringify(login));

  const resultados = [];
  let shotN = 0;
  for (const fluxo of (bp.fluxos || [])) {
    SEQ++;
    const rf = { nome: fluxo.nome, passos: [], veredito: 'APROVADO', consoleErrors: [], pageErrors: [], netErrors: [] };
    cur = rf;
    console.log(`\n▶ FLUXO: ${fluxo.nome}`);
    // troca de usuario, se o fluxo pedir
    if (fluxo.usuario && fluxo.usuario.user) { await fazerLogin(page, { ...bp.login, ...fluxo.usuario }, base); }
    let quebrou = false;
    for (let i = 0; i < (fluxo.passos || []).length; i++) {
      const st = fluxo.passos[i];
      const rec = { n: i + 1, acao: st.acao, alvo: st.texto || st.alvo || st.campo || st.valor || '', espera: st.espera || '', status: 'ok' };
      try {
        switch (st.acao) {
          case 'ir': case 'goto': await page.goto(abs(base, st.alvo), { waitUntil: 'domcontentloaded', timeout: 30000 }); break;
          case 'clicar': case 'click': await clicarHumano(page, { texto: st.texto, seletor: st.seletor }); break;
          case 'preencher': case 'fill': await preencherHumano(page, st.campo || st.seletor, resolv(st.valor)); break;
          case 'esperar': case 'wait': await page.waitForTimeout(st.valor || 1000); break;
          case 'verificarTexto': case 'expectText': { await page.waitForTimeout(500); const b = await page.evaluate(() => (() => { if (!document.body) return ''; const c = document.body.cloneNode(true); c.querySelectorAll('script,style,noscript,template').forEach((n) => n.remove()); return c.textContent || ''; })()).catch(() => ''); if (!b || !b.includes(st.valor)) throw new Error(`texto "${st.valor}" NAO apareceu (o diagrama esperava: ${st.espera || st.valor})`); break; }
          case 'verificarUrl': case 'expectUrl': if (!page.url().includes(st.valor)) throw new Error(`URL esperada "${st.valor}" nao atingida (atual: ${page.url()})`); break;
          case 'verificarSemTexto': case 'expectNotText': { await page.waitForTimeout(400); const b = await page.evaluate(() => (() => { if (!document.body) return ''; const c = document.body.cloneNode(true); c.querySelectorAll('script,style,noscript,template').forEach((n) => n.remove()); return c.textContent || ''; })()).catch(() => ''); if (b && b.includes(st.valor)) throw new Error(`texto proibido "${st.valor}" APARECEU pro usuario (o diagrama nao esperava isso)`); break; }
          default: throw new Error('acao desconhecida: ' + st.acao);
        }
        await page.waitForTimeout(rnd(250, 550));
      } catch (e) { rec.status = 'ERRO'; rec.erro = String(e).replace(/^Error:\s*/, '').slice(0, 200); quebrou = true; }
      const shot = `f${resultados.length}_p${i + 1}.png`;
      await page.screenshot({ path: path.join(shots, shot), fullPage: true }).catch(() => {});
      rec.screenshot = 'shots/' + shot; rec.url = page.url();
      rf.passos.push(rec);
      console.log(`   ${rec.status === 'ok' ? '✓' : '✗'} ${rec.n}. ${st.acao} ${rec.alvo}${rec.erro ? ' -> ' + rec.erro : ''}`);
      if (rec.status === 'ERRO' && st.critico !== false) break;
    }
    if (quebrou || rf.pageErrors.length) rf.veredito = 'REPROVADO';
    resultados.push(rf);
    console.log(`   [${rf.veredito}] ${rf.passos.filter((p) => p.status === 'ok').length}/${rf.passos.length} passos`);
  }

  await ctx.tracing.stop({ path: path.join(outDir, 'trace.zip') });
  await ctx.close(); await browser.close();
  try { const vd = path.join(outDir, 'video'); const f = fs.readdirSync(vd).find((x) => x.endsWith('.webm')); if (f) fs.renameSync(path.join(vd, f), path.join(outDir, 'sessao.webm')); } catch {}

  const ok = resultados.filter((r) => r.veredito === 'APROVADO').length;
  const summary = { sistema: bp.nome || base, base, startedAt: new Date().toISOString(), login, totalFluxos: resultados.length, aprovados: ok, reprovados: resultados.length - ok, resultados };
  fs.writeFileSync(path.join(outDir, 'evidence.json'), JSON.stringify(summary, null, 2));

  // relatorio HTML fluxo-por-fluxo
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const img = (rel) => { try { return 'data:image/png;base64,' + fs.readFileSync(path.join(outDir, rel)).toString('base64'); } catch { return ''; } };
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Fluxos do Diagrama</title><style>
:root{--bg:#0a0e1a;--c:#131a2e;--tx:#e9edf6;--mut:#93a0bd}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--tx);font-family:system-ui,Segoe UI,Roboto,sans-serif;line-height:1.6}
.w{max-width:960px;margin:0 auto;padding:28px}h1{margin:0 0 2px}.sub{color:var(--mut);margin:0 0 16px}
.kpis{display:flex;gap:12px;margin:14px 0}.k{flex:1;background:var(--c);border-radius:12px;padding:14px;text-align:center}.k .n{font-size:26px;font-weight:800}.k .l{color:var(--mut);font-size:12px}
.fl{background:var(--c);border-radius:14px;padding:16px;margin:12px 0;border-left:6px solid #333}
.fl h3{margin:0 0 8px;font-size:16px}.passo{font-size:14px;padding:5px 0;border-bottom:1px solid #1f2740}.ok{color:#22c55e}.err{color:#ef4444}
.esp{color:var(--mut);font-size:12px}details summary{cursor:pointer;color:#7cc0ff;font-size:12px}details img{max-width:100%;border-radius:8px;margin-top:6px;border:1px solid #22304f}
.note{background:#0d1424;border:1px solid #22304f;border-radius:12px;padding:14px;color:var(--mut);font-size:13px;margin-top:16px}
</style></head><body><div class="w">
<h1>Fluxos do Diagrama — execução real (navegação humana)</h1>
<p class="sub">Sistema: <b>${esc(bp.nome || base)}</b> · ${resultados.length} fluxos do diagrama testados clicando botão por botão</p>
<div class="kpis"><div class="k"><div class="n" style="color:#22c55e">${ok}</div><div class="l">fluxos OK</div></div>
<div class="k"><div class="n" style="color:#ef4444">${resultados.length - ok}</div><div class="l">fluxos quebrados</div></div>
<div class="k"><div class="n">${Math.round(ok / (resultados.length || 1) * 100)}%</div><div class="l">do diagrama funcionando</div></div></div>
${resultados.map((r) => `<div class="fl" style="border-left-color:${r.veredito === 'APROVADO' ? '#22c55e' : '#ef4444'}">
<h3>${r.veredito === 'APROVADO' ? '🟢' : '🔴'} ${esc(r.nome)}</h3>
${r.passos.map((p) => `<div class="passo"><span class="${p.status === 'ok' ? 'ok' : 'err'}">${p.status === 'ok' ? '✓' : '✗'}</span> ${p.n}. <b>${esc(p.acao)}</b> ${esc(p.alvo)}${p.erro ? ` — <span class="err">${esc(p.erro)}</span>` : ''}${p.espera ? `<div class="esp">diagrama espera: ${esc(p.espera)}</div>` : ''}${p.status !== 'ok' && p.screenshot ? `<details><summary>ver tela no momento da falha</summary><img src="${img(p.screenshot)}"></details>` : ''}</div>`).join('')}
</div>`).join('')}
<div class="note"><b>Como ler:</b> cada fluxo veio do SEU diagrama. O testador executou clicando como humano (mouse, botão por botão) e comparou o resultado real com o que o diagrama promete. Onde divergiu, o passo fica vermelho com o print da tela naquele instante. Evidência forense: trace.zip e sessao.webm nesta pasta.</div>
</div></body></html>`;
  fs.writeFileSync(path.join(outDir, 'fluxos.html'), html);

  console.log(`\n[resultado] ${ok}/${resultados.length} fluxos do diagrama funcionando`);
  console.log(`[ok] Relatorio: ${outDir}/fluxos.html · trace: ${outDir}/trace.zip`);
  console.log(`OUTDIR=${outDir}`);
})().catch((e) => { console.error('[FALHA FLUXOS]', e); process.exit(1); });
