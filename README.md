# StockNews AI Notes

![Next.js](https://img.shields.io/badge/Next.js-15-black?style=for-the-badge&logo=next.js)
![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react)
![Tailwind](https://img.shields.io/badge/TailwindCSS-4-06B6D4?style=for-the-badge&logo=tailwindcss)
![Supabase](https://img.shields.io/badge/Supabase-Auth-3ECF8E?style=for-the-badge&logo=supabase)
![Prisma](https://img.shields.io/badge/Prisma-ORM-2D3748?style=for-the-badge&logo=prisma)
![AkShare](https://img.shields.io/badge/AkShare-Python-3776AB?style=for-the-badge&logo=python)
![DeepSeek](https://img.shields.io/badge/DeepSeek-LLM-0F172A?style=for-the-badge)

一个面向 A 股研究场景的 AI 笔记应用：左侧看行情与概览，中间看资讯，右侧写笔记并基于当前笔记上下文向 DeepSeek 提问。

## 项目截图

<img src="./public/StockNews.jpg" alt="stocknews" width="600" />

<img src="./public/askAI.jpg" alt="askAI" width="600" />

<img src="./public/aiAnswer.jpg" alt="aiAnswer" width="600" />


## 当前功能

### 1) 股票信息面板

- 支持输入 6 位 A 股代码（示例：`600519`）
- 展示收盘走势折线/面积图（默认 `daily` + 最近 90 条）
- 展示股票概览信息：最新收盘、涨跌幅、PE(TTM)、PB、总市值、行业、上市日期
- 后端数据源为 AkShare（通过 Python 网关调用）

### 2) 东方财富资讯流

- 内置 `stock_info_global_em` 资讯流
- 支持刷新最新资讯
- 卡片展示标题、摘要、发布时间，并可跳转原文链接

### 3) AI 笔记问答（DeepSeek）

- 基于“当前选中笔记”作为上下文进行问答
- 保留多轮对话上下文（问题+回答）
- 返回 Markdown 结构化分析内容（结论、逻辑、证据、风险、跟踪清单）
- 当 AI 服务异常时，自动回退本地摘要回复，避免界面空白

### 4) 笔记系统

- Supabase 登录/注册/登出
- 自动创建与自动定位笔记：进入首页时会跳转到最新笔记；无笔记时自动创建
- 文本编辑 500ms 防抖自动保存
- 侧边栏支持 Fuse.js 模糊搜索笔记
- 支持新建、删除、切换笔记

## 技术架构

- 前端：Next.js 15 App Router + React 19 + Tailwind CSS 4 + shadcn/ui + Recharts
- 认证：Supabase SSR（`@supabase/ssr`）
- 数据库：PostgreSQL + Prisma
- AI：DeepSeek（通过 OpenAI SDK 兼容接口调用）
- 行情/资讯：Next.js API Route -> Python 子进程 -> AkShare

核心链路如下：

1. 页面请求内部 API（如 `/api/stock-price`）
2. API 路由调用 `src/lib/akshareRunner.ts`
3. Runner 启动 `Akshare/stock_data_service.py`
4. Python 脚本从 AkShare 拉取数据并以 JSON 返回
5. 前端组件渲染图表、资讯和概览

## 目录说明（精简）

```text
src/
   app/
      api/
         stock-price/
         stock-overview/
         stock-news/
         create-new-note/
         fetch-newest-note/
   actions/
      notes.ts
      users.ts
   auth/
      server.ts
   components/
      stockChart.tsx
      stockOverview.tsx
      stockNews.tsx
      NoteTextInput.tsx
      AskAIButton.tsx
   db/
      schema.prisma
   deepSeek/
      index.ts
   lib/
      akshareRunner.ts
Akshare/
   stock_data_service.py
   stock_info_probe.py
```

## 环境要求

- Node.js 18.18+（建议 20+）
- pnpm（项目包含 `pnpm-lock.yaml`）
- Python 3.10+（需安装 `akshare`、`pandas`）
- PostgreSQL（或 Supabase 提供的 Postgres）

## 快速开始

### 1) 安装依赖

```bash
pnpm install
```

### 2) 准备 Python 环境（AkShare）

```bash
# 示例：venv
python3 -m venv .venv
source .venv/bin/activate
pip install -U pip
pip install akshare pandas
```

如果你使用 Conda，也可以设置对应解释器路径到环境变量 `AKSHARE_PYTHON_EXECUTABLE`。

### 3) 创建环境变量

在项目根目录新建 `.env.local`，参考以下配置：

```bash
# Prisma / PostgreSQL
DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"

# Supabase（本地或云端）
SUPABASE_URL="http://127.0.0.1:54321"
SUPABASE_ANON_KEY="your_anon_key"

# DeepSeek
DEEPSEEK_API_KEY="your_deepseek_api_key"

# 可选：DeepSeek 兼容接口地址（默认 https://api.deepseek.com）
DEEPSEEK_API_URL="https://api.deepseek.com"
# 或者使用 NEXT_PUBLIC_DEEPSEEK_API_URL

# 可选：显式指定 Python 解释器
AKSHARE_PYTHON_EXECUTABLE="/absolute/path/to/python"
# 或使用 PYTHON_EXECUTABLE

# 可选：业务基础地址（部分本地流程会用到）
NEXT_PUBLIC_BASE_URL="http://localhost:3000"
```

### 4) 初始化数据库

```bash
pnpm run prisma:generate
pnpm run prisma:migrate
```

### 5) 启动开发服务

```bash
pnpm dev
```

打开 `http://localhost:3000`。

## 可用脚本

```bash
pnpm dev              # 开发模式（Turbopack）
pnpm build            # 构建
pnpm start            # 生产启动
pnpm lint             # 代码检查

pnpm prisma:generate  # 生成 Prisma Client（固定 prisma@6.6.0）
pnpm prisma:migrate   # 执行迁移（读取 .env.local）
pnpm prisma:studio    # 打开 Prisma Studio
pnpm migrate          # generate + migrate
```

## API 概览

### 行情与资讯

- `GET /api/stock-price?symbol=600519&interval=daily&timePeriod=90`
   - 返回价格序列（OHLCV）
- `GET /api/stock-overview?symbol=600519`
   - 返回股票概览信息
- `GET /api/stock-news?limit=20`
   - 返回东方财富资讯流

### 笔记辅助接口（内部）

- `POST /api/create-new-note?userId=<id>`
- `GET /api/fetch-newest-note?userId=<id>`

## 常见问题

### 1) AkShare 数据偶发失败或超时

项目已经在 Node Runner 与 Python 网关两层实现了短重试与退避。
如果仍失败，请优先检查：

- 网络连通性（尤其是海外网络环境）
- 本机 Python 环境是否已安装 `akshare` 和 `pandas`
- 是否将正确解释器写入 `AKSHARE_PYTHON_EXECUTABLE`

### 2) `prisma` 迁移报版本问题

本项目脚本固定使用 `prisma@6.6.0`，请直接用 `pnpm run prisma:*`，不要手动执行未锁版本的 `pnpm dlx prisma`。

### 3) 未登录用户访问首页行为

中间件对匿名会话做了兼容处理；登录后会自动跳转到用户最新笔记或自动创建首条笔记。

## 说明

- 本项目用于学习与研究交流，不构成任何投资建议。
- 市场数据与资讯来自第三方服务（AkShare/东方财富等），请以官方数据源为准。
