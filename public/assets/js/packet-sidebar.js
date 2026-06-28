/**
 * 侧边栏 — 请求数据包实时监控
 * 拦截所有 fetch 到 /api/* 的请求，在侧边栏显示 IP→TCP→TLS→HTTP 层解析
 */

// 全局基础网络信息（页面加载时获取一次，所有请求共用 IP/TCP/TLS 层）
let basePacket = null;
let reqCounter = 0;

// ── 初始化：获取基础网络层信息 ──
(async function init() {
  const res = await fetch("/api/packet-inspect").catch(() => null);
  if (res && res.ok) basePacket = await res.json();
  addSidebarEntry({
    method: "PAGE",
    path: window.location.pathname,
    status: 200,
    ms: 0,
    hdrs: {},
    note: "页面加载 — 以下为你的网络层基础信息",
  });
  // 标记为页面加载，直接展开
  const last = document.querySelector(".req-item:last-child .req-detail");
  if (last) last.classList.add("open");
  // 注入 fetch 拦截
  injectInterceptor();
})();

// ── 拦截 fetch ──
function injectInterceptor() {
  const origFetch = window.fetch;
  window.fetch = function (input, init) {
    const url = typeof input === "string" ? input : input.url;
    const method = (init?.method || "GET").toUpperCase();

    // 只拦截我们自己 API 的请求；跳过 packet-inspect 避免递归
    if (!url.includes("/api/") || url.includes("/api/packet-inspect")) {
      return origFetch.apply(this, arguments);
    }

    const start = performance.now();
    return origFetch.apply(this, arguments).then(async (response) => {
      const ms = Math.round(performance.now() - start);
      const path = new URL(url, location.origin).pathname + new URL(url, location.origin).search;

      // 收集响应头
      const hdrs = {};
      response.headers.forEach((v, k) => { hdrs[k] = v; });

      addSidebarEntry({ method, path, status: response.status, ms, hdrs });
      return response;
    });
  };
}

// ── 添加一条请求到侧边栏 ──
function addSidebarEntry({ method, path, status, ms, hdrs }) {
  reqCounter++;
  const list = document.getElementById("req-list");
  if (reqCounter === 1) list.innerHTML = "";

  const cls = status >= 200 && status < 300 ? "s2xx" : status >= 300 && status < 400 ? "s3xx" : "s4xx";
  const rtime = ms ? `${ms}ms` : "—";

  const item = document.createElement("div");
  item.className = "req-item";
  item.innerHTML = `
    <div class="req-summary" onclick="toggleReq(this)">
      <span class="req-num">#${reqCounter}</span>
      <span class="req-method">${escapeHTML(method)}</span>
      <span class="req-path">${escapeHTML(path)}</span>
      <span class="req-status ${cls}">${status}</span>
      <span class="req-time">${rtime}</span>
      <span class="req-expand">▸</span>
    </div>
    <div class="req-detail">${buildPacketDetail(method, path, status, ms, hdrs)}</div>
  `;
  list.appendChild(item);
  list.scrollTop = list.scrollHeight;
}

// ── 构建数据包分层详情 ──
function buildPacketDetail(method, path, status, ms, hdrs) {
  // 用 basePacket 填充 IP/TCP/TLS 层
  const ip = basePacket?.ip || { src: "—", dst: location.hostname, protocol: "TCP", version: 4, headerLength: "20 bytes", ttl: "—", note: "IP 层信息来自 Cloudflare request.cf" };
  const tcp = basePacket?.tcp || { srcPort: "—", dstPort: 443, flags: ["ACK","PSH"], headerLength: "20 bytes", note: "TCP 在 Cloudflare 边缘终结" };
  const tls = basePacket?.tls || { version: "TLSv1.3", cipher: "—", note: "客户端→CF 边缘 TLS 加密" };

  // HTTP 响应头摘要
  let hdrRows = "";
  const keyHdrs = ["cache-control", "etag", "x-strategy", "x-response-time-ms", "x-edge-location", "x-powered-by", "content-type"];
  keyHdrs.forEach(k => {
    if (hdrs[k]) hdrRows += `<span class="pkt-hdr"><span class="k">${escapeHTML(k)}</span> <span class="v">${escapeHTML(hdrs[k])}</span></span>`;
  });

  return `
    <div class="pkt-layer pkt-ip">
      <span class="lbl">IP</span>
      <div class="pkt-hdr">
        <span><span class="k">源</span> <span class="v">${escapeHTML(ip.src)}</span></span>
        <span><span class="k">目的</span> <span class="v">${escapeHTML(ip.dst)}</span></span>
        <span><span class="k">协议</span> <span class="v">${escapeHTML(ip.protocol)}</span></span>
        <span><span class="k">TTL</span> <span class="v">${escapeHTML(ip.ttl)}</span></span>
      </div>
    </div>
    <div class="pkt-layer pkt-tcp">
      <span class="lbl">TCP</span>
      <div class="pkt-hdr">
        <span><span class="k">端口</span> <span class="v">→ ${tcp.dstPort}</span></span>
        <span><span class="k">Flags</span> <span class="v">${(tcp.flags||[]).join(",")}</span></span>
      </div>
    </div>
    <div class="pkt-layer pkt-tls">
      <span class="lbl">TLS</span>
      <div class="pkt-hdr">
        <span><span class="k">版本</span> <span class="v">${escapeHTML(tls.version)}</span></span>
        <span><span class="k">加密</span> <span class="v">${escapeHTML(tls.cipher)}</span></span>
      </div>
    </div>
    <div class="pkt-layer pkt-http">
      <span class="lbl">HTTP</span>
      <div class="pkt-hdr">
        <span><span class="k">Method</span> <span class="v">${escapeHTML(method)}</span></span>
        <span><span class="k">Path</span> <span class="v">${escapeHTML(path)}</span></span>
        <span><span class="k">Status</span> <span class="v">${status}</span></span>
        <span><span class="k">耗时</span> <span class="v">${ms}ms</span></span>
        ${hdrRows}
      </div>
    </div>
  `;
}

// ── 展开/折叠 ──
function toggleReq(summary) {
  const detail = summary.nextElementSibling;
  const arrow = summary.querySelector(".req-expand");
  detail.classList.toggle("open");
  arrow.textContent = detail.classList.contains("open") ? "▾" : "▸";
}
