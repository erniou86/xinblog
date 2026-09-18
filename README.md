# XinBlog

AI 驱动的开源博客平台，运行在 Cloudflare Workers 上，数据库使用 D1（免费额度内零成本）。

## 功能
- 文章 CRUD（发布/草稿、标签、全文搜索、分页）
- 标签聚合与文章搜索
- RSS 2.0 与 Sitemap 输出（SEO 友好）
- AI 生成文章（接入 Ollama，可配置公开端点）
- 内置响应式前端（零构建，单 HTML）
- 管理接口使用 `x-admin-key` 保护

## 快速开始
```bash
npm install
npm run db:init        # 初始化本地 D1
npm run dev            # 本地开发 http://localhost:8787
npm test               # 单元测试
npm run deploy         # 部署到 Cloudflare
```

## 环境变量（wrangler.toml / dashboard）
| 变量 | 说明 |
|------|------|
| `OLLAMA_PUBLIC_ENDPOINT` | 可公开访问的 Ollama 网关（Workers 无法访问 localhost） |
| `ADMIN_KEY` | 管理接口密钥（请求头 `x-admin-key`） |

## API
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/posts?page=&tag=&q=` | 文章列表（分页/标签/搜索） |
| GET | `/api/posts/:slug` | 文章详情 |
| GET | `/api/tags` | 标签聚合 |
| POST | `/api/posts` | 新建（需管理密钥） |
| PUT | `/api/posts/:id` | 更新（需管理密钥） |
| DELETE | `/api/posts/:id` | 删除（需管理密钥） |
| POST | `/api/ai/generate` | AI 生成文章 |
| GET | `/rss.xml` / `/sitemap.xml` | SEO 输出 |

## License
MIT
