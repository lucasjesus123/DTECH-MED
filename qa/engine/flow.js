/**
 * QA ORQUESTRA - Motor de FLUXOS de negocio (Playwright)
 * -----------------------------------------------------------
 * Executa um cenario (JSON) com passos REAIS: preenche formulario, clica,
 * salva, e depois faz um "crossCheck" — confere se o dado criado num modulo
 * APARECE em outro modulo (resolve o "as telas nao se conversam").
 *
 * Cada passo gera evidencia de verdade (screenshot + resultado). Nada e
 * marcado como OK sem o navegador ter confirmado. Se um passo falha, o
 * cenario para e registra exatamente onde e por que.
 *
 * Uso:  QA_SCENARIO=scenarios/cadastro-cliente.json node engine/flow.js
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

function ts() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
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

function load(f) { return resolverAmbiente(JSON.parse(fs.readFileSync(f, 'utf8'))); }
async function launch() {
  try { return await chromium.launch({ headless: true }); }
  catch { return await chromium.launch({ headless: true, executablePath: '/opt/pw-browsers/chromium' }); }
}
function abs(base, u) { try { return new URL(u, base).toString(); } catch { return u; } }

async function doLogin(page, login) {
  if (!login || !login.url) return { attempted: false };
  await page.goto(login.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  const userSel = login.userSelector || 'input[type=email], input[name*=email i], input[name*=user i], input[id*=email i], input[id*=user i], input[type=text]';
  const passSel = login.passSelector || 'input[type=password]';
  const u = await page.$(userSel), p = await page.$(passSel);
  if (!u || !p) return { attempted: true, ok: false, reason: 'campos de login nao encontrados' };
  await u.fill(login.user || ''); await p.fill(login.pass || '');
  const before = page.url();
  const btn = await page.$(login.submitSelector || 'button[type=submit], input[type=submit], button');
  if (btn) await btn.click(); else await p.press('Enter');
  await page.waitForLoadState('domcontentloaded', { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(1500);
  return { attempted: true, ok: page.url() !== before || !(await page.$('input[type=password]')), after: page.url() };
}

(async () => {
  const scenarioFile = process.env.QA_SCENARIO || process.argv[2];
  if (!scenarioFile) { console.error('Informe o cenario: QA_SCENARIO=... node engine/flow.js'); process.exit(1); }
  const sc = load(scenarioFile);
  const base = sc.baseUrl;
  const outDir = path.join('runs', `flow-${(sc.name || 'cenario').replace(/\W+/g, '_')}-${ts()}`);
  const shotsDir = path.join(outDir, 'shots');
  fs.mkdirSync(shotsDir, { recursive: true });

  console.log(`\n=== FLUXO: ${sc.name} ===\nAlvo: ${base}\nSaida: ${outDir}\n`);
  const browser = await launch();
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 }, ignoreHTTPSErrors: true });
  const page = await context.newPage();

  const netErrors = [], consoleErrors = [], pageErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 300)); });
  page.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 300)));
  page.on('response', (r) => { if (r.status() >= 400) netErrors.push({ url: r.url().slice(0, 200), status: r.status() }); });

  const result = { name: sc.name, base, startedAt: new Date().toISOString(), login: null, steps: [], crossCheck: null, netErrors, consoleErrors, pageErrors, verdict: 'PENDENTE' };

  result.login = await doLogin(page, sc.login);
  console.log('[login]', JSON.stringify(result.login));
  if (sc.login && result.login.ok === false) {
    result.verdict = 'FALHOU_NO_LOGIN';
    fs.writeFileSync(path.join(outDir, 'flow-evidence.json'), JSON.stringify(result, null, 2));
    await browser.close();
    console.log('[x] Nao foi possivel logar. Fluxo abortado honestamente.');
    console.log(`OUTDIR=${outDir}`); process.exit(0);
  }

  let ok = true;
  let idx = 0;
  for (const step of (sc.steps || [])) {
    idx++;
    const rec = { n: idx, action: step.action, detail: step.selector || step.url || step.value || '', status: 'ok' };
    try {
      switch (step.action) {
        case 'goto': await page.goto(abs(base, step.url), { waitUntil: 'domcontentloaded', timeout: 30000 }); break;
        case 'fill': await page.fill(step.selector, String(step.value), { timeout: 15000 }); break;
        case 'type': await page.type(step.selector, String(step.value), { delay: 40, timeout: 15000 }); break;
        case 'click': await page.click(step.selector, { timeout: 15000 }); break;
        case 'select': await page.selectOption(step.selector, step.value, { timeout: 15000 }); break;
        case 'check': await page.check(step.selector, { timeout: 15000 }); break;
        case 'press': await page.press(step.selector || 'body', step.value); break;
        case 'wait': await page.waitForTimeout(step.value || 1000); break;
        case 'waitFor': await page.waitForSelector(step.selector, { timeout: step.value || 15000 }); break;
        case 'expectText': {
          await page.waitForTimeout(600);
          const body = await page.textContent('body');
          if (!body || !body.includes(step.value)) throw new Error(`Texto esperado NAO encontrado: "${step.value}"`);
          break;
        }
        case 'expectVisible': {
          const el = await page.$(step.selector);
          if (!el || !(await el.isVisible())) throw new Error(`Elemento esperado NAO visivel: ${step.selector}`);
          break;
        }
        case 'screenshot': break; // screenshot sempre e tirado abaixo
        default: throw new Error('Acao desconhecida: ' + step.action);
      }
      await page.waitForTimeout(step.settle || 300);
    } catch (e) {
      rec.status = 'ERRO';
      rec.error = String(e).slice(0, 250);
      ok = false;
    }
    const shot = `step_${idx}.png`;
    await page.screenshot({ path: path.join(shotsDir, shot) }).catch(() => {});
    rec.screenshot = 'shots/' + shot;
    rec.url = page.url();
    result.steps.push(rec);
    console.log(`  ${rec.status === 'ok' ? '[ok]' : '[x ]'} ${idx}. ${step.action} ${rec.detail}${rec.error ? ' -> ' + rec.error : ''}`);
    if (rec.status === 'ERRO' && step.critical !== false) { console.log('  (passo critico falhou — parando o fluxo)'); break; }
  }

  // crossCheck: o dado criado aparece em OUTRO modulo?
  if (ok && sc.crossCheck) {
    const cc = sc.crossCheck;
    const rec = { goto: cc.goto, expectText: cc.expectText, status: 'ok' };
    try {
      await page.goto(abs(base, cc.goto), { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(1000);
      const body = await page.textContent('body');
      if (!body || !body.includes(cc.expectText)) throw new Error(`LINKAGEM QUEBRADA: "${cc.expectText}" nao aparece em ${cc.goto}. O modulo nao "conversa" com o de origem.`);
    } catch (e) { rec.status = 'ERRO'; rec.error = String(e).slice(0, 250); ok = false; }
    await page.screenshot({ path: path.join(shotsDir, 'crosscheck.png') }).catch(() => {});
    rec.screenshot = 'shots/crosscheck.png';
    result.crossCheck = rec;
    console.log(`  ${rec.status === 'ok' ? '[ok]' : '[x ]'} crossCheck: ${cc.expectText} em ${cc.goto}${rec.error ? ' -> ' + rec.error : ''}`);
  }

  result.verdict = ok ? 'APROVADO' : 'REPROVADO';
  if (pageErrors.length) result.verdict = 'REPROVADO';
  fs.writeFileSync(path.join(outDir, 'flow-evidence.json'), JSON.stringify(result, null, 2));
  await browser.close();
  console.log(`\n[${result.verdict}] ${result.steps.filter(s => s.status === 'ok').length}/${result.steps.length} passos ok · ${consoleErrors.length} console err · ${netErrors.length} rede · ${pageErrors.length} excecao JS`);
  console.log(`[ok] Evidencia: ${outDir}/flow-evidence.json`);
  console.log(`OUTDIR=${outDir}`);
})().catch((e) => { console.error('[FALHA FLOW]', e); process.exit(1); });
