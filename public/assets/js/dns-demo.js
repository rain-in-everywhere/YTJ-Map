async function doDnsLookup() {
  const domain = document.getElementById("dns-domain").value.trim();
  const type = document.getElementById("dns-type").value;
  const el = document.getElementById("dns-result");
  if (!domain) { el.innerHTML = '<span style="color: var(--color-danger);">请输入域名</span>'; return; }
  el.innerHTML = '<span style="color: var(--color-text-muted);">DoH 加密查询中…</span>';

  const { data, error } = await fetchJSON(`/api/dns-lookup?domain=${encodeURIComponent(domain)}&type=${type}`);
  if (error || data.error) { el.innerHTML = `<span style="color: var(--color-danger);">${escapeHTML(error||data.error)}</span>`; return; }

  const results = data.results || [];
  if (results.length === 0) {
    el.innerHTML = `<p style="color: var(--color-text-muted);">未找到 ${escapeHTML(type)} 记录 (${escapeHTML(data.status||"—")})</p>`;
    return;
  }
  let html = '<table class="info-table"><tr><th>名称</th><th>类型</th><th>TTL</th><th>数据</th></tr>';
  results.forEach(r => {
    html += `<tr><td>${escapeHTML(r.name||"—")}</td><td><span class="status-badge info">${escapeHTML(String(r.type))}</span></td><td>${r.TTL||"—"}</td><td><strong>${escapeHTML(String(r.data||"—"))}</strong></td></tr>`;
  });
  html += '</table>';
  html += `<p style="font-size:0.8rem; color:var(--color-text-muted);">解析器: ${escapeHTML(data.resolver)} &nbsp;|&nbsp; ${escapeHTML(data.dnsProtocol)}</p>`;
  el.innerHTML = html;
}
function quickLookup(d) { document.getElementById("dns-domain").value = d; doDnsLookup(); }
document.addEventListener("DOMContentLoaded", () => {
  const inp = document.getElementById("dns-domain");
  if (inp) inp.addEventListener("keydown", e => { if (e.key === "Enter") doDnsLookup(); });
});
