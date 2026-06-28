let cacheCount = 0;

async function sendCacheRequest() {
  const strategy = document.getElementById("cache-strategy").value;
  const el = document.getElementById("cache-result");
  cacheCount++;
  el.innerHTML = '<span style="color: var(--color-text-muted);">请求中…</span>';

  const start = performance.now();
  const { data, error, response } = await fetchJSON(`/api/cache-demo?strategy=${strategy}&count=${cacheCount}`);
  const ms = Math.round(performance.now() - start);

  if (error) { el.innerHTML = `<span style="color: var(--color-danger);">${escapeHTML(error)}</span>`; return; }

  const status = response.status;
  const cc = response.headers.get("Cache-Control") || data?.appliedHeaders?.["Cache-Control"] || "—";
  const etag = response.headers.get("ETag") || data?.appliedHeaders?.ETag || "—";

  if (status === 304) {
    el.innerHTML = `<p><span class="status-badge ok">304 缓存命中</span> &nbsp;|&nbsp; 耗时 <strong>${ms}ms</strong></p>
      <p style="font-size:0.85rem; color:var(--color-text-muted);">Cache-Control: <code>${escapeHTML(cc)}</code> &nbsp;|&nbsp; ETag: <code>${escapeHTML(etag)}</code></p>
      <p style="font-size:0.85rem;">资源未变化，浏览器使用缓存副本。</p>`;
    return;
  }

  el.innerHTML = `
    <p><span class="status-badge info">200 从服务器获取</span> &nbsp;|&nbsp; 耗时 <strong>${ms}ms</strong> &nbsp;|&nbsp; 第 ${cacheCount} 次</p>
    <p style="font-size:0.85rem; color:var(--color-text-muted);">
      Cache-Control: <code>${escapeHTML(cc)}</code><br>
      ETag: <code>${escapeHTML(etag)}</code>
    </p>
    <p style="font-size:0.85rem;">${escapeHTML(data?.description||"")}</p>
  `;
}
