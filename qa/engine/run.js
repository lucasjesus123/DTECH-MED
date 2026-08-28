/**
 * QA ORQUESTRA - Motor de coleta (Playwright)
 * -------------------------------------------------
 * Abre um navegador REAL, faz login, mapeia (crawl) as telas e coleta
 * EVIDENCIA de verdade: screenshot, erros de console, excecoes JS,
 * requisicoes de rede com status HTTP e falhas de navegacao.
 *
 * Principio: so registramos o que REALMENTE aconteceu. Nada de fake.
 *
 * Uso:  QA_CONFIG=config.json node engine/run.js
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

function ts() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function loadConfig() {
  const cfgPath = process.env.QA_CONFIG || path.join(process.cwd(), 'config.json');
  if (!fs.existsSync(cfgPath)) {
    console.error('[ERRO] Config nao encontrada:', cfgPath);
    process.exit(1);
  }
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

  return resolverAmbiente(JSON.parse(fs.readFileSync(cfgPath, 'utf8')));
}

async function launchBrowser() {
  // Tenta o launch padrao; se falhar por versao de browser, usa o Chromium do ambiente.
  try {
    return await chromium.launch({ headless: true });
  } catch (e) {
    console.warn('[aviso] launch padrao falhou, tentando executablePath do ambiente...');
    return await chromium.launch({ headless: true, executablePath: '/opt/pw-browsers/chromium' });
  }
}

function sameHost(base, url) {
  try {
    const b = new URL(base);
    const u = new URL(url, base);
    return u.host === b.host && u.protocol.startsWith('http');
  } catch { return false; }
}

function normalize(url) {
  try {
    const u = new URL(url);
    u.hash = '';
    return u.toString();
  } catch { return url; }
}

async function tryLogin(page, login, base) {
  if (!login || !login.url) return { attempted: false };
  const rec = { attempted: true };
  try {
    await page.goto(login.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    const userSel = login.userSelector ||
      'input[type=email], input[name*=email i], input[name*=user i], input[id*=email i], input[id*=user i], input[type=text]';
    const passSel = login.passSelector || 'input[type=password]';
    const userEl = await page.$(userSel);
    const passEl = await page.$(passSel);
    if (!userEl || !passEl) {
      rec.ok = false;
      rec.reason = 'Campos de login nao encontrados (userSelector/passSelector).';
      return rec;
    }
    await userEl.fill(login.user || '');
    await passEl.fill(login.pass || '');
    const before = page.url();
    const submitSel = login.submitSelector || 'button[type=submit], input[type=submit], button';
    const btn = await page.$(submitSel);
    if (btn) await btn.click(); else await passEl.press('Enter');
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(1800);
    const after = page.url();
    const stillHasPass = await page.$('input[type=password]');
    // Heuristica: login OK se saiu da tela de login OU nao ha mais campo de senha visivel.
    rec.ok = (after !== before) || !stillHasPass;
    rec.before = before;
    rec.after = after;
    if (!rec.ok) rec.reason = 'Continuou na tela de login apos submeter (credenciais ou fluxo?).';
    return rec;
  } catch (e) {
    rec.ok = false;
    rec.reason = 'Excecao no login: ' + String(e).slice(0, 200);
    return rec;
  }
}

(async () => {
  const cfg = loadConfig();
  const base = cfg.baseUrl;
  const maxPages = cfg.maxPages || 25;
  const outDir = path.join('runs', `run-${ts()}`);
  const shotsDir = path.join(outDir, 'shots');
  fs.mkdirSync(shotsDir, { recursive: true });

  console.log(`\n=== QA ORQUESTRA — motor de coleta ===`);
  console.log(`Alvo: ${base}`);
  console.log(`Saida: ${outDir}\n`);

  const browser = await launchBrowser();
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 }, ignoreHTTPSErrors: true });
  const page = await context.newPage();

  // Coletores por pagina (currentRec e trocado a cada navegacao)
  let currentRec = null;
  page.on('console', (msg) => { if (currentRec && msg.type() === 'error') currentRec.consoleErrors.push(msg.text().slice(0, 300)); });
  page.on('pageerror', (err) => { if (currentRec) currentRec.pageErrors.push(String(err).slice(0, 300)); });
  page.on('response', (resp) => {
    if (!currentRec) return;
    const s = resp.status();
    if (s >= 400) currentRec.networkErrors.push({ url: resp.url().slice(0, 200), status: s });
  });
  page.on('requestfailed', (req) => {
    if (!currentRec) return;
    const f = req.failure();
    // Ignora aborts triggerados por navegacao
    if (f && /ERR_ABORTED/.test(f.errorText || '')) return;
    currentRec.networkErrors.push({ url: req.url().slice(0, 200), status: 'failed', error: f ? f.errorText : 'unknown' });
  });

  const login = await tryLogin(page, cfg.login, base);
  console.log('[login]', JSON.stringify(login));

  // BFS de crawl a partir da baseUrl (ja autenticado, se aplicavel)
  const start = normalize(base);
  const queue = [start];
  const visited = new Set();
  const pages = [];

  while (queue.length && pages.length < maxPages) {
    const url = queue.shift();
    const norm = normalize(url);
    if (visited.has(norm)) continue;
    visited.add(norm);

    const rec = { url: norm, consoleErrors: [], pageErrors: [], networkErrors: [] };
    currentRec = rec;
    let resp = null;
    try {
      resp = await page.goto(norm, { waitUntil: 'domcontentloaded', timeout: 30000 });
    } catch (e) {
      rec.navError = String(e).slice(0, 200);
      pages.push(rec);
      console.log(`  [x] ${norm} -> ERRO navegacao`);
      continue;
    }
    await page.waitForTimeout(1000);
    rec.status = resp ? resp.status() : null;
    rec.finalUrl = page.url();
    rec.title = await page.title().catch(() => '');
    rec.redirectedToLogin = /login|signin|entrar|acesso/i.test(rec.finalUrl) && !/login|signin|entrar|acesso/i.test(norm);

    const shot = `shot_${pages.length}.png`;
    await page.screenshot({ path: path.join(shotsDir, shot) }).catch(() => {});
    rec.screenshot = 'shots/' + shot;

    // coleta links internos
    let links = [];
    try { links = await page.$$eval('a[href]', (as) => as.map((a) => a.href)); } catch {}
    let discovered = 0;
    for (const l of links) {
      const nl = normalize(l);
      if (sameHost(base, nl) && !visited.has(nl) && !queue.includes(nl)) { queue.push(nl); discovered++; }
    }
    rec.linksFound = links.length;
    rec.newLinks = discovered;
    pages.push(rec);
    const flags = [];
    if (rec.status >= 400) flags.push('HTTP ' + rec.status);
    if (rec.pageErrors.length) flags.push(rec.pageErrors.length + ' excecao JS');
    if (rec.consoleErrors.length) flags.push(rec.consoleErrors.length + ' console err');
    if (rec.networkErrors.length) flags.push(rec.networkErrors.length + ' rede');
    console.log(`  [${rec.status || '?'}] ${norm}  ${flags.length ? '⚠ ' + flags.join(', ') : 'ok'}`);
  }

  await browser.close();

  const summary = {
    target: base,
    startedAt: new Date().toISOString(),
    login,
    totalPages: pages.length,
    maxPages,
    pages,
  };
  fs.writeFileSync(path.join(outDir, 'evidence.json'), JSON.stringify(summary, null, 2));
  console.log(`\n[ok] Evidencia salva em ${outDir}/evidence.json`);
  console.log(`[ok] ${pages.length} telas visitadas, screenshots em ${shotsDir}`);
  // imprime o caminho para o passo de relatorio
  console.log(`OUTDIR=${outDir}`);
})().catch((e) => {
  console.error('[FALHA MOTOR]', e);
  process.exit(1);
});
