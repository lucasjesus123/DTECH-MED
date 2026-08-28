/**
 * QA ORQUESTRA - Detecção de REGRESSÃO
 * -------------------------------------------
 * Compara a execução ATUAL com uma execução ANTERIOR (baseline) e aponta o que
 * REGREDIU: tela que estava limpa e agora quebrou. Também mostra o que foi
 * corrigido, o que é novo e o que sumiu. Sai com código 1 se houver regressão.
 *
 * Uso:  node engine/compare.js runs/<baseline> runs/<atual>
 */
const fs = require('fs');
const path = require('path');
const loadEv = (p) => { const f = fs.statSync(p).isDirectory() ? path.join(p, 'evidence.json') : p; return JSON.parse(fs.readFileSync(f, 'utf8')); };
const hasErr = (pg) => !!(pg.navError || pg.status >= 400 || (pg.pageErrors && pg.pageErrors.length) || (pg.consoleErrors && pg.consoleErrors.length) || (pg.networkErrors && pg.networkErrors.length));

const base = loadEv(process.argv[2]);
const cur = loadEv(process.argv[3]);
const bMap = new Map(base.pages.map((p) => [p.url, p]));
const cMap = new Map(cur.pages.map((p) => [p.url, p]));
const regrediram = [], corrigidas = [], novas = [], sumiram = [];
for (const [u, cp] of cMap) {
  const bp = bMap.get(u);
  if (!bp) { novas.push(u); continue; }
  if (!hasErr(bp) && hasErr(cp)) regrediram.push(u);
  if (hasErr(bp) && !hasErr(cp)) corrigidas.push(u);
}
for (const [u] of bMap) if (!cMap.has(u)) sumiram.push(u);

console.log(JSON.stringify({ baseline: process.argv[2], atual: process.argv[3], regrediram, corrigidas, novas, sumiram }, null, 2));
if (regrediram.length) { console.error(`\n[REGRESSAO] ${regrediram.length} tela(s) que passavam agora quebraram!`); process.exit(1); }
console.log('\n[ok] Nenhuma regressao: nada que passava quebrou.');
