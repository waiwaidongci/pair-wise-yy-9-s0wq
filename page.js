// 页面业务：漏光补晒准入台界面（HTML 外壳 + 前端交互）
// 数据全部来自 /api/state，列表、曝光队列、统计刷新后同源一致

export function page() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>蓝晒漏光补晒准入台</title>
  <style>
    :root { --bg:#eef2f0; --panel:#fff; --ink:#20241f; --muted:#687066; --line:#d4ddd0; --accent:#3f6b5c; --warn:#9b4937; --slot:#b58a2d; }
    * { box-sizing:border-box; } body { margin:0; background:var(--bg); color:var(--ink); font-family:Arial,"PingFang SC",sans-serif; }
    header { padding:22px 28px; background:#fff; border-bottom:1px solid var(--line); display:flex; justify-content:space-between; gap:16px; align-items:center; }
    h1 { margin:0; font-size:24px; } h2 { margin:0 0 12px; font-size:17px; } h3 { margin:0; font-size:16px; } main { display:grid; grid-template-columns:390px 1fr; gap:22px; padding:22px 28px; }
    form,.panel,.card,.stat { background:var(--panel); border:1px solid var(--line); border-radius:8px; padding:16px; }
    label { display:block; margin:10px 0 5px; color:var(--muted); font-size:13px; } input,select,textarea { width:100%; border:1px solid var(--line); border-radius:6px; padding:9px; font:inherit; background:#fff; }
    button { border:0; border-radius:6px; background:var(--accent); color:#fff; padding:9px 12px; font-weight:700; cursor:pointer; }
    button.secondary { background:#69736a; } button.warn { background:var(--warn); } button.mini { padding:4px 9px; font-size:12px; font-weight:400; }
    .row { display:flex; gap:8px; flex-wrap:wrap; margin-top:12px; } .row > * { flex:1; }
    .stats { display:grid; grid-template-columns:repeat(auto-fit,minmax(120px,1fr)); gap:10px; margin-bottom:14px; } .stat strong { display:block; font-size:24px; }
    .toolbar { display:flex; gap:10px; flex-wrap:wrap; margin-bottom:14px; } .toolbar input { width:auto; min-width:180px; }
    .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(290px,1fr)); gap:12px; } .card { display:grid; gap:7px; }
    .meta { color:var(--muted); font-size:13px; } .pill { display:inline-block; border:1px solid var(--line); border-radius:999px; padding:3px 9px; font-size:12px; }
    .pill.admitted { background:#e7f0ec; border-color:#9dbfaE; color:#2d5a49; } .pill.trim { background:#f6ece4; border-color:#d9b49c; color:#8a4a2a; } .pill.boxed { background:#e9edf0; color:#4a5860; }
    .tag-off { color:var(--warn); font-weight:700; } .tag-slot { color:var(--slot); font-weight:700; }
    .logs { border-top:1px solid var(--line); padding-top:8px; max-height:96px; overflow:auto; font-size:12px; }
    .queue li { margin:4px 0; } .batches { display:grid; gap:6px; } .batchrow { display:flex; justify-content:space-between; align-items:center; gap:8px; font-size:13px; }
    .reviews span { display:inline-block; margin-right:8px; font-size:12px; border:1px solid var(--line); border-radius:6px; padding:2px 7px; }
    #msg { margin:8px 0 0; font-size:13px; min-height:18px; } #msg.err { color:var(--warn); font-weight:700; } #msg.ok { color:var(--accent); font-weight:700; }
    @media (max-width:900px){ header{display:block;padding:18px 16px;} main{grid-template-columns:1fr;padding:16px;} }
  </style>
</head>
<body>
  <header>
    <div><h1>蓝晒漏光补晒准入台</h1><div class="meta">同片一张未结束检测单 · 占比超15%、批次停用、补晒不足90秒只转待修边不占曝光位 · 修边换人复核两次、漏光均≤5%入盒 · 更正即重算，旧版留档</div></div>
    <button id="reload">刷新</button>
  </header>
  <main>
    <section>
      <form id="registerForm">
        <h2>登记漏光检测单</h2>
        <label>底片编号</label><input name="plateCode" required placeholder="如 CN-001">
        <label>漏光占比（%，0–100）</label><input name="leakRatio" type="number" min="0" max="100" step="0.1" required>
        <label>遮挡批次</label><select name="maskBatch" id="regBatch"></select>
        <label>补晒秒数（不足90秒不予占曝光位）</label><input name="extraSeconds" type="number" min="0" step="1" required>
        <label>检查人</label><input name="inspector" required>
        <div class="row"><button>登记并判定</button></div>
      </form>

      <form id="processForm" style="margin-top:14px">
        <h2>修边 / 复核 / 更正</h2>
        <label>选择检测单（仅未结束）</label><select name="id" id="ticketSelect"></select>
        <label>修边人（登记后开始新一轮复核）</label><input name="repairman" placeholder="修边人姓名">
        <label>复核人（须与修边人、上一轮复核人不同）</label><input name="reviewer">
        <label>本轮复核漏光（%，≤5才算通过）</label><input name="reviewLeak" type="number" min="0" max="100" step="0.1">
        <label>更正漏光占比（%，留空不改；一改结论即失效重算）</label><input name="newLeak" type="number" min="0" max="100" step="0.1">
        <label>更正遮挡批次（留空不改）</label><select name="newBatch" id="fixBatch"></select>
        <div class="row">
          <button type="button" data-act="repair" class="secondary">登记修边</button>
          <button type="button" data-act="review">提交复核</button>
          <button type="button" data-act="correct" class="warn">更正重算</button>
          <button type="button" data-act="complete" class="secondary">补晒完成</button>
        </div>
      </form>

      <div class="panel" style="margin-top:14px">
        <h2>遮挡批次</h2>
        <div class="batches" id="batches"></div>
        <form id="batchForm" style="margin-top:10px">
          <label>新批次号</label><input name="code" required>
          <label>备注</label><input name="note">
          <div class="row"><button type="submit" class="secondary mini">新增批次（默认启用）</button></div>
        </form>
      </div>
      <p id="msg"></p>
    </section>
    <section>
      <div class="stats" id="stats"></div>
      <div class="panel" style="margin-bottom:14px">
        <h2>曝光位队列（补晒准入中，占曝光位）</h2>
        <ul class="queue" id="queue" style="margin:0;padding-left:18px"></ul>
      </div>
      <div class="toolbar"><input id="search" placeholder="搜索底片编号、批次、检查人"></div>
      <div class="panel"><h2>检测单列表</h2><div class="grid" id="cards"></div></div>
    </section>
  </main>
  <script>
    var state = { tickets: [], batches: [], queue: [], stats: {}, capacity: 6 };
    async function api(path, options) {
      var res = await fetch(path, options && options.body ? { method: options.method || 'POST', body: options.body, headers: { 'Content-Type': 'application/json' } } : options);
      var data = await res.json();
      if (!res.ok) throw new Error((data.code ? data.code + '：' : '') + (data.error || data.message || '请求失败'));
      return data;
    }
    function esc(v) {
      return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
    }
    function formObj(form) { return Object.fromEntries(new FormData(form).entries()); }
    function setMsg(text, ok) {
      var m = document.querySelector('#msg');
      m.textContent = text || '';
      m.className = ok ? 'ok' : (text ? 'err' : '');
    }
    function batchOptions(selected) {
      var html = '<option value="">— 不修改 —</option>';
      html += state.batches.map(function (b) {
        return '<option value="' + esc(b.code) + '"' + (b.code === selected ? ' selected' : '') + '>' + esc(b.code) + (b.active ? '' : '（停用）') + '</option>';
      }).join('');
      return html;
    }
    function renderStats() {
      var order = ['待修边', '补晒准入', '已入盒', '占用曝光位', '剩余曝光位', '检测单总数'];
      document.querySelector('#stats').innerHTML = order.map(function (k) {
        var v = state.stats[k] || 0;
        var extra = k === '占用曝光位' ? ' / ' + state.capacity : '';
        return '<div class="stat"><span>' + k + '</span><strong>' + v + extra + '</strong></div>';
      }).join('');
    }
    function renderBatches() {
      document.querySelector('#batches').innerHTML = state.batches.map(function (b) {
        return '<div class="batchrow"><span>' + esc(b.code) + (b.active ? '' : ' <span class="tag-off">停用</span>') + (b.note ? ' <span class="meta">' + esc(b.note) + '</span>' : '') + '</span>'
          + '<button class="mini ' + (b.active ? 'warn' : '') + '" data-batch="' + esc(b.code) + '" data-active="' + (b.active ? '0' : '1') + '">' + (b.active ? '停用' : '启用') + '</button></div>';
      }).join('');
      document.querySelectorAll('[data-batch]').forEach(function (btn) {
        btn.onclick = async function () {
          await api('/api/batches/' + encodeURIComponent(btn.dataset.batch), { method: 'PATCH', body: JSON.stringify({ active: btn.dataset.active === '1' }) });
          await load();
        };
      });
    }
    function renderQueue() {
      var q = state.queue;
      document.querySelector('#queue').innerHTML = q.length ? q.map(function (t) {
        return '<li><span class="tag-slot">' + t.slotNo + ' 号位</span> · ' + esc(t.plateCode) + ' · 漏光 ' + esc(t.leakRatio) + '% · ' + esc(t.maskBatch) + ' · 补晒 ' + esc(t.extraSeconds) + ' 秒 · 检查人 ' + esc(t.inspector) + '</li>';
      }).join('') : '<li class="meta">暂无占曝光位的检测单</li>';
    }
    function statusPill(s) {
      var cls = s === '补晒准入' ? 'admitted' : (s === '待修边' ? 'trim' : 'boxed');
      return '<span class="pill ' + cls + '">' + esc(s) + '</span>';
    }
    function cardHtml(t) {
      var reviews = (t.reviews || []).map(function (r, i) {
        return '<span>第' + (i + 1) + '轮 ' + esc(r.reviewer) + '：' + esc(r.leakRatio) + '%</span>';
      }).join('');
      var logs = (t.history || []).slice(-4).map(function (l) {
        return '<div>· ' + esc(l.action) + '：' + esc(l.note) + '</div>';
      }).join('');
      return '<article class="card">'
        + '<h3>' + esc(t.id) + ' · ' + esc(t.plateCode) + '</h3>'
        + statusPill(t.status)
        + (t.slotNo ? '<div><span class="tag-slot">占 ' + t.slotNo + ' 号曝光位</span></div>' : '')
        + '<div class="meta">漏光占比 <b>' + esc(t.leakRatio) + '%</b>' + (t.leakRatio > 15 ? ' <span class="tag-off">超15%</span>' : '') + '</div>'
        + '<div class="meta">遮挡批次 ' + esc(t.maskBatch) + (t.batchActive ? '' : ' <span class="tag-off">停用</span>') + '</div>'
        + '<div class="meta">补晒 ' + esc(t.extraSeconds) + ' 秒' + (t.extraSeconds < 90 ? ' <span class="tag-off">不足90秒</span>' : '') + ' · 检查人 ' + esc(t.inspector) + '</div>'
        + (t.repairman ? '<div class="meta">修边人 ' + esc(t.repairman) + '</div>' : '')
        + (reviews ? '<div class="reviews">' + reviews + '</div>' : '<div class="meta">尚无复核记录</div>')
        + '<div class="meta">留档版本 v' + t.versionCount + (t.versionCount > 1 ? '（已更正重算）' : '') + '</div>'
        + '<div class="logs meta">' + (logs || '暂无记录') + '</div>'
        + '</article>';
    }
    function renderCards() {
      var q = document.querySelector('#search').value.trim();
      var visible = state.tickets.filter(function (t) {
        return !q || JSON.stringify(t).includes(q);
      });
      document.querySelector('#cards').innerHTML = visible.length ? visible.map(cardHtml).join('') : '<div class="meta">没有匹配的检测单</div>';
    }
    function renderSelect() {
      var current = document.querySelector('#ticketSelect').value;
      var open = state.tickets.filter(function (t) { return t.status !== '已入盒'; });
      var html = open.length ? open.map(function (t) {
        return '<option value="' + esc(t.id) + '">' + esc(t.id) + ' · ' + esc(t.plateCode) + ' · ' + esc(t.status) + '</option>';
      }).join('') : '<option value="">（无未结束检测单）</option>';
      document.querySelector('#ticketSelect').innerHTML = html;
      if (current && open.some(function (t) { return t.id === current; })) document.querySelector('#ticketSelect').value = current;
      document.querySelector('#regBatch').innerHTML = state.batches.map(function (b) {
        return '<option value="' + esc(b.code) + '">' + esc(b.code) + (b.active ? '' : '（停用）') + '</option>';
      }).join('');
      document.querySelector('#fixBatch').innerHTML = batchOptions('');
    }
    function render() {
      renderStats(); renderBatches(); renderQueue(); renderCards(); renderSelect();
    }
    async function load() {
      state = await api('/api/state');
      render();
    }
    document.querySelector('#registerForm').onsubmit = async function (e) {
      e.preventDefault();
      try {
        var v = formObj(this);
        var r = await api('/api/tickets', { method: 'POST', body: JSON.stringify(v) });
        setMsg(r.reused ? '该片已有未结束检测单 ' + r.ticket.id + '，沿用首次登记（不重复占曝光位）'
          : (r.admitted ? '已准入：' + r.ticket.id + ' 占 ' + r.ticket.slotNo + ' 号曝光位' : '已登记：' + r.ticket.id + '，只转待修边（' + r.reasons.join('；') + '）'), true);
        this.reset(); await load();
      } catch (err) { setMsg(err.message); }
    };
    document.querySelectorAll('[data-act]').forEach(function (btn) {
      btn.onclick = async function () {
        var form = document.querySelector('#processForm');
        var v = formObj(form);
        if (!v.id) { setMsg('请先选择检测单'); return; }
        try {
          if (btn.dataset.act === 'repair') {
            if (!v.repairman.trim()) throw new Error('请填写修边人');
            await api('/api/tickets/' + encodeURIComponent(v.id) + '/trim', { method: 'POST', body: JSON.stringify({ repairman: v.repairman }) });
            setMsg('修边已登记，等待换人复核（共两轮）', true);
          } else if (btn.dataset.act === 'review') {
            if (!v.reviewer.trim()) throw new Error('请填写复核人');
            var ratio = Number(v.reviewLeak);
            if (!Number.isFinite(ratio)) throw new Error('请填写本轮复核漏光');
            var rr = await api('/api/tickets/' + encodeURIComponent(v.id) + '/review', { method: 'POST', body: JSON.stringify({ reviewer: v.reviewer, leakRatio: ratio }) });
            setMsg(rr.result.boxed ? '两轮换人复核均≤5%，已入盒' : (rr.result.passed ? '第1轮通过，还须换人复核第2轮' : '本轮漏光高于5%，复核作废，请重修'), rr.result.passed);
          } else if (btn.dataset.act === 'correct') {
            var patch = {};
            if (String(v.newLeak).trim() !== '') patch.leakRatio = Number(v.newLeak);
            if (v.newBatch) patch.maskBatch = v.newBatch;
            if (!Object.keys(patch).length) throw new Error('请填写要更正的占比或选择新遮挡批次');
            var rc = await api('/api/tickets/' + encodeURIComponent(v.id) + '/correct', { method: 'PATCH', body: JSON.stringify(patch) });
            setMsg('结论已失效并重算，旧版留档：' + (rc.admitted ? '重新准入占 ' + rc.ticket.slotNo + ' 号位' : rc.reasons.join('；')), true);
          } else if (btn.dataset.act === 'complete') {
            await api('/api/tickets/' + encodeURIComponent(v.id) + '/complete', { method: 'POST', body: '{}' });
            setMsg('补晒完成，已让出曝光位，转修边', true);
          }
          form.reset(); renderSelect(); await load();
        } catch (err) { setMsg(err.message); }
      };
    });
    document.querySelector('#batchForm').onsubmit = async function (e) {
      e.preventDefault();
      try {
        await api('/api/batches', { method: 'POST', body: JSON.stringify(formObj(this)) });
        this.reset(); setMsg('遮挡批次已新增', true); await load();
      } catch (err) { setMsg(err.message); }
    };
    document.querySelector('#search').oninput = renderCards;
    document.querySelector('#reload').onclick = load;
    load();
  </script>
</body>
</html>`;
}
