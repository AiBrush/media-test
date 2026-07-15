#!/usr/bin/env bun
// goal26-analyze.mjs — mirror the harness winner logic (report.ts computeCaseWinner) for a results
// JSON (full or .partial), restricted to a scenario id list. Prints per-scenario: winner engine,
// winner value, aibrush value, aibrush status, and whether aibrush wins/co-wins. Read-only.
import { readFileSync } from 'node:fs';

const PRIORITY = ['opsPerSec','packetsPerSec','framesPerSec','decodeFps','encodeFps','throughputRealtime','seekMs','timeToFirstFrame','timeToFirstByte','bundleSize','loadInit','wall','peakMemory','bytesOut','sourceReads','targetWrites','longtasks'];
const HIGHER = new Set(['throughputRealtime','decodeFps','encodeFps','opsPerSec','packetsPerSec','framesPerSec']);
const BAND = 3;

const file = process.argv[2];
const only = process.argv[3] ? new Set(readFileSync(process.argv[3],'utf8').split('\n').map(s=>s.trim()).filter(Boolean)) : undefined;
const d = JSON.parse(readFileSync(file,'utf8'));
const results = d.results ?? [];

// group by scenarioId
const byScenario = new Map();
for (const r of results) {
  if (only && !only.has(r.scenarioId)) continue;
  if (!byScenario.has(r.scenarioId)) byScenario.set(r.scenarioId, []);
  byScenario.get(r.scenarioId).push(r);
}

function benchVal(r, m) {
  const b = r.bench?.[m];
  if (!b) return undefined;
  const v = b.aggregate ?? b.median;
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}
function pickMetric(passes) {
  const declared = passes.map(r=>r.primaryMetric).filter(Boolean);
  for (const m of declared) if (passes.every(r=>r.bench?.[m])) return m;
  for (const m of PRIORITY) if (passes.every(r=>r.bench?.[m])) return m;
  for (const m of PRIORITY) if (passes.some(r=>r.bench?.[m])) return m;
  return null;
}
const short = id => id.replace(/@.*/,'');
const rows = [];
for (const [sid, rs] of byScenario) {
  const passes = rs.filter(r=>r.status==='PASS');
  const ai = rs.find(r=>short(r.engineId)==='aibrush-media');
  const aiStatus = ai?.status ?? 'ABSENT';
  if (passes.length===0) { rows.push({sid, metric:'-', winner:'(none pass)', wv:NaN, ai:short(ai?.engineId??''), av:NaN, aiStatus, aiWins:false}); continue; }
  const metric = pickMetric(passes);
  const higher = HIGHER.has(metric);
  const ranked = passes.map(r=>({id:short(r.engineId), v:benchVal(r,metric), passed:r.coverage?.passed??0}))
    .filter(x=>typeof x.v==='number')
    .sort((a,b)=> b.passed-a.passed || (higher? b.v-a.v : a.v-b.v));
  const top = ranked[0];
  const aiRow = ranked.find(x=>x.id==='aibrush-media');
  // co-winner check at top coverage tier within noise band
  const rel = (a,b)=> b===0?(a===b?0:100):(higher?((a-b)/b*100):((b-a)/b*100));
  const aiWins = aiRow && aiRow.passed===top.passed && Math.abs(rel(aiRow.v, top.v))<=BAND || (top && top.id==='aibrush-media');
  rows.push({sid, metric, winner:top?.id??'?', wv:top?.v??NaN, av:aiRow?.v??NaN, aiStatus, aiWins: !!aiWins,
    others: ranked.map(x=>`${x.id}:${x.v.toFixed(2)}`).join('  ')});
}
// preserve goal order if provided
const order = only ? [...only] : [...byScenario.keys()];
rows.sort((a,b)=> order.indexOf(a.sid)-order.indexOf(b.sid));
let losing=0;
const fmt=(v)=> Number.isFinite(v)? v.toFixed(2):'—';
console.log('WIN?  scenario                                             metric            winner            win_val   aibrush   ai_status');
for (const r of rows) {
  if (!r.aiWins) losing++;
  console.log(`${r.aiWins?' ✓ ':' ✗ '}  ${r.sid.padEnd(52)} ${String(r.metric).padEnd(16)} ${String(r.winner).padEnd(16)} ${fmt(r.wv).padStart(9)} ${fmt(r.av).padStart(9)}   ${r.aiStatus}`);
}
console.log(`\naibrush loses/ties-not-won ${losing}/${rows.length}`);
for (const r of rows) if(!r.aiWins) console.log(`  LOSS ${r.sid}\n        ${r.others}`);
