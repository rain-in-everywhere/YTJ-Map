async function testMethod(method) {
  const el = document.getElementById("serverless-result");
  el.innerHTML = '<span style="color: var(--color-text-muted);">请求中…</span>';
  const start = performance.now();
  const { data, error } = await fetchJSON("/api/hello", method === "POST" ? { method: "POST", body: "{}" } : {});
  const ms = Math.round(performance.now() - start);
  if (error) { el.innerHTML = `<span style="color: var(--color-danger);">${escapeHTML(error)}</span>`; return; }
  el.innerHTML = `<p><span class="status-badge ok">${method}</span> &nbsp; 耗时 <strong>${ms}ms</strong> &nbsp; 运行时: ${escapeHTML(data.runtime)}</p>`;
}

async function runPerfTest() {
  const el = document.getElementById("serverless-result");
  const btn = document.getElementById("perf-btn");
  btn.disabled = true; btn.textContent = "测试中…";
  el.innerHTML = '<span style="color: var(--color-text-muted);">发送 5 个请求…</span>';

  const times = [];
  for (let i = 0; i < 5; i++) {
    const start = performance.now();
    try { await fetch("/api/hello"); times.push(Math.round(performance.now() - start)); }
    catch { times.push(null); }
  }

  const valid = times.filter(t => t !== null);
  const avg = valid.length ? Math.round(valid.reduce((a,b)=>a+b,0)/valid.length) : 0;
  btn.disabled = false; btn.textContent = "连续 5 次请求";
  el.innerHTML = `<p>5 次请求 &nbsp;|&nbsp; 平均 <strong>${avg}ms</strong> &nbsp;|&nbsp; 最快 ${Math.min(...valid)}ms &nbsp;|&nbsp; 最慢 ${Math.max(...valid)}ms</p>
    <p style="font-size:0.8rem;color:var(--color-text-muted);"><code>${JSON.stringify(times)}</code></p>`;
}
