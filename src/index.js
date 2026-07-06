export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // ── R2 代理：/tiles/* → R2 ──
    if (path.startsWith('/tiles/')) {
      return serveR2(env, path.replace('/tiles/', ''), request);
    }

    // ── 自定义数据 API ──
    if (path === '/api/custom-data') {
      return serveR2(env, 'data/custom.geojson', request);
    }

    // ── 提交编辑 ──
    if (path === '/api/submit' && request.method === 'POST') {
      return handleSubmit(request, env);
    }

    // ── 列出 submissions（管理员） ──
    if (path === '/api/submissions') {
      return handleListSubmissions(env);
    }

    // ── 获取单个 submission 详情（管理员） ──
    if (path.startsWith('/api/submissions/') && request.method === 'GET') {
      return handleGetSubmission(path, env);
    }

    // ── 应用 / 拒绝 submission ──
    if (path.startsWith('/api/submissions/') && request.method === 'POST') {
      return handleReview(path, request, env);
    }

    // ── 静态资源 ──
    return env.ASSETS.fetch(request);
  }
};

// ── R2 文件服务（含 Range 支持） ──
async function serveR2(env, key, request) {
  const obj = await env.TILES.get(key);
  if (!obj) return json({ error: 'Not found' }, 404);

  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set('etag', obj.httpEtag);
  headers.set('Cache-Control', 'public, max-age=86400');
  headers.set('Access-Control-Allow-Origin', '*');

  const rangeHeader = request.headers.get('Range');
  if (rangeHeader) {
    const m = rangeHeader.match(/bytes=(\d+)-(\d*)/);
    if (m) {
      const start = parseInt(m[1]);
      const end = m[2] ? parseInt(m[2]) : obj.size - 1;
      const sliced = await env.TILES.get(key, { range: { offset: start, length: end - start + 1 } });
      if (!sliced) return json({ error: 'Range not satisfiable' }, 416);
      sliced.writeHttpMetadata(headers);
      headers.set('Content-Range', `bytes ${start}-${end}/${obj.size}`);
      return new Response(sliced.body, { status: 206, headers });
    }
  }

  headers.set('Accept-Ranges', 'bytes');
  return new Response(obj.body, { headers });
}

// ── POST /api/submit ──
async function handleSubmit(request, env) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  if (!body.features || !Array.isArray(body.features)) {
    return json({ error: 'Missing features array' }, 400);
  }

  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const id = ts;
  const submission = {
    id,
    submittedAt: new Date().toISOString(),
    user: body.user || 'anonymous',
    count: body.features.length,
    features: body.features,
    status: 'pending'
  };

  await env.TILES.put(`submissions/${id}.json`, JSON.stringify(submission));

  // 更新 submissions 索引
  await updateSubmissionIndex(env, id, submission);

  return json({ ok: true, id, count: submission.count });
}

// ── GET /api/submissions ──
async function handleListSubmissions(env) {
  const index = await getSubmissionIndex(env);
  const list = Object.values(index)
    .filter(s => s.status === 'pending')
    .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
  return json(list);
}

// ── GET /api/submissions/:id  ──
async function handleGetSubmission(path, env) {
  const id = path.replace('/api/submissions/', '').replace(/\/$/, '');
  const obj = await env.TILES.get(`submissions/${id}.json`);
  if (!obj) return json({ error: 'Submission not found' }, 404);
  const sub = JSON.parse(await obj.text());
  return json(sub);
}

// ── POST /api/submissions/:id  (action=apply|reject) ──
async function handleReview(path, request, env) {
  const id = path.replace('/api/submissions/', '').replace(/\/$/, '');
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  const action = body.action;

  if (action === 'apply') {
    // 读取 submission
    const subObj = await env.TILES.get(`submissions/${id}.json`);
    if (!subObj) return json({ error: 'Submission not found' }, 404);
    const sub = JSON.parse(await subObj.text());

    // 读取当前 master 数据
    let master = { type: 'FeatureCollection', features: [] };
    const masterObj = await env.TILES.get('data/custom.geojson');
    if (masterObj) {
      master = JSON.parse(await masterObj.text());
    }

    // 合并：submission 的 features 覆盖/新增到 master
    const masterMap = {};
    master.features.forEach(f => { masterMap[String(f.id)] = f; });
    sub.features.forEach(f => { masterMap[String(f.id)] = f; });
    master.features = Object.values(masterMap);

    // 写回 R2
    await env.TILES.put('data/custom.geojson', JSON.stringify(master));

    // 更新状态
    sub.status = 'applied';
    await env.TILES.put(`submissions/${id}.json`, JSON.stringify(sub));
    await updateSubmissionIndex(env, id, sub);

    return json({ ok: true, action: 'applied', totalFeatures: master.features.length });
  }

  if (action === 'reject') {
    const subObj = await env.TILES.get(`submissions/${id}.json`);
    if (!subObj) return json({ error: 'Submission not found' }, 404);
    const sub = JSON.parse(await subObj.text());
    sub.status = 'rejected';
    await env.TILES.put(`submissions/${id}.json`, JSON.stringify(sub));
    await updateSubmissionIndex(env, id, sub);
    return json({ ok: true, action: 'rejected' });
  }

  return json({ error: 'Invalid action. Use "apply" or "reject".' }, 400);
}

// ── submission 索引辅助 ──
async function getSubmissionIndex(env) {
  const obj = await env.TILES.get('submissions/index.json');
  if (!obj) return {};
  try { return JSON.parse(await obj.text()); } catch { return {}; }
}

async function updateSubmissionIndex(env, id, sub) {
  const index = await getSubmissionIndex(env);
  index[id] = {
    id, submittedAt: sub.submittedAt, user: sub.user,
    count: sub.count, status: sub.status
  };
  await env.TILES.put('submissions/index.json', JSON.stringify(index));
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
  });
}
