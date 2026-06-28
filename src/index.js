/**
 * Cloudflare Worker — 计网课程 Serverless 网站
 *
 * 路由：
 *   /api/hello       — 简单 API，演示 Serverless 请求/响应
 *   /api/dns-lookup  — DNS-over-HTTPS 查询
 *   /api/cache-demo  — HTTP 缓存策略演示
 *   /api/geo         — 请求边缘节点/网络信息（CDN 演示）
 *   其他路径           — Workers Assets（public/ 静态文件）
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // ── API 路由 ──
    if (path === "/api/hello")   return handleHello(request);
    if (path === "/api/dns-lookup") return handleDnsLookup(url);
    if (path === "/api/cache-demo")  return handleCacheDemo(request, url);
    if (path === "/api/geo")     return handleGeo(request);

    // ── 静态文件 → Workers Assets ──
    try {
      return await env.ASSETS.fetch(request);
    } catch {
      return new Response("404 Not Found", { status: 404 });
    }
  },
};

// ═══════════════════════════════════════════════
// API Handler: /api/hello
// ═══════════════════════════════════════════════
function handleHello(request) {
  return json({
    message: "Hello from Cloudflare Worker!",
    method: request.method,
    runtime: "Cloudflare Workers (V8 Isolate)",
  });
}

// ═══════════════════════════════════════════════
// API Handler: /api/dns-lookup?domain=...&type=...
// ═══════════════════════════════════════════════
async function handleDnsLookup(url) {
  const domain = url.searchParams.get("domain") || "example.com";
  const recordType = url.searchParams.get("type") || "A";
  const validTypes = ["A", "AAAA", "CNAME", "MX", "TXT", "NS"];
  const type = validTypes.includes(recordType.toUpperCase()) ? recordType.toUpperCase() : "A";

  try {
    const dohRes = await fetch(
      `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=${type}`,
      { headers: { Accept: "application/dns-json" } }
    );
    if (!dohRes.ok) return json({ error: "DNS 查询失败", domain, recordType: type, dohStatus: dohRes.status }, 502);

    const dnsData = await dohRes.json();
    return json({
      domain, recordType: type,
      results: dnsData.Answer || [],
      status: dnsData.Status === 0 ? "NOERROR" : `错误码 ${dnsData.Status}`,
      resolver: "Cloudflare 1.1.1.1 (DoH)",
      dnsProtocol: "DNS over HTTPS — 加密查询",
    });
  } catch (err) {
    return json({ error: "DNS 查询异常", message: err.message }, 500);
  }
}

// ═══════════════════════════════════════════════
// API Handler: /api/cache-demo?strategy=...&count=N
// ═══════════════════════════════════════════════
function handleCacheDemo(request, url) {
  const strategy = url.searchParams.get("strategy") || "no-cache";
  const requestCount = parseInt(url.searchParams.get("count") || "0");

  const strategies = {
    "no-store":   { h: { "Cache-Control": "no-store" }, d: "浏览器绝不缓存，每次请求服务器。适合敏感数据。" },
    "no-cache":   { h: { "Cache-Control": "no-cache" }, d: "浏览器缓存但每次使用前需向服务器验证。" },
    "max-age-10": { h: { "Cache-Control": "public, max-age=10" }, d: "浏览器缓存 10 秒，期间不发请求。" },
    "max-age-60": { h: { "Cache-Control": "public, max-age=60" }, d: "浏览器缓存 60 秒。适合不常变化的内容。" },
    "etag":       { h: { "Cache-Control": "public, max-age=5", ETag: `"demo-etag-${requestCount % 3}"` }, d: "ETag 标识资源版本，304 响应表示未变化。" },
    "immutable":  { h: { "Cache-Control": "public, max-age=31536000, immutable" }, d: "永久缓存，适合带 hash 的静态资源。" },
  };

  const cfg = strategies[strategy] || strategies["no-cache"];
  const data = {
    strategy, appliedHeaders: cfg.h, description: cfg.d,
  };

  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "X-Strategy": strategy,
  });
  Object.entries(cfg.h).forEach(([k, v]) => headers.set(k, v));

  // ETag 304 条件响应
  if (strategy === "etag") {
    const ifNoneMatch = request.headers.get("If-None-Match");
    if (ifNoneMatch === cfg.h.ETag) {
      data.cacheHit = true;
      data.message = "304 Not Modified — 资源未变，使用缓存。";
      return new Response(null, { status: 304, headers });
    }
  }

  return new Response(JSON.stringify(data, null, 2), { headers });
}

// ═══════════════════════════════════════════════
// API Handler: /api/geo
// ═══════════════════════════════════════════════
function handleGeo(request) {
  const cf = request.cf || {};
  return json({
    colo: cf.colo || "未知（本地开发不注入 cf 数据）",
    coloNote: "IATA 代码：LAX=洛杉矶, NRT=东京, FRA=法兰克福, HKG=香港",
    asn: cf.asn || "未知",
    asnNote: cf.asn ? `AS${cf.asn} — 你的 ISP/网络` : "",
    httpProtocol: cf.httpProtocol || "未知",
    protocolNote: "HTTP/1.1（文本）, HTTP/2（多路复用）, HTTP/3（QUIC/UDP）",
    tlsVersion: cf.tlsVersion || "未知",
    tlsCipher: cf.tlsCipher || "未知",
    _devNote: cf.colo ? null : "⚠ 本地 dev 不注入 cf 数据，部署后可看真实信息。",
  });
}

// ═══════════════════════════════════════════════
// 工具函数
// ═══════════════════════════════════════════════
function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, If-None-Match",
      "X-Powered-By": "Cloudflare Workers",
    },
  });
}
