// 漏光补晒准入台 —— 页面业务
// 返回工作台 HTML；列表、队列、统计全部来自同一份 /api/state 快照，刷新前后一致。
export function 页面() {
  return "<!doctype html>\n" +
'<html lang="zh-CN">\n' +
"<head>\n" +
'  <meta charset="utf-8">\n' +
'  <meta name="viewport" content="width=device-width, initial-scale=1">\n' +
"  <title>漏光补晒准入台</title>\n" +
"  <style>\n" +
'    :root { --bg:#eef1ea; --panel:#fff; --ink:#20241f; --muted:#687066; --line:#d4ddd0; --accent:#3f6046; --accent2:#5b7a63; --warn:#9b4937; --hold:#8a6d1f; --tag:#eef3ea; }\n' +
"    * { box-sizing:border-box; } body { margin:0; background:var(--bg); color:var(--ink); font-family:Arial,'PingFang SC',sans-serif; }\n" +
"    header { padding:20px 26px; background:#fff; border-bottom:1px solid var(--line); display:flex; justify-content:space-between; gap:16px; align-items:center; }\n" +
"    h1 { margin:0; font-size:24px; } h2 { margin:0 0 12px; font-size:17px; } h3 { margin:0; font-size:16px; } main { padding:20px 26px; display:grid; gap:18px; grid-template-columns:360px 1fr; }\n" +
"    form,.panel,.card,.stat { background:var(--panel); border:1px solid var(--line); border-radius:8px; padding:15px; }\n" +
"    label { display:block; margin:9px 0 4px; color:var(--muted); font-size:13px; } input,select,textarea { width:100%; border:1px solid var(--line); border-radius:6px; padding:8px; font:inherit; background:#fff; }\n" +
"    button { border:0; border-radius:6px; background:var(--accent); color:#fff; padding:8px 12px; font-weight:700; cursor:pointer; } button.secondary { background:var(--accent2); } button.ghost { background:#fff; color:var(--accent); border:1px solid var(--accent); }\n" +
"    button:disabled { opacity:.45; cursor:not-allowed; }\n" +
"    .stats { display:grid; grid-template-columns:repeat(auto-fit,minmax(110px,1fr)); gap:10px; margin-bottom:14px; } .stat strong { display:block; font-size:23px; } .stat span { color:var(--muted); font-size:12px; }\n" +
"    .toolbar { display:flex; gap:10px; flex-wrap:wrap; margin-bottom:12px; } .toolbar select,.toolbar input { width:auto; min-width:150px; }\n" +
"    .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(300px,1fr)); gap:12px; }\n" +
"    .card { display:grid; gap:7px; align-content:start; } .meta { color:var(--muted); font-size:13px; }\n" +
"    .pill { display:inline-block; border:1px solid var(--line); border-radius:999px; padding:2px 9px; font-size:12px; }\n" +
"    .pill.queue { background:#e7f0e8; color:var(--accent); border-color:#bcd2c0; } .pill.trim { background:#f7ecd9; color:var(--hold); border-color:#e3cca2; } .pill.done { background:#eceeeb; color:var(--muted); }\n" +
"    .warn { color:var(--warn); font-weight:700; } .ok { color:var(--accent); font-weight:700; }\n" +
"    .tag { display:inline-block; background:var(--tag); border:1px solid var(--line); border-radius:5px; padding:1px 6px; font-size:12px; } .tag.off { background:#f6e5e1; color:var(--warn); border-color:#e2b8af; }\n" +
"    .btns { display:flex; gap:7px; flex-wrap:wrap; margin-top:4px; }\n" +
"    .logs { border-top:1px solid var(--line); padding-top:7px; max-height:96px; overflow:auto; display:grid; gap:3px; }\n" +
"    table { width:100%; border-collapse:collapse; font-size:13px; } th,td { text-align:left; border-bottom:1px solid var(--line); padding:7px 6px; } th { color:var(--muted); font-weight:600; }\n" +
"    #notice { display:none; margin:0 26px; margin-top:16px; padding:10px 14px; border-radius:8px; background:#fdf3d8; border:1px solid #e3cca2; color:#6d5516; font-size:13px; }\n" +
"    #notice.show { display:block; }\n" +
"    @media (max-width:960px){ header{display:block;padding:16px;} main{grid-template-columns:1fr;padding:16px;} #notice{margin:0 16px;margin-top:12px;} }\n" +
"  </style>\n" +
"</head>\n" +
"<body>\n" +
'  <header><div><h1>古法蓝晒 · 漏光补晒准入台</h1><div class="meta">同片仅一张未结束检测单 · 漏光超 15% / 遮挡批次停用 / 补晒不足 90 秒只转待修边，不占曝光位</div></div><button id="reload">刷新</button></header>\n' +
'  <div id="notice"></div>\n' +
"  <main>\n" +
"    <div>\n" +
'      <form id="registerForm"><h2>登记漏光检测单</h2>\n' +
'        <label>底片编号</label><input name="code" required placeholder="如 LP-2026-018">\n' +
'        <label>漏光占比（%）</label><input name="leakRatio" type="number" step="0.1" min="0" max="100" required>\n' +
'        <label>遮挡批次</label><select name="maskBatch" id="batchSelect" required></select>\n' +
'        <label>补晒秒数（≥90 秒）</label><input name="resunSeconds" type="number" step="1" min="0" required>\n' +
'        <label>检查人</label><input name="inspector" required>\n' +
'        <div class="btns"><button>登记检测单</button></div>\n' +
"      </form>\n" +
'      <div class="panel" style="margin-top:14px"><h2>遮挡批次</h2><div id="batches"></div>\n' +
'        <form id="batchForm" style="margin-top:10px"><label>新批次名称</label><input name="name" required placeholder="如 ZP-A03"><label>说明</label><input name="note" placeholder="遮光材料 / 用途"><div class="btns"><button class="secondary">新增批次</button></div></form>\n' +
"      </div>\n" +
"    </div>\n" +
"    <div>\n" +
'      <div class="stats" id="stats"></div>\n' +
'      <div class="panel" style="margin-bottom:14px"><h2>补晒曝光队列（占曝光位）</h2><div id="queue"></div></div>\n' +
'      <div class="toolbar"><select id="statusFilter"><option value="">全部状态</option><option>补晒排队</option><option>待修边</option><option>已入盒</option></select><input id="search" placeholder="搜索编号、批次、检查人"></div>\n' +
'      <div class="grid" id="cards"></div>\n' +
"    </div>\n" +
"  </main>\n" +
"  <script>\n" +
    [
      "const $ = s => document.querySelector(s);",
      "let state = { orders: [], batches: [], queue: [], stats: {} };",
      "function esc(v){ return String(v == null ? '' : v).replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',\"'\":'&#39;'}[c])); }",
      "async function api(path, options) {",
      "  const opt = options && options.body ? { ...options, headers: { 'Content-Type': 'application/json' } } : options;",
      "  const res = await fetch(path, opt); const data = await res.json();",
      "  if (!res.ok) throw new Error(data.error || '请求失败'); return data;",
      "}",
      "function notice(text, isError) { const n = $('#notice'); n.textContent = text; n.className = 'show' + (isError ? ' warn' : ''); }",
      "async function load() { state = await api('/api/state'); render(); }",
      "function renderBatches() {",
      "  const sel = $('#batchSelect');",
      "  sel.innerHTML = state.batches.map(b => '<option value=\"' + esc(b.name) + '\"' + (b.active ? '' : ' disabled') + '>' + esc(b.name) + (b.active ? '' : '（已停用）') + '</option>').join('');",
      "  $('#batches').innerHTML = '<table><tr><th>批次</th><th>说明</th><th>状态</th><th></th></tr>' + state.batches.map(b => '<tr><td>' + esc(b.name) + '</td><td class=\"meta\">' + esc(b.note || '') + '</td><td>' + (b.active ? '<span class=\"tag\">启用</span>' : '<span class=\"tag off\">停用</span>') + '</td><td><button class=\"ghost\" data-batch=\"' + esc(b.name) + '\">' + (b.active ? '停用' : '启用') + '</button></td></tr>').join('') + '</table>';",
      "  document.querySelectorAll('[data-batch]').forEach(btn => btn.onclick = async () => { await api('/api/batches/' + encodeURIComponent(btn.dataset.batch), { method: 'PATCH', body: JSON.stringify({ active: state.batches.find(b => b.name === btn.dataset.batch).active === false }) }); await load(); });",
      "}",
      "function renderStats() {",
      "  const items = [['全部','全部检测单'],['未结束','未结束'],['补晒排队','补晒排队（占曝光位）'],['待修边','待修边'],['已入盒','已入盒']];",
      "  $('#stats').innerHTML = items.map(([k, label]) => '<div class=\"stat\"><span>' + label + '</span><strong>' + (state.stats[k] || 0) + '</strong></div>').join('');",
      "}",
      "function renderQueue() {",
      "  if (!state.queue.length) { $('#queue').innerHTML = '<div class=\"meta\">暂无占用曝光位的检测单</div>'; return; }",
      "  $('#queue').innerHTML = '<table><tr><th>位</th><th>底片</th><th>遮挡批次</th><th>补晒秒数</th><th>检查人</th><th>结论版本</th><th></th></tr>' + state.queue.map(q => '<tr><td>' + q.position + '</td><td>' + esc(q.code) + '</td><td>' + esc(q.maskBatch) + '</td><td>' + q.resunSeconds + '</td><td>' + esc(q.inspector) + '</td><td>v' + q.conclusionVersion + '</td><td><button data-finish=\"' + esc(q.id) + '\">完成补晒入盒</button></td></tr>').join('') + '</table>';",
      "  document.querySelectorAll('[data-finish]').forEach(btn => btn.onclick = async () => { try { await api('/api/orders/' + encodeURIComponent(btn.dataset.finish) + '/finish-resun', { method: 'POST' }); await load(); } catch (e) { notice(e.message, true); } });",
      "}",
      "function pillClass(s){ return s === '补晒排队' ? 'queue' : s === '待修边' ? 'trim' : 'done'; }",
      "function cardHtml(o) {",
      "  const batch = state.batches.find(b => b.name === o.maskBatch);",
      "  const batchTag = o.maskBatch + (batch && !batch.active ? ' <span class=\"tag off\">停用</span>' : '');",
      "  const concl = o.conclusion.route === '补晒准入' ? '<span class=\"ok\">准入补晒，占曝光位</span>' : '<span class=\"warn\">只转待修边，不占曝光位</span><div class=\"meta warn\">' + (o.conclusion.reasons || []).map(esc).join('；') + '</div>';",
      "  const reviews = (o.reviews || []).map((r, i) => '<div>第' + (i + 1) + '次：' + esc(r.reviewer) + ' 复核漏光 ' + r.leakRatio + '% · ' + (r.pass ? '≤5% 合格' : '超 5% 不合格') + '</div>').join('') || '<div class=\"meta\">暂无修边复核</div>';",
      "  const archives = (o.archives || []).length ? '<div class=\"meta\">旧版结论留档 ' + o.archives.length + ' 份（当前结论 v' + o.conclusion.version + '）</div>' : '';",
      "  const btns = o.status === '已入盒' ? '<div class=\"meta\">检测单已结束</div>' : '<div class=\"btns\"><button class=\"ghost\" data-correct=\"' + esc(o.id) + '\">更正重算</button>' + (o.status === '待修边' ? '<button class=\"secondary\" data-review=\"' + esc(o.id) + '\">修边复核</button><button data-box=\"' + esc(o.id) + '\">入盒</button>' : '<button data-finish=\"' + esc(o.id) + '\">完成补晒入盒</button>') + '</div>';",
      "  const logs = (o.history || []).slice(-4).map(l => '<div>' + esc(l.step) + '：' + esc(l.note) + '</div>').join('');",
      "  return '<article class=\"card\"><div style=\"display:flex;justify-content:space-between;gap:8px;align-items:center\"><h3>' + esc(o.code) + '</h3><span class=\"pill ' + pillClass(o.status) + '\">' + o.status + '</span></div>' +",
      "    '<div class=\"meta\">' + esc(o.id) + '</div>' +",
      "    '<div>漏光占比：<b>' + o.leakRatio + '%</b>（红线 15%）</div>' +",
      "    '<div>遮挡批次：' + batchTag + '</div>' +",
      "    '<div>补晒秒数：<b>' + o.resunSeconds + '</b>（至少 90 秒）</div>' +",
      "    '<div>检查人：' + esc(o.inspector) + '</div>' +",
      "    '<div>判定（v' + o.conclusion.version + '）：' + concl + '</div>' +",
      "    reviews + archives + btns +",
      "    '<div class=\"logs meta\">' + (logs || '暂无记录') + '</div></article>';",
      "}",
      "function renderCards() {",
      "  const status = $('#statusFilter').value, q = $('#search').value.trim();",
      "  const visible = state.orders.filter(o => (!status || o.status === status) && (!q || JSON.stringify(o).includes(q)));",
      "  $('#cards').innerHTML = visible.length ? visible.map(cardHtml).join('') : '<div class=\"meta\">没有匹配的检测单</div>';",
      "  bindCardActions();",
      "}",
      "function render(){ renderBatches(); renderStats(); renderQueue(); renderCards(); }",
      "async function act(path, options) { try { await api(path, options); await load(); } catch (e) { notice(e.message, true); } }",
      "function bindCardActions() {",
      "  document.querySelectorAll('[data-correct]').forEach(btn => btn.onclick = () => correct(btn.dataset.correct));",
      "  document.querySelectorAll('[data-review]').forEach(btn => btn.onclick = () => review(btn.dataset.review));",
      "  document.querySelectorAll('[data-box]').forEach(btn => btn.onclick = () => act('/api/orders/' + encodeURIComponent(btn.dataset.box) + '/box', { method: 'POST' }));",
      "  document.querySelectorAll('#cards [data-finish]').forEach(btn => btn.onclick = () => act('/api/orders/' + encodeURIComponent(btn.dataset.finish) + '/finish-resun', { method: 'POST' }));",
      "}",
      "function findOrder(id){ return state.orders.find(o => o.id === id); }",
      "async function correct(id) {",
      "  const o = findOrder(id);",
      "  const ratio = prompt('更正漏光占比（%），留空表示不改', o.leakRatio); if (ratio === null) return;",
      "  const batch = prompt('更正遮挡批次，留空表示不改', o.maskBatch); if (batch === null) return;",
      "  const seconds = prompt('更正补晒秒数，留空表示不改', o.resunSeconds); if (seconds === null) return;",
      "  const patch = {};",
      "  if (ratio.trim() !== '' && Number(ratio) !== o.leakRatio) patch.leakRatio = Number(ratio);",
      "  if (batch.trim() !== '' && batch.trim() !== o.maskBatch) patch.maskBatch = batch.trim();",
      "  if (seconds.trim() !== '' && Number(seconds) !== o.resunSeconds) patch.resunSeconds = Number(seconds);",
      "  if (!Object.keys(patch).length) { notice('未填写任何更正内容', true); return; }",
      "  await act('/api/orders/' + encodeURIComponent(id), { method: 'PATCH', body: JSON.stringify(patch) });",
      "}",
      "async function review(id) {",
      "  const o = findOrder(id);",
      "  const reviewer = prompt('修边复核人（须换人，不能是检查人「' + o.inspector + '」或前一次复核人）'); if (reviewer === null || reviewer.trim() === '') return;",
      "  const ratio = prompt('本次复核漏光占比（%），须不高于 5%', '0'); if (ratio === null) return;",
      "  await act('/api/orders/' + encodeURIComponent(id) + '/reviews', { method: 'POST', body: JSON.stringify({ reviewer: reviewer.trim(), leakRatio: Number(ratio) }) });",
      "}",
      "$('#registerForm').onsubmit = async e => {",
      "  e.preventDefault();",
      "  try {",
      "    const r = await api('/api/orders', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData($('#registerForm')).entries())) });",
      "    notice(r.reused ? '该片已有未结束检测单 ' + r.order.id + '，已沿用首次登记，未新建。' : ('已登记 ' + r.order.id + '：' + (r.order.status === '补晒排队' ? '准入补晒，占用曝光位' : '只转待修边，不占曝光位')), r.reused);",
      "    $('#registerForm').reset(); await load();",
      "  } catch (err) { notice(err.message, true); }",
      "};",
      "$('#batchForm').onsubmit = async e => { e.preventDefault(); await act('/api/batches', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData($('#batchForm')).entries())) }); $('#batchForm').reset(); };",
      "$('#statusFilter').onchange = renderCards; $('#search').oninput = renderCards; $('#reload').onclick = load;",
      "load();",
    ].join("\n") +
"  </script>\n" +
"</body>\n" +
"</html>";
}
