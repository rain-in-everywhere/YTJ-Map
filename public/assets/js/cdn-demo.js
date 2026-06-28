async function fetchGeo() {
  const el = document.getElementById("cdn-result");
  el.innerHTML = '<span style="color: var(--color-text-muted);">查询中…</span>';
  const { data, error } = await fetchJSON("/api/geo");
  if (error) { el.innerHTML = `<span style="color: var(--color-danger);">${escapeHTML(error)}</span>`; return; }
  el.innerHTML = `
    <table class="info-table">
      <tr><td>边缘节点</td><td><strong>${escapeHTML(String(data.colo))}</strong></td><td>${escapeHTML(String(data.coloNote||""))}</td></tr>
      <tr><td>HTTP 协议</td><td><strong>${escapeHTML(String(data.httpProtocol))}</strong></td><td>${escapeHTML(String(data.protocolNote||""))}</td></tr>
      <tr><td>TLS</td><td><strong>${escapeHTML(String(data.tlsVersion||""))}</strong></td><td>${escapeHTML(String(data.tlsCipher||""))}</td></tr>
      <tr><td>ASN</td><td><strong>${escapeHTML(String(data.asn))}</strong></td><td>${escapeHTML(String(data.asnNote||""))}</td></tr>
    </table>
  `;
  if (data._devNote) el.innerHTML += `<p style="color:var(--color-warning);font-size:0.85rem;">⚠ ${escapeHTML(data._devNote)}</p>`;
}
