import { Hono } from 'hono';
import { z } from 'zod';
import { slugify, uniqueSlug, parseTags, paginate, escapeHtml, excerpt, markdownToHtml } from './lib.ts';

type Bindings = {
  DB: D1Database;
  OLLAMA_PUBLIC_ENDPOINT?: string;
  ADMIN_KEY?: string;
};

const app = new Hono<{ Bindings: Bindings }>();

const PostSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().min(1),
  tags: z.union([z.array(z.string()), z.string()]).optional(),
  status: z.enum(['draft', 'published']).default('published'),
});

function requireAdmin(c: any): boolean {
  const key = c.req.header('x-admin-key');
  return Boolean(c.env.ADMIN_KEY && key === c.env.ADMIN_KEY);
}

// ---------- 公开 API ----------
app.get('/api/posts', async (c) => {
  const url = new URL(c.req.url);
  const page = Number(url.searchParams.get('page') || '1');
  const size = Number(url.searchParams.get('size') || '10');
  const tag = url.searchParams.get('tag') || '';
  const q = url.searchParams.get('q') || '';

  let where = 'status = ?';
  const params: any[] = ['published'];
  if (tag) { where += ' AND tags LIKE ?'; params.push(`%${tag}%`); }
  if (q) { where += ' AND (title LIKE ? OR content LIKE ?)'; params.push(`%${q}%`, `%${q}%`); }

  const totalRow = await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM posts WHERE ${where}`).bind(...params).first<{ n: number }>();
  const { page: safePage, size: safeSize, totalPages, offset } = paginate(Number(totalRow?.n || 0), page, size);

  const { results } = await c.env.DB.prepare(
    `SELECT id, title, slug, tags, status, created_at FROM posts WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`
  ).bind(...params, safeSize, offset).all();

  return c.json({ posts: results, page: safePage, size: safeSize, total: totalRow?.n || 0, totalPages });
});

app.get('/api/posts/:slug', async (c) => {
  const slug = c.req.param('slug');
  const post = await c.env.DB.prepare('SELECT * FROM posts WHERE slug = ?').bind(slug).first();
  if (!post) return c.json({ error: 'Not found' }, 404);
  return c.json({ post });
});

app.get('/api/tags', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT tags FROM posts WHERE status = ?').bind('published').all<{ tags: string }>();
  const count = new Map<string, number>();
  for (const row of results) {
    for (const t of parseTags(row.tags)) count.set(t, (count.get(t) || 0) + 1);
  }
  const tags = [...count.entries()].map(([name, n]) => ({ name, count: n })).sort((a, b) => b.count - a.count);
  return c.json({ tags });
});

// ---------- 管理 API（需 x-admin-key） ----------
app.post('/api/posts', async (c) => {
  if (!requireAdmin(c)) return c.json({ error: 'forbidden' }, 403);
  const body = await c.req.json();
  const parsed = PostSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error }, 400);

  const existing = await c.env.DB.prepare('SELECT slug FROM posts').all<{ slug: string }>();
  const slug = uniqueSlug(parsed.data.title, existing.results.map((r) => r.slug));
  const tags = JSON.stringify(parseTags(parsed.data.tags));
  const now = new Date().toISOString();

  await c.env.DB.prepare(
    'INSERT INTO posts (title, content, slug, tags, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).bind(parsed.data.title, parsed.data.content, slug, tags, parsed.data.status, now, now).run();

  return c.json({ success: true, slug }, 201);
});

app.put('/api/posts/:id', async (c) => {
  if (!requireAdmin(c)) return c.json({ error: 'forbidden' }, 403);
  const id = c.req.param('id');
  const body = await c.req.json();
  const parsed = PostSchema.partial().safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error }, 400);
  const fields: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.tags !== undefined) fields.tags = JSON.stringify(parseTags(parsed.data.tags));
  fields.updated_at = new Date().toISOString();
  const entries = Object.entries(fields);
  if (entries.length === 0) return c.json({ error: 'no fields to update' }, 400);
  const sets = entries.map(([k]) => `${k} = ?`).join(', ');
  const values = entries.map(([, v]) => (Array.isArray(v) ? JSON.stringify(v) : String(v)));
  values.push(id);
  await c.env.DB.prepare(`UPDATE posts SET ${sets} WHERE id = ?`).bind(...values).run();
  return c.json({ success: true });
});

app.delete('/api/posts/:id', async (c) => {
  if (!requireAdmin(c)) return c.json({ error: 'forbidden' }, 403);
  const id = c.req.param('id');
  await c.env.DB.prepare('DELETE FROM posts WHERE id = ?').bind(id).run();
  return c.json({ success: true });
});

// ---------- AI 生成 ----------
app.post('/api/ai/generate', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const topic = String(body.topic || 'AI').slice(0, 200);
  const endpoint = c.env.OLLAMA_PUBLIC_ENDPOINT || 'http://localhost:11434';
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    const res = await fetch(`${endpoint}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'qwen2.5:14b', prompt: `写一篇关于${topic}的博客，含标题和正文，600字` }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return c.json({ error: `AI service error: ${res.status}` }, 502);
    const data = await res.json() as { response?: string };
    return c.json({ content: data.response || '' });
  } catch {
    return c.json({ error: 'AI service unavailable' }, 503);
  }
});

// ---------- SEO: RSS / Sitemap ----------
app.get('/rss.xml', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT title, slug, content, created_at FROM posts WHERE status = ? ORDER BY created_at DESC LIMIT 20'
  ).bind('published').all<{ title: string; slug: string; content: string; created_at: string }>();
  const origin = new URL(c.req.url).origin;
  const items = results.map((p) => {
    const link = `${origin}/post/${p.slug}`;
    return `<item><title>${escapeHtml(p.title)}</title><link>${link}</link><guid>${link}</guid><description>${escapeHtml(excerpt(p.content))}</description><pubDate>${p.created_at}</pubDate></item>`;
  }).join('');
  return c.html(`<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>XinBlog</title><link>${origin}</link><description>AI powered blog</description>${items}</channel></rss>`, 200, { 'Content-Type': 'application/rss+xml' });
});

app.get('/sitemap.xml', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT slug, updated_at FROM posts WHERE status = ?').bind('published').all<{ slug: string; updated_at?: string }>();
  const origin = new URL(c.req.url).origin;
  const urls = results.map((p) => `<url><loc>${origin}/post/${p.slug}</loc><lastmod>${p.updated_at || new Date().toISOString().slice(0, 10)}</lastmod></url>`).join('');
  return c.html(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${origin}/</loc></url>${urls}</urlset>`, 200, { 'Content-Type': 'application/xml' });
});

// ---------- 前端页面 ----------
const HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>XinBlog - AI 驱动博客</title>
<style>
:root { --bg:#0f1117; --card:#1a1d27; --text:#e6e8ef; --muted:#8b90a0; --accent:#6c8cff; }
* { box-sizing:border-box; margin:0; padding:0; }
body { background:var(--bg); color:var(--text); font-family:system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif; line-height:1.7; }
.container { max-width:820px; margin:0 auto; padding:24px 16px; }
header { display:flex; align-items:center; justify-content:space-between; padding:24px 0; border-bottom:1px solid #232838; margin-bottom:28px; }
header h1 { font-size:22px; } header h1 a { color:var(--text); text-decoration:none; }
.toolbar { display:flex; gap:10px; margin-bottom:24px; }
.toolbar input { flex:1; background:#1a1d27; border:1px solid #2a3040; color:var(--text); padding:10px 14px; border-radius:8px; }
.toolbar button { background:var(--accent); border:none; color:#fff; padding:10px 18px; border-radius:8px; cursor:pointer; }
.tagbar { display:flex; flex-wrap:wrap; gap:8px; margin-bottom:24px; }
.tag { background:#1a1d27; border:1px solid #2a3040; padding:4px 12px; border-radius:20px; font-size:13px; cursor:pointer; color:var(--muted); }
.tag.active { border-color:var(--accent); color:var(--accent); }
.post { background:var(--card); border-radius:12px; padding:20px 22px; margin-bottom:16px; cursor:pointer; transition:transform .15s; }
.post:hover { transform:translateY(-2px); }
.post h2 { font-size:18px; margin-bottom:8px; color:var(--text); }
.post .meta { font-size:12px; color:var(--muted); margin-bottom:10px; }
.post .excerpt { font-size:14px; color:var(--muted); }
.pager { display:flex; gap:10px; justify-content:center; margin:28px 0; }
.pager button { background:#1a1d27; border:1px solid #2a3040; color:var(--text); padding:8px 16px; border-radius:8px; cursor:pointer; }
.pager button:disabled { opacity:.4; cursor:not-allowed; }
.article { background:var(--card); border-radius:12px; padding:28px; }
.article h1 { font-size:26px; margin-bottom:12px; }
.article .meta { font-size:13px; color:var(--muted); margin-bottom:20px; }
.article .content { font-size:16px; } .article .content h1,.article .content h2,.article .content h3 { margin:18px 0 8px; }
.article .content pre { background:#0d0f15; padding:14px; border-radius:8px; overflow-x:auto; font-size:13px; margin:12px 0; }
.article .content ul { padding-left:22px; } .article .content br { display:block; content:""; margin:4px 0; }
.back { display:inline-block; margin-bottom:20px; color:var(--accent); text-decoration:none; font-size:14px; }
</style>
</head>
<body>
<div class="container">
<header><h1><a href="/">XinBlog</a></h1><span style="color:var(--muted);font-size:13px">AI 驱动 · 零成本 · 开源</span></header>
<div class="toolbar"><input id="q" placeholder="搜索文章..."><button onclick="load(1)">搜索</button></div>
<div class="tagbar" id="tags"></div>
<div id="app"><p style="color:var(--muted)">加载中...</p></div>
<div class="pager" id="pager"></div>
</div>
<script>
const app=document.getElementById('app'),tagsEl=document.getElementById('tags'),pager=document.getElementById('pager');
let state={page:1,tag:'',q:''};
async function load(page){
  state.page=page; const p=state.page, q=state.q, tag=state.tag;
  const url='/api/posts?page='+p+'&size=10'+(tag?'&tag='+encodeURIComponent(tag):'')+(q?'&q='+encodeURIComponent(q):'');
  const r=await fetch(url); const d=await r.json();
  app.innerHTML=d.posts.length?d.posts.map(p=>'<div class="post" onclick="location.href=\'/post/'+p.slug+'\'"><h2>'+p.title+'</h2><div class="meta">'+(p.tags?JSON.parse(p.tags).map(t=>'#'+t).join(' '):'')+'</div><div class="excerpt">'+new Date(p.created_at).toLocaleDateString()+'</div></div>').join(''):'<p style="color:var(--muted)">暂无文章</p>';
  pager.innerHTML=(d.page>1?'<button onclick="load('+(d.page-1)+')">上一页</button>':'<button disabled>上一页</button>')+'<button onclick="load('+(d.page+1)+')" '+(d.page>=d.totalPages?'disabled':'')+'>下一页</button>';
}
async function loadTags(){
  const r=await fetch('/api/tags'); const d=await r.json();
  tagsEl.innerHTML='<span class="tag '+(state.tag===''?'active':'')+'" onclick="state.tag=\'\';state.page=1;load(1);loadTags()">全部</span>'+d.tags.map(t=>'<span class="tag '+(state.tag===t.name?'active':'')+'" onclick="state.tag=\''+t.name+'\';state.page=1;load(1);loadTags()">'+t.name+'('+t.count+')</span>').join('');
}
document.getElementById('q').addEventListener('keydown',e=>{if(e.key==='Enter'){state.q=document.getElementById('q').value;state.page=1;load(1);}});
load(1); loadTags();
</script>
</body>
</html>`;

// 前端路由：首页与文章页（同构 SSR 简化：首页返回静态壳，文章页由 JS 拉取 API）
app.get('/', (c) => c.html(HTML));
app.get('/post/:slug', async (c) => {
  const slug = c.req.param('slug');
  const post = await c.env.DB.prepare('SELECT * FROM posts WHERE slug = ? AND status = ?').bind(slug, 'published').first<{ title: string; content: string; created_at: string; tags: string }>();
  if (!post) return c.html(HTML);
  const meta = `<title>${escapeHtml(post.title)} - XinBlog</title><meta name="description" content="${escapeHtml(excerpt(post.content, 120))}">`;
  const page = HTML.replace('<title>XinBlog - AI 驱动博客</title>', meta);
  return c.html(page);
});

export default app;
