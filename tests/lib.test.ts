import { describe, it, expect } from 'vitest';
import { slugify, uniqueSlug, parseTags, paginate, escapeHtml, excerpt, markdownToHtml } from '../src/lib';

describe('slugify', () => {
  it('生成 slug', () => {
    expect(slugify('Hello World!')).toBe('hello-world');
    expect(slugify('  中文标题  ')).toBe('中文标题');
    expect(slugify('!!!')).toBe('post');
  });
});

describe('uniqueSlug', () => {
  it('自动去重', () => {
    expect(uniqueSlug('Test', ['test', 'test-2'])).toBe('test-3');
  });
});

describe('parseTags', () => {
  it('数组与字符串', () => {
    expect(parseTags([' a ', 'b', ''])).toEqual(['a', 'b']);
    expect(parseTags('x, y，z')).toEqual(['x', 'y', 'z']);
    expect(parseTags(null)).toEqual([]);
  });
});

describe('paginate', () => {
  it('分页计算', () => {
    expect(paginate(25, 1, 10)).toMatchObject({ page: 1, size: 10, totalPages: 3, offset: 0 });
    expect(paginate(25, 99, 10).page).toBe(99);
    expect(paginate(0, 1, 10).totalPages).toBe(1);
  });
});

describe('escapeHtml', () => {
  it('转义 HTML', () => {
    expect(escapeHtml('<script>"x"</script>')).toBe('&lt;script&gt;&quot;x&quot;&lt;/script&gt;');
  });
});

describe('excerpt', () => {
  it('截取摘要', () => {
    expect(excerpt('<p>hello world</p>', 5)).toBe('hello…');
  });
});

describe('markdownToHtml', () => {
  it('渲染 markdown', () => {
    expect(markdownToHtml('# Title')).toContain('<h1>Title</h1>');
    expect(markdownToHtml('**bold**')).toContain('<strong>bold</strong>');
    expect(markdownToHtml('```' + '\ncode\n' + '```')).toContain('<pre><code>');
  });
});
