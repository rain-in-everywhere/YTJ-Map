/**
 * 侧边栏 — 请求数据包实时监控（sessionStorage 持久化）
 * 拦截所有 fetch 到 /api/* 的请求，历史跨页面导航保留
 */

const STORAGE_KEY_BASE = "pkt_base";
const STORAGE_KEY_LIST = "pkt_list";

let basePacket = null;
let entries = [];
let reqCounter = 0;

// ── 初始化 ──
(async function init() {
  // 从 sessionStorage 恢复历史
  const savedBase = sessionStorage.getItem(STORAGE_KEY_BASE);
  const savedList = sessionStorage.getItem(STORAGE_KEY_LIST);

  if (savedBase) basePacket = JSON.parse(savedBase);
  if (savedList) entries = JSON.parse(savedList);

  // 获取/刷新基础网络信息
  const res = await fetch("/api/packet-inspect").catch(() => null);
  if (res && res.ok) {
    basePacket = await res.json();
    sessionStorage.setItem(STORAGE_KEY_BASE, JSON.stringify(basePacket));
  }

  // 只在首次（没有保存历史）时添加 PAGE 条目
  if (entries.length === 0) {
    entries.push({ method: "PAGE", path: location.pathname, status: 200, ms: 0, hdrs: {} });
    persistList();
  } else {
    // 添加当前页面访问条目
    entries.push({ method: "PAGE", path: location.pathname, status: 200, ms: 0, hdrs: {} });
    persistList();
  }

  renderAll();
  injectInterceptor();

  // 自动展开最后一条
  const all = document.querySelectorAll(".req-item:last-child .req-detail");
  if (all.length) all[all.length - 1].classList.add("open");
})();

// ── 持久化 ──
function persistList() {
  try {
    sessionStorage.setItem(STORAGE_KEY_LIST, JSON.stringify(entries.slice(-50))); // 保留最近 50 条
  } catch { /* quota exceeded, drop oldest */ }
}

// ── 渲染全部 ──
function renderAll() {
  const list = document.getElementById("req-list");
  list.innerHTML = "";
  if (entries.length === 0) {
    list.innerHTML = '<span style="color: var(--color-text-muted); font-size: 0.78rem;">等待请求…</span>';
    return;
  }
  entries.forEach((e, i) => {
    const cls = e.status >= 200 && e.status < 300 ? "s2xx" : e.status >= 300 && e.status < 400 ? "s3xx" : "s4xx";
    const item = document.createElement("div");
    item.className = "req-item";
    item.innerHTML = `
      <div class="req-summary" onclick="toggleReq(this)">
        <span class="req-num">#${i + 1}</span>
        <span class="req-method">${escapeHTML(e.method)}</span>
        <span class="req-path">${escapeHTML(e.path)}</span>
        <span class="req-status ${cls}">${e.status}</span>
        <span class="req-time">${e.ms ? e.ms + "ms" : "—"}</span>
        <span class="req-expand">▸</span>
      </div>
      <div class="req-detail">${buildPacketDetail(e)}</div>
    `;
    list.appendChild(item);
  });
  list.scrollTop = list.scrollHeight;
  reqCounter = entries.length;
}

// ── 拦截 fetch ──
function injectInterceptor() {
  const origFetch = window.fetch;
  window.fetch = function (input, init) {
    const url = typeof input === "string" ? input : input.url;
    const method = (init?.method || "GET").toUpperCase();
    if (!url.includes("/api/") || url.includes("/api/packet-inspect")) {
      return origFetch.apply(this, arguments);
    }
    const start = performance.now();
    return origFetch.apply(this, arguments).then(async (response) => {
      const ms = Math.round(performance.now() - start);
      const path = new URL(url, location.origin).pathname + new URL(url, location.origin).search;
      const hdrs = {};
      response.headers.forEach((v, k) => { hdrs[k] = v; });
      addEntry({ method, path, status: response.status, ms, hdrs });
      return response;
    });
  };
}

// ── 添加条目 ──
function addEntry(e) {
  entries.push(e);
  persistList();
  // 增量渲染：只追加新条目到 DOM
  const list = document.getElementById("req-list");
  if (entries.length === 1) list.innerHTML = "";
  reqCounter = entries.length;
  const cls = e.status >= 200 && e.status < 300 ? "s2xx" : e.status >= 300 && e.status < 400 ? "s3xx" : "s4xx";
  const item = document.createElement("div");
  item.className = "req-item";
  item.innerHTML = `
    <div class="req-summary" onclick="toggleReq(this)">
      <span class="req-num">#${reqCounter}</span>
      <span class="req-method">${escapeHTML(e.method)}</span>
      <span class="req-path">${escapeHTML(e.path)}</span>
      <span class="req-status ${cls}">${e.status}</span>
      <span class="req-time">${e.ms ? e.ms + "ms" : "—"}</span>
      <span class="req-expand">▸</span>
    </div>
    <div class="req-detail">${buildPacketDetail(e)}</div>
  `;
  list.appendChild(item);
  list.scrollTop = list.scrollHeight;
}

// ── 构建协议栈详情 ──
function buildPacketDetail(e) {
  const ip = basePacket?.ip || { src: "—", dst: location.hostname, protocol: "TCP", version: 4, headerLength: "20 bytes", ttl: "—" };
  const tcp = basePacket?.tcp || { srcPort: "—", dstPort: 443, flags: ["ACK","PSH"], headerLength: "20 bytes" };
  const tls = basePacket?.tls || { version: "TLSv1.3", cipher: "—" };
  const route = basePacket?.route || null;
  const hdrs = e.hdrs || {};

  let routeHtml = "";
  if (route) {
    routeHtml = `
    <div style="font-size:0.72rem; padding:0.4rem 0.5rem; margin-bottom:0.3rem; border:1px dashed var(--color-border); border-radius:4px; line-height:1.6;">
      <div style="display:flex;align-items:center;gap:0.3rem;margin-bottom:0.2rem;">
        <span style="color:var(--color-accent);font-weight:700;">🖥 你</span>
        <span style="color:var(--color-text-muted);">${escapeHTML(route.client.ip)} (${escapeHTML(route.client.asn)}) · ${escapeHTML(route.client.city)}</span>
      </div>
      <div style="text-align:center;color:var(--color-text-muted);margin:0.15rem 0;">⬇ ISP 网络 · BGP Anycast</div>
      <div style="display:flex;align-items:center;gap:0.3rem;margin-bottom:0.2rem;">
        <span style="color:var(--color-primary);font-weight:700;">☁️ Cloudflare</span>
        <span style="color:var(--color-text-muted);">${escapeHTML(route.edge.colo)} ${route.edge.coloName||""} · SSL 解密 · Worker 执行</span>
      </div>
      <div style="text-align:center;color:var(--color-text-muted);margin:0.15rem 0;">⬆ 响应原路返回</div>
      <div style="display:flex;align-items:center;gap:0.3rem;">
        <span style="color:var(--color-accent);font-weight:700;">🖥 你</span>
        <span style="color:var(--color-text-muted);">收到 ${e.status} · ${e.ms}ms</span>
      </div>
    </div>`;
  }

  let hdrRows = "";
  ["cache-control", "etag", "x-strategy", "x-response-time-ms", "x-edge-location", "x-powered-by", "content-type"].forEach(k => {
    if (hdrs[k]) hdrRows += `<span class="pkt-hdr"><span class="k">${escapeHTML(k)}</span> <span class="v">${escapeHTML(hdrs[k])}</span></span>`;
  });

  return routeHtml + `
    <div class="pkt-layer pkt-ip">
      <span class="lbl">IP</span>
      <div class="pkt-hdr"><span><span class="k">源</span> <span class="v">${escapeHTML(ip.src)}</span></span><span><span class="k">目的</span> <span class="v">${escapeHTML(ip.dst)}</span></span><span><span class="k">协议</span> <span class="v">TCP</span></span></div>
    </div>
<div class="pkt-layer pkt-tls">
      <span class="lbl">TLS</span>
      <div class="pkt-hdr"><span><span class="k">${escapeHTML(tls.version)}</span> <span class="v">${escapeHTML(tls.cipher)}</span></span></div>
    </div>
    <div class="pkt-layer pkt-http">
      <span class="lbl">HTTP</span>
      <div class="pkt-hdr"><span><span class="k">${escapeHTML(e.method)}</span> <span class="v">${escapeHTML(e.path)}</span></span><span><span class="k">→</span> <span class="v">${e.status} · ${e.ms}ms</span></span>${hdrRows}</div>
    </div>
  `;
}

function toggleReq(s) {
  const d = s.nextElementSibling;
  d.classList.toggle("open");
  s.querySelector(".req-expand").textContent = d.classList.contains("open") ? "▾" : "▸";
}
