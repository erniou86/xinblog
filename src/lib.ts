// XinBlog 工具函数（纯函数，可单测）
export interface Post {
  id: number;
  title: string;
  slug: string;
  content: string;
  tags: string;
  status: 'draft' | 'published';
  created_at: string;
  updated_at?: string;
}

export function slugify(title: string): string {
  return title.toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'post';
}

export function uniqueSlug(title: string, existing: string[]): string {
  const base = slugify(title);
  let slug = base;
  let n = 2;
  while (existing.includes(slug)) {
    slug = `${base}-${n}`;
    n++;
  }
  return slug;
}

export function parseTags(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map(String).map((s) => s.trim()).filter(Boolean).slice(0, 5);
  }
  if (typeof raw === 'string' && raw.trim()) {
    return raw.split(/[,，]/).map((s) => s.trim()).filter(Boolean).slice(0, 5);
  }
  return [];
}

export function paginate(total: number, page: number, size: number) {
  const safeSize = Math.min(Math.max(size, 1), 50);
  const safePage = Math.max(page, 1);
  const totalPages = Math.max(Math.ceil(total / safeSize), 1);
  return {
    page: safePage,
    size: safeSize,
    totalPages,
    offset: (safePage - 1) * safeSize,
  };
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function excerpt(html: string, max = 160): string {
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return text.length > max ? text.slice(0, max) + '…' : text;
}

export function markdownToHtml(md: string): string {
  // 极简 Markdown 渲染：标题 / 段落 / 代码块 / 列表 / 加粗 / 链接
  let html = md.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  html = html.replace(/```([\s\S]*?)```/g, (_, code) => `<pre><code>${code}</code></pre>`);
  html = html.replace(/^### (.*)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.*)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.*)$/gm, '<h1>$1</h1>');
  html = html.replace(/^\s*[-*] (.*)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>[\s\S]*?<\/li>)/g, '<ul>$1</ul>');
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2">$1</a>');
  return html.replace(/\n{2,}/g, '\n').replace(/\n/g, '<br>');
}
