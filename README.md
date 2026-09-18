# XinBlog

AI 驱动的开源博客平台，运行在 Cloudflare Workers + D1 之上，免费额度内即可零成本建站。
**适用人群**：个人博主、独立开发者，以及希望在边缘网络低成本托管博客、并接入 AI 自动写作能力的用户。

## 功能特性

- 文章 CRUD（发布/草稿、标签、全文搜索、分页）
- 标签聚合与文章搜索
- RSS 2.0 与 Sitemap 输出（SEO 友好）
- AI 生成文章（接入 Ollama，可配置公开端点）
- 内置响应式前端（零构建，单 HTML）
- 管理接口使用 `x-admin-key` 保护

## 技术栈与目录结构

**技术栈**：TypeScript / Cloudflare Workers / Hono / D1 (SQLite) / Zod / Wrangler / Vitest

```
xinblog/
├── src/
│   ├── index.ts        # Worker 入口（Hono 应用）
│   ├── lib.ts          # 核心工具与数据访问
│   ├── routes/         # API 路由
│   └── components/     # 前端渲染组件
├── migrations/
│   └── 0001_init.sql   # D1 数据库初始化
├── tests/
│   └── lib.test.ts     # 单元测试
├── wrangler.toml       # Cloudflare 配置
└── package.json
```

## 快速开始

```bash
npm install
npm run db:init        # 初始化本地 D1
npm run dev            # 本地开发 http://localhost:8787
npm test               # 单元测试
npm run deploy         # 部署到 Cloudflare（需 CF 账号）
```

**环境变量（wrangler.toml / dashboard）**

| 变量 | 说明 |
|------|------|
| `OLLAMA_PUBLIC_ENDPOINT` | 可公开访问的 Ollama 网关（Workers 无法访问 localhost） |
| `ADMIN_KEY` | 管理接口密钥（请求头 `x-admin-key`） |

**部署说明**：数据层面向 Cloudflare D1，生产环境执行 `npm run deploy`（需 Cloudflare 账号并配置 `wrangler.toml` 中的 `database_id`）；本地验证以编译 + 单测为准。

## 验证状态

引用 AI Factory 全套件验证报告（[VERIFICATION.md](../../VERIFICATION.md)，2026-09-18，Windows 11 / Node v22.14.0）：

- `npm run build`（tsc --noEmit）：exit 0，编译 0 错误
- `npx vitest run`：1 个测试文件 / 7 个用例全部通过（tests/lib.test.ts）
- 修复记录：Ollama 响应 unknown 类型断言、vitest@2.1.9 重装、@cloudflare/workers-types 补装
- 说明：运行时验证受 Cloudflare workerd 本地环境限制，生产部署以 `wrangler deploy` 为准

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

MIT License，详见 [LICENSE](LICENSE)。本项目代码与文档由 AI 辅助生成，仅供参考与学习使用。

## 支持项目

如果这个项目对你有帮助，欢迎赞助支持持续开发：

[![PayPal](https://img.shields.io/badge/Donate-PayPal-00457C?style=flat-square&logo=paypal)](https://paypal.me/Junlong439)
