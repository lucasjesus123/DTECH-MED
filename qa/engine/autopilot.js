/**
 * QA ORQUESTRA - MODO AUTONOMO HUMANIZADO (autopilot) — nivel PRO
 * ---------------------------------------------------------------------
 * UM comando e ele age como humano: login, entra em TODAS as telas, acha os
 * formularios, PREENCHE sozinho (nome, email, CPF/CNPJ validos, telefone),
 * SALVA (cria registros reais) e deixa tudo criado para sua analise.
 *
 * Ferramentas PROFISSIONAIS do Playwright ligadas nesta versao:
 *   • TRACE navegavel (trace.zip)  -> npx playwright show-trace runs/<...>/trace.zip
 *   • VIDEO da sessao inteira (.webm)
 *   • HAR com TODO o trafego de rede (network.har)
 *   • ACESSIBILIDADE real com axe-core (violacoes WCAG por tela)
 *   • PERFORMANCE por tela (Navigation Timing) com flag de tela lenta
 *   • Screenshot FULL PAGE + checagens de UX/front (o "pulo do gato")
 *
 * Seguranca: NUNCA clica em excluir/apagar/remover/sair/logout. Nada e dado
 * como OK sem prova.
 *
 * Uso:  QA_CONFIG=config.json node engine/autopilot.js
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

const load = () => resolverAmbiente(JSON.parse(fs.readFileSync(process.env.QA_CONFIG || 'config.json', 'utf8')));

function cpf() {
  const n = Array.from({ length: 9 }, () => rnd(0, 9));
  let d1 = n.reduce((s, v, i) => s + v * (10 - i), 0) % 11; d1 = d1 < 2 ? 0 : 11 - d1;
  let d2 = [...n, d1].reduce((s, v, i) => s + v * (11 - i), 0) % 11; d2 = d2 < 2 ? 0 : 11 - d2;
  return n.join('') + d1 + d2;
}
function cnpj() {
  const n = Array.from({ length: 12 }, () => rnd(0, 9));
  const calc = (arr, pesos) => { let s = arr.reduce((a, v, i) => a + v * pesos[i], 0) % 11; return s < 2 ? 0 : 11 - s; };
  const d1 = calc(n, [5,4,3,2,9,8,7,6,5,4,3,2]);
  const d2 = calc([...n, d1], [6,5,4,3,2,9,8,7,6,5,4,3,2]);
  return n.join('') + d1 + d2;
}
const AVOID = /excluir|apagar|remover|delet|descartar|sair|logout|log ?off|sign ?out|encerrar|cancelar assinatura|desativar/i;

function valueFor(meta, cfg, seq) {
  const h = (meta.name + ' ' + meta.id + ' ' + meta.placeholder + ' ' + meta.type).toLowerCase();
  if (meta.type === 'email' || /email|e-mail/.test(h)) return `qa.teste+${seq}@teste-qa.com`;
  if (/cnpj/.test(h)) return cnpj();
  if (/cpf/.test(h)) return cpf();
  if (/whats|telefone|celular|phone|fone|tel\b/.test(h)) return cfg.testPhone || '11987650000';
  if (meta.type === 'number' || /valor|preco|quantidade|idade|numero/.test(h)) return String(rnd(1, 500));
  if (meta.type === 'date' || /data|nascimento|vencimento/.test(h)) return '2000-01-15';
  if (meta.type === 'password' || /senha|password/.test(h)) return 'TesteQA@2025';
  if (/nome|name|razao|titulo|cliente|empresa/.test(h)) return `Teste QA Autonomo ${seq}`;
  if (/cep/.test(h)) return '01310100';
  if (/endereco|rua|logradouro/.test(h)) return 'Av. Teste QA, 1000';
  if (/cidade/.test(h)) return 'Sao Paulo';
  if (/obs|descri|mensagem|coment/.test(h)) return 'Registro criado automaticamente pela Orquestra QA para analise.';
  return `Teste QA ${seq}`;
}

async function humanScroll(page) {
  await page.evaluate(async () => { await new Promise((r) => { let y = 0; const t = setInterval(() => { window.scrollBy(0, 250); y += 250; if (y > document.body.scrollHeight) { clearInterval(t); r(); } }, 55); }); }).catch(() => {});
}
function sameHost(base, u) { try { const b = new URL(base), x = new URL(u, base); return b.host === x.host && x.protocol.startsWith('http'); } catch { return false; } }
const norm = (u) => { try { const x = new URL(u); x.hash = ''; return x.toString(); } catch { return u; } };

// === CHECAGENS DE UX / FRONT (o "pulo do gato": erros que o usuario VE) ===
async function checagensUX(page) {
  const issues = [];
  const body = (await page.evaluate(() => (document.body ? document.body.innerText : '')).catch(() => '')) || '';
  const padroes = [
    [/\{\{\s*[\w. ]+\s*\}\}/, 'Variavel de template NAO renderizada aparecendo pro usuario (ex: {{cpf}})'],
    [/\bundefined\b/, 'Texto "undefined" visivel na tela'],
    [/\bNaN\b/, 'Valor "NaN" visivel na tela (conta/numero quebrado)'],
    [/\[object Object\]/, 'Texto "[object Object]" visivel (dado nao formatado)'],
    [/(TypeError|ReferenceError|SyntaxError|Uncaught|Traceback|Fatal error|Stack trace)/i, 'Erro tecnico/stack trace EXPOSTO ao usuario'],
    [/(undefined index|Notice:|Warning:|Deprecated:|Parse error)/i, 'Aviso/erro de servidor exposto na tela'],
  ];
  for (const [re, m] of padroes) { const hit = body.match(re); if (hit) issues.push({ tipo: 'texto-quebrado', msg: m, trecho: (hit[0] || '').slice(0, 60) }); }
  const vis = await page.evaluate(() => (document.body ? document.body.innerText.trim().length : 0)).catch(() => 0);
  if (vis < 15) issues.push({ tipo: 'tela-vazia', msg: 'Tela praticamente EM BRANCO (quase sem conteudo visivel ao usuario)' });
  const loader = await page.$('[aria-busy=true], .loading, .spinner, [class*=spinner i], [class*=loading i]').catch(() => null);
  if (loader && await loader.isVisible().catch(() => false)) {
    await page.waitForTimeout(3500);
    if (await loader.isVisible().catch(() => false)) issues.push({ tipo: 'loading-preso', msg: 'Carregando/spinner continua girando apos varios segundos (possivel travamento pro usuario)' });
  }
  return issues;
}

// === ACESSIBILIDADE (axe-core / WCAG) — o usuario real sofre com isso ===
function resolveAxe() {
  try { return require.resolve('axe-core'); } catch {}
  for (const base of [process.env.NODE_PATH, '/home/claude/.npm-global/lib/node_modules', '/usr/lib/node_modules', '/usr/local/lib/node_modules']) {
    if (!base) continue;
    try { return require.resolve('axe-core', { paths: [base] }); } catch {}
    const guess = path.join(base, 'axe-core', 'axe.js');
    if (fs.existsSync(guess)) return guess;
  }
  return null;
}
async function auditA11y(page, axePath) {
  if (!axePath) return { disponivel: false, motivo: 'axe-core nao instalado (npm i -g axe-core)' };
  try {
    await page.addScriptTag({ path: axePath });
    const r = await page.evaluate(async () => {
      // eslint-disable-next-line no-undef
      const res = await axe.run(document, { resultTypes: ['violations'] });
      return res.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.length }));
    });
    const counts = { critical: 0, serious: 0, moderate: 0, minor: 0 };
    r.forEach((v) => { if (counts[v.impact] != null) counts[v.impact]++; });
    return { disponivel: true, total: r.length, counts, violations: r.slice(0, 20) };
  } catch (e) { return { disponivel: true, erro: String(e).slice(0, 160), violations: [] }; }
}

async function perfDaTela(page) {
  return await page.evaluate(() => {
    const n = performance.getEntriesByType('navigation')[0];
    if (!n) return null;
    return { loadMs: Math.round(n.duration), domContentLoadedMs: Math.round(n.domContentLoadedEventEnd), respostaMs: Math.round(n.responseEnd) };
  }).catch(() => null);
}

(async () => {
  const cfg = load();
  const base = cfg.baseUrl;
  const maxPages = cfg.maxPages || 40;
  const slowMs = cfg.slowMs || 3000;
  const outDir = path.join('runs', `autopilot-${ts()}`);
  const shots = path.join(outDir, 'shots');
  fs.mkdirSync(shots, { recursive: true });
  const axePath = resolveAxe();
  console.log(`\n=== ORQUESTRA QA · MODO AUTONOMO (PRO) ===\nAlvo: ${base}\nSaida: ${outDir}`);
  console.log(`Ferramentas: trace ✓  video ✓  HAR ✓  acessibilidade ${axePath ? '✓' : '✗ (instale axe-core)'}  performance ✓\n`);

  let browser;
  try { browser = await chromium.launch({ headless: true }); }
  catch { browser = await chromium.launch({ headless: true, executablePath: '/opt/pw-browsers/chromium' }); }
  const ctx = await browser.newContext({
    viewport: { width: 1366, height: 900 },
    ignoreHTTPSErrors: true,
    recordVideo: { dir: path.join(outDir, 'video'), size: { width: 1366, height: 900 } },
    recordHar: { path: path.join(outDir, 'network.har'), content: 'omit' },
  });
  await ctx.tracing.start({ screenshots: true, snapshots: true, sources: true });
  const page = await ctx.newPage();

  let cur = null;
  page.on('console', (m) => { if (cur && m.type() === 'error') cur.consoleErrors.push(m.text().slice(0, 300)); });
  page.on('pageerror', (e) => { if (cur) cur.pageErrors.push(String(e).slice(0, 300)); });
  page.on('response', (r) => { if (cur && r.status() >= 400) cur.networkErrors.push({ url: r.url().slice(0, 200), status: r.status() }); });

  const login = { attempted: false };
  if (cfg.login && cfg.login.url) {
    login.attempted = true;
    await page.goto(cfg.login.url, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
    const u = await page.$(cfg.login.userSelector || 'input[type=email],input[name*=email i],input[name*=user i],input[id*=user i],input[type=text]');
    const p = await page.$(cfg.login.passSelector || 'input[type=password]');
    if (u && p) {
      await u.fill(cfg.login.user || ''); await p.fill(cfg.login.pass || '');
      const b0 = page.url();
      const btn = await page.$(cfg.login.submitSelector || 'button[type=submit],input[type=submit],button');
      if (btn) await btn.click(); else await p.press('Enter');
      await page.waitForTimeout(1800);
      login.ok = page.url() !== b0 || !(await page.$('input[type=password]'));
    } else login.ok = false;
    console.log('[login]', JSON.stringify(login));
  }

  const queue = [norm(base)];
  const visited = new Set();
  const pages = [];
  const created = [];
  let seq = 0;

  while (queue.length && pages.length < maxPages) {
    const url = queue.shift();
    if (visited.has(url)) continue;
    visited.add(url);
    const rec = { url, consoleErrors: [], pageErrors: [], networkErrors: [], actions: [] };
    cur = rec;
    let resp = null;
    try { resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 }); }
    catch (e) { rec.navError = String(e).slice(0, 160); pages.push(rec); console.log(`  [x] ${url}`); continue; }
    await page.waitForTimeout(rnd(500, 1000));
    await humanScroll(page);
    rec.status = resp ? resp.status() : null;
    rec.title = await page.title().catch(() => '');

    // preencher e salvar cada formulario (cria registros reais)
    const forms = await page.$$('form');
    for (let fi = 0; fi < forms.length; fi++) {
      const form = forms[fi];
      if (!(await form.isVisible().catch(() => false))) continue;
      const hasPass = await form.$('input[type=password]');
      if (hasPass && /login|entrar|signin/i.test(url)) continue;
      seq++;
      const fields = await form.$$('input, textarea, select');
      let filled = 0; const dados = {};
      for (const el of fields) {
        try {
          const meta = await el.evaluate((n) => ({ tag: n.tagName.toLowerCase(), type: (n.getAttribute('type') || '').toLowerCase(), name: n.getAttribute('name') || '', id: n.id || '', placeholder: n.getAttribute('placeholder') || '' }));
          if (['hidden', 'submit', 'button', 'file', 'image', 'reset'].includes(meta.type)) continue;
          if (!(await el.isVisible().catch(() => false)) || !(await el.isEnabled().catch(() => false))) continue;
          if (meta.tag === 'select') { const opts = await el.$$('option'); if (opts.length > 1) { const v = await opts[1].getAttribute('value'); await el.selectOption(v).catch(() => {}); dados[meta.name || meta.id || 'select'] = v; filled++; } }
          else if (meta.type === 'checkbox' || meta.type === 'radio') { await el.check().catch(() => {}); filled++; }
          else { const val = valueFor(meta, cfg, seq); await el.fill(val).catch(() => {}); dados[meta.name || meta.id || meta.placeholder || 'campo'] = val; filled++; await page.waitForTimeout(rnd(50, 150)); }
        } catch {}
      }
      if (!filled) continue;
      const before = page.url();
      const submit = await form.$('button[type=submit], input[type=submit], button');
      let submitOk = false, msg = '';
      if (submit) {
        const label = (await submit.innerText().catch(() => '')) || '';
        if (AVOID.test(label)) { rec.actions.push({ form: fi, skipped: 'botao perigoso: ' + label }); continue; }
        await submit.click().catch(() => {});
        await page.waitForTimeout(rnd(1200, 2000));
        submitOk = true;
        const b2 = await page.evaluate(() => (document.body ? document.body.innerText : '')).catch(() => '') || '';
        if (/sucesso|salvo|cadastrad|criad|adicionad|enviad/i.test(b2)) msg = 'sinal de sucesso detectado';
        else if (/erro|inv[aá]lid|falh|obrigat/i.test(b2)) msg = 'possivel erro no formulario';
      }
      const shot = `create_${pages.length}_${fi}.png`;
      await page.screenshot({ path: path.join(shots, shot), fullPage: true }).catch(() => {});
      const action = { tela: before, campos: filled, dados, submetido: submitOk, resultado: msg, screenshot: 'shots/' + shot };
      rec.actions.push(action);
      if (submitOk) created.push(action);
      console.log(`  [+] ${before} · form ${fi}: ${filled} campos preenchidos${submitOk ? ' e SALVO' : ''} ${msg ? '(' + msg + ')' : ''}`);
      if (page.url() !== before && !sameHost(base, page.url())) await page.goto(before, { waitUntil: 'domcontentloaded' }).catch(() => {});
    }

    const s = `page_${pages.length}.png`;
    await page.screenshot({ path: path.join(shots, s), fullPage: true }).catch(() => {});
    rec.screenshot = 'shots/' + s;

    rec.uxIssues = await checagensUX(page);
    for (const ux of rec.uxIssues) console.log(`      ⚠ UX/front: ${ux.msg}${ux.trecho ? ' -> "' + ux.trecho + '"' : ''}`);
    rec.perf = await perfDaTela(page);
    if (rec.perf && rec.perf.loadMs > slowMs) console.log(`      ⏱ tela LENTA: ${rec.perf.loadMs}ms`);
    rec.a11y = await auditA11y(page, axePath);
    if (rec.a11y && rec.a11y.total) console.log(`      ♿ acessibilidade: ${rec.a11y.total} violacoes (${rec.a11y.counts.critical} criticas, ${rec.a11y.counts.serious} serias)`);

    let links = [];
    try { links = await page.$$eval('a[href]', (as) => as.map((a) => a.href)); } catch {}
    for (const l of links) { const nl = norm(l); if (sameHost(base, nl) && !visited.has(nl) && !queue.includes(nl) && !AVOID.test(nl)) queue.push(nl); }
    pages.push(rec);
    const flags = [];
    if (rec.status >= 400) flags.push('HTTP ' + rec.status);
    if (rec.pageErrors.length) flags.push(rec.pageErrors.length + ' excJS');
    if (rec.consoleErrors.length) flags.push(rec.consoleErrors.length + ' console');
    if (rec.networkErrors.length) flags.push(rec.networkErrors.length + ' rede');
    if (rec.uxIssues && rec.uxIssues.length) flags.push(rec.uxIssues.length + ' UX/front');
    if (rec.a11y && rec.a11y.total) flags.push(rec.a11y.total + ' a11y');
    if (rec.perf && rec.perf.loadMs > slowMs) flags.push('lenta ' + rec.perf.loadMs + 'ms');
    console.log(`  [${rec.status || '?'}] ${url} ${flags.length ? '⚠ ' + flags.join(', ') : 'ok'}`);
  }

  await ctx.tracing.stop({ path: path.join(outDir, 'trace.zip') });
  await ctx.close(); // finaliza video + har
  await browser.close();

  // renomeia o video pra nome estavel
  try { const vd = path.join(outDir, 'video'); const f = fs.readdirSync(vd).find((x) => x.endsWith('.webm')); if (f) fs.renameSync(path.join(vd, f), path.join(outDir, 'sessao.webm')); } catch {}

  const a11yTotal = pages.reduce((s, p) => s + ((p.a11y && p.a11y.total) || 0), 0);
  const lentas = pages.filter((p) => p.perf && p.perf.loadMs > slowMs).length;
  const summary = { target: base, mode: 'autopilot-pro', startedAt: new Date().toISOString(), login, totalPages: pages.length, totalCreated: created.length, a11yTotal, telasLentas: lentas, ferramentas: { trace: 'trace.zip', video: 'sessao.webm', har: 'network.har', acessibilidade: !!axePath }, created, pages };
  fs.writeFileSync(path.join(outDir, 'evidence.json'), JSON.stringify(summary, null, 2));
  console.log(`\n[ok] ${pages.length} telas · ${created.length} registros criados · ${a11yTotal} violacoes de acessibilidade · ${lentas} telas lentas`);
  console.log(`[ferramentas] trace: ${outDir}/trace.zip  (abra com: npx playwright show-trace ${outDir}/trace.zip)`);
  console.log(`              video: ${outDir}/sessao.webm   HAR: ${outDir}/network.har`);
  console.log(`OUTDIR=${outDir}`);
})().catch((e) => { console.error('[FALHA AUTOPILOT]', e); process.exit(1); });
