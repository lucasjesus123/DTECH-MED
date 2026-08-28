/**
 * QA ORQUESTRA - Gerador de relatorio (3 niveis)
 * -------------------------------------------------
 * Le evidence.json e produz report.html com classificacao honesta:
 *   VERDE  = Excelente / Aprovado / Testado
 *   AMARELO= Erro & Bug / Nao aprovado / Corrigir
 *   VERMELHO= Perigoso / Nao aprovado / Corrigir
 *
 * A classificacao AUTOMATICA abaixo e baseada em EVIDENCIA coletada.
 * O Claude complementa com analise fina (multi-tenant, contrato, WhatsApp, codigo).
 *
 * Uso: node engine/report.js runs/run-XX.  (sem arg = pega o run mais recente)
 */
const fs = require('fs');
const path = require('path');

function latestRun() {
  const runs = fs.readdirSync('runs').filter((d) => d.startsWith('run-')).sort();
  if (!runs.length) { console.error('Nenhum run encontrado em runs/'); process.exit(1); }
  return path.join('runs', runs[runs.length - 1]);
}

function classify(p) {
  const danger = [];
  const bugs = [];
  // PERIGOSO
  if (p.navError) danger.push('Falha total de navegacao: ' + p.navError);
  if (typeof p.status === 'number' && p.status >= 500) danger.push('Servidor retornou HTTP ' + p.status + ' (erro de servidor).');
  if (p.pageErrors && p.pageErrors.length) danger.push(p.pageErrors.length + ' excecao(oes) JavaScript nao tratada(s).');
  (p.networkErrors || []).forEach((n) => { if (n.status >= 500) danger.push('Requisicao ' + n.status + ': ' + n.url); });
  if (p.redirectedToLogin) danger.push('Sessao perdida: redirecionado para login no meio do fluxo.');
  // BUG / ERRO
  if (typeof p.status === 'number' && p.status >= 400 && p.status < 500) bugs.push('Pagina retornou HTTP ' + p.status + '.');
  (p.networkErrors || []).forEach((n) => {
    if (n.status === 'failed') bugs.push('Requisicao falhou: ' + n.url + ' (' + (n.error || '') + ')');
    else if (n.status >= 400 && n.status < 500) bugs.push('Requisicao ' + n.status + ': ' + n.url);
  });
  (p.consoleErrors || []).forEach((c) => bugs.push('Erro de console: ' + c));
  // UX / FRONT (o pulo do gato)
  (p.uxIssues || []).forEach((u) => {
    if (u.tipo === 'tela-vazia' || u.tipo === 'loading-preso') danger.push('UX: ' + u.msg);
    else bugs.push('UX (o usuario VE): ' + u.msg + (u.trecho ? ' -> "' + u.trecho + '"' : ''));
  });
  // ACESSIBILIDADE (axe-core / WCAG)
  if (p.a11y && p.a11y.counts) {
    const cc = p.a11y.counts;
    if (cc.critical) danger.push(cc.critical + ' violacao(oes) CRITICA(s) de acessibilidade (WCAG).');
    if (cc.serious) bugs.push(cc.serious + ' violacao(oes) seria(s) de acessibilidade (WCAG).');
    if ((cc.moderate || 0) + (cc.minor || 0)) bugs.push(((cc.moderate || 0) + (cc.minor || 0)) + ' violacao(oes) moderada(s)/leve(s) de acessibilidade (WCAG).');
  }
  // PERFORMANCE
  if (p.perf && p.perf.loadMs > 3000) bugs.push('Tela LENTA: ' + p.perf.loadMs + 'ms para carregar.');
  let level = 'good';
  if (danger.length) level = 'danger';
  else if (bugs.length) level = 'bug';
  return { level, danger, bugs };
}

const dir = process.argv[2] || latestRun();
const ev = JSON.parse(fs.readFileSync(path.join(dir, 'evidence.json'), 'utf8'));
const rows = ev.pages.map((p) => ({ p, c: classify(p) }));
const nGood = rows.filter((r) => r.c.level === 'good').length;
const nBug = rows.filter((r) => r.c.level === 'bug').length;
const nDanger = rows.filter((r) => r.c.level === 'danger').length;
const total = rows.length || 1;
const pct = Math.round((nGood / total) * 100);

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function imgData(rel) { try { return 'data:image/png;base64,' + fs.readFileSync(path.join(dir, rel)).toString('base64'); } catch (e) { return ''; } }

function card(r) {
  const { p, c } = r;
  const color = c.level === 'danger' ? '#ef4444' : c.level === 'bug' ? '#f59e0b' : '#22c55e';
  const tag = c.level === 'danger' ? 'PERIGOSO — CORRIGIR' : c.level === 'bug' ? 'ERRO/BUG — CORRIGIR' : 'EXCELENTE — APROVADO';
  const items = [...c.danger.map((x) => ['danger', x]), ...c.bugs.map((x) => ['bug', x])];
  const findings = items.length
    ? '<ul>' + items.map(([lv, x]) => `<li><b style="color:${lv === 'danger' ? '#ef4444' : '#f59e0b'}">${lv === 'danger' ? '🔴' : '🟡'}</b> ${esc(x)}</li>`).join('') + '</ul>'
    : '<p class="ok">Sem erros detectados nesta tela (carregou 200, sem erro de console, sem requisicao falha).</p>';
  return `<div class="card" style="border-left:6px solid ${color}">
    <div class="head"><span class="tag" style="background:${color}">${tag}</span>
      <span class="status">HTTP ${esc(p.status)}</span></div>
    <div class="title">${esc(p.title || '(sem titulo)')}</div>
    <div class="url">${esc(p.url)}</div>
    ${findings}
    ${p.screenshot ? `<details class="shot"><summary>📸 ver evidencia (screenshot real desta tela)</summary><img loading="lazy" src="${imgData(p.screenshot)}" style="max-width:100%;border-radius:8px;margin-top:8px;border:1px solid #22304f"></details>` : ''}
  </div>`;
}

const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>QA Orquestra — Relatorio</title>
<style>
:root{--bg:#0b1020;--card:#141a2e;--txt:#e8ecf5;--mut:#93a0bd}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--txt);font-family:system-ui,Segoe UI,Roboto,sans-serif;line-height:1.5}
.wrap{max-width:980px;margin:0 auto;padding:28px}
h1{font-size:26px;margin:0 0 4px}.sub{color:var(--mut);margin:0 0 20px}
.kpis{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:22px}
.kpi{flex:1;min-width:150px;background:var(--card);border-radius:14px;padding:16px 18px}
.kpi .n{font-size:30px;font-weight:800}.kpi .l{color:var(--mut);font-size:13px}
.bar{height:14px;border-radius:8px;background:#1f2740;overflow:hidden;display:flex;margin:6px 0 22px}
.bar>i{display:block;height:100%}
.card{background:var(--card);border-radius:14px;padding:16px 18px;margin:12px 0}
.head{display:flex;justify-content:space-between;align-items:center;gap:8px}
.tag{color:#0b1020;font-weight:800;font-size:12px;padding:4px 10px;border-radius:999px}
.status{color:var(--mut);font-size:13px}
.title{font-weight:700;margin:8px 0 2px}.url{color:var(--mut);font-size:13px;word-break:break-all;margin-bottom:6px}
ul{margin:8px 0 8px 2px;padding-left:18px}li{margin:3px 0;font-size:14px}
.ok{color:#22c55e;font-size:14px;margin:6px 0}
.shot{margin-top:8px}.shot summary{cursor:pointer;color:#7cc0ff;font-size:13px}
.note{background:#101830;border:1px solid #22304f;border-radius:12px;padding:14px 16px;color:var(--mut);font-size:13px;margin:18px 0}
.legend{display:flex;gap:16px;flex-wrap:wrap;font-size:13px;color:var(--mut);margin-bottom:8px}
.dot{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:5px;vertical-align:middle}
</style></head><body><div class="wrap">
<h1>QA Orquestra — Relatorio de Teste</h1>
<p class="sub">Alvo: <b>${esc(ev.target)}</b> · ${rows.length} telas visitadas · gerado por execucao REAL (Playwright)</p>

<div class="kpis">
  <div class="kpi"><div class="n" style="color:#22c55e">${nGood}</div><div class="l">🟢 Excelente / Aprovado</div></div>
  <div class="kpi"><div class="n" style="color:#f59e0b">${nBug}</div><div class="l">🟡 Erro & Bug / Corrigir</div></div>
  <div class="kpi"><div class="n" style="color:#ef4444">${nDanger}</div><div class="l">🔴 Perigoso / Corrigir</div></div>
  <div class="kpi"><div class="n">${pct}%</div><div class="l">Telas 100% limpas</div></div>
</div>
<div class="bar">
  <i style="width:${(nGood / total) * 100}%;background:#22c55e"></i>
  <i style="width:${(nBug / total) * 100}%;background:#f59e0b"></i>
  <i style="width:${(nDanger / total) * 100}%;background:#ef4444"></i>
</div>

<div class="note"><b>Honestidade primeiro:</b> cada item acima veio de algo que o navegador REALMENTE observou nesta execucao
(status HTTP, erro de console, excecao JS, requisicao falha, screenshot). O % mede telas sem NENHUM erro detectado —
nao e uma nota de "pronto" inventada. Itens que dependem de analise humana/Claude (isolamento entre clientes,
geracao de contrato, disparo WhatsApp, bug na linha do codigo) entram numa fase complementar e sao marcados a parte.</div>

<div class="legend">
  <span><span class="dot" style="background:#22c55e"></span>carregou 200, sem erros</span>
  <span><span class="dot" style="background:#f59e0b"></span>4xx / console / requisicao falha</span>
  <span><span class="dot" style="background:#ef4444"></span>5xx / excecao JS / sessao perdida</span>
</div>

${rows.sort((a, b) => ({ danger: 0, bug: 1, good: 2 }[a.c.level] - { danger: 0, bug: 1, good: 2 }[b.c.level])).map(card).join('')}

<div class="note">Login: ${esc(JSON.stringify(ev.login))}</div>
</div></body></html>`;

fs.writeFileSync(path.join(dir, 'report.html'), html);
console.log('[ok] Relatorio gerado:', path.join(dir, 'report.html'));
console.log(`[resumo] verde=${nGood} amarelo=${nBug} vermelho=${nDanger} limpas=${pct}%`);
