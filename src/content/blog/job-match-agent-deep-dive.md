---
title: 'Agent 项目深度解析：校招岗位匹配 Agent'
description: '逐层拆解一个校招岗位匹配 Agent：从 RAG/混合检索、Tool Calling 编排、LangGraph ReAct 到 MCP 协议与部署，附真实源码。'
pubDate: '2026-08-31'
---
> 以仓库 https://github.com/tinnyxx/job-match-agent 的真实代码为准(2026-08-29 状态)。
> 所有代码片段均从项目源码逐字摘录,路径标注真实。目标:让你能从"项目是干什么的"一路讲到"Agent 是怎么运行的"。
>
> https://agent.xiaoxiaoptopfile.top（agent网页）

---

## 1. 项目全貌

### 1.1 项目解决什么问题

**一句话**:面向校招场景的「岗位雷达 + 简历匹配」助手 —— 用户用自然语言提问("深圳的 AI Agent 岗位有哪些?"),系统从岗位库中**语义检索**出真实岗位,由大模型**整理成带链接、带薪资的回答**流式返回,还能用简历要点对岗位做**0-100 匹配度评估**。

它演示的不是"调一个 API",而是一条完整的 Agent 应用链路:**RAG 检索 + Tool Calling 编排 + 流式交互 + 标准化协议(MCP)+ 可评测 + 可部署**。

### 1.2 整体技术栈

| 层 | 技术 | 版本/型号 |
|---|---|---|
| 语言/运行时 | TypeScript(ESM + strict)+ Node.js 22+ | — |
| Web 服务 | Fastify 5(+ @fastify/cors、@fastify/static) | — |
| Agent 框架 | LangChain.js 0.3(@langchain/core/openai)+ **LangGraph 0.2(prebuilt)** | — |
| 对话模型 | DeepSeek deepseek-chat(OpenAI 兼容接口) | — |
| Embedding | 硅基流动 bge-m3(1024 维,OpenAI 兼容接口) | — |
| 数据库 | PostgreSQL 17 + **pgvector**(HNSW 余弦索引) | pgvector/pgvector:pg17 镜像 |
| 协议 | SSE(text/event-stream)、**MCP**(stdio) | @modelcontextprotocol/sdk 1.30 |
| 工程化 | pnpm、tsx、vitest、GitHub Actions、Docker Compose、Nginx | — |
| 前端 | 原生 HTML/CSS/JS(单文件,零构建) | — |

### 1.3 整体架构

```mermaid
flowchart TB
    subgraph Client["客户端"]
        WEB["浏览器<br/>public/index.html<br/>(Apple 风聊天面板)"]
        MCPC["MCP 客户端<br/>Claude Desktop / Cursor"]
    end

    subgraph Edge["接入层(服务器)"]
        NG["Nginx 反代<br/>agent.xiaoxiaoptopfile.top<br/>(proxy_buffering off)"]
    end

    subgraph App["应用层(Fastify :3000)"]
        API["/api/chat (SSE)<br/>/api/health<br/>/api/sessions CRUD"]
        AGENT["Agent 编排<br/>src/agent/agent.ts<br/>LangGraph createReactAgent"]
        SESS["会话管理<br/>src/agent/sessions.ts<br/>(内存, 截断12条)"]
        MCP["MCP Server<br/>src/mcp/server.ts<br/>(stdio, 4 工具)"]
        DEG["降级模式<br/>src/agent/degraded.ts<br/>(无 LLM Key 时)"]
    end

    subgraph Core["核心能力层"]
        TC["工具核心 src/agent/toolsCore.ts<br/>search_jobs / get_job_detail<br/>match_resume_to_job(LLM-as-tool)"]
        RET["两阶段混合检索<br/>src/retrieval/hybridSearch.ts<br/>召回(向量+过滤) → 重排(0.7+0.3)"]
        EMB["Embedding 封装<br/>src/embedding/embedder.ts<br/>bge-m3 / 离线哈希"]
    end

    subgraph Data["数据层"]
        PG[("PostgreSQL + pgvector<br/>jobs 表 vector(1024)<br/>HNSW 索引")]
    end

    subgraph LLM["模型层(OpenAI 兼容 API)"]
        DS["DeepSeek(对话)"]
        SF["硅基流动 bge-m3(向量)"]
    end

    WEB -->|HTTPS| NG --> API
    API --> AGENT --> TC --> RET --> PG
    TC --> EMB --> SF
    AGENT -->|Function Calling| DS
    AGENT <--> SESS
    API --> DEG --> RET
    MCPC -->|stdio JSON-RPC| MCP --> TC
    MCP --> DS
```

### 1.4 一次请求的完整流程(以"深圳的 AI Agent 岗位有哪些?"为例)

```mermaid
sequenceDiagram
    participant U as 用户浏览器
    participant F as Fastify /api/chat
    participant A as chatStream(agent.ts)
    participant L as DeepSeek(LLM)
    participant T as search_jobs 工具
    participant R as 混合检索(hybridSearch)
    participant E as 硅基流动(embedding)
    participant D as PostgreSQL/pgvector

    U->>F: POST /api/chat {message, sessionId}
    F->>A: 校验 body,hijack 接管 socket,写 SSE 响应头
    A->>A: getOrCreateSession(sessionId),取最近 12 条历史
    A->>L: 请求1:system prompt + 历史 + 用户消息 + 3个工具签名
    L-->>A: 决策:调用 search_jobs{query:"AI Agent", city:"深圳", jobType:"校招", skills:[]}
    A->>T: 执行工具(事件:tool_start 透出)
    T->>E: 把 query 向量化(bge-m3, 1024维)
    E-->>T: 查询向量
    T->>D: 召回:向量 top-(4×5) + city/jobType/skills 过滤
    D-->>T: 20 条候选(含相似度)
    T->>T: 重排:0.7×相似度 + 0.3×关键词命中率,取 top5,格式化文本
    T-->>A: 3 条岗位文本(事件:tool_end 透出)
    A->>L: 请求2:历史 + 工具结果
    L-->>A: 逐 token 生成带链接的最终回答
    A->>U: SSE:delta(逐字)+ suggestions + done
    A->>A: recordTurn:历史写入会话,首条消息设为标题
    U->>F: 侧栏刷新:GET /api/sessions(标题/时间已更新)
```

关键点:**LLM 不直接查数据库**。模型只负责"决定调什么工具、传什么参数、怎么组织语言";数据的真实检索由我们的代码完成,结果以文本形式回传给模型 —— 这就是 Tool Calling 的本质分工。

---

## 2. 按目录讲解(带真实代码)

### 目录总览(按重要性排序)

```
job-match-agent/
├── src/                  ← 核心代码(重点)
│   ├── agent/            ← Agent 编排(面试核心)
│   ├── retrieval/        ← 混合检索 + 评测(技术核心)
│   ├── ingest/           ← 数据管道
│   ├── embedding/        ← 向量化封装
│   ├── server/           ← Fastify + SSE
│   ├── mcp/              ← MCP Server
│   ├── db/               ← 连接池 + 建表
│   ├── lib/format.ts     ← 工具函数
│   ├── config.ts         ← 环境变量校验
│   └── index.ts          ← 启动入口
├── public/               ← 前端(单文件 + markdown 渲染器)
├── scripts/              ← SQL 建表 + 5 个验证探针脚本
├── tests/                ← vitest 单测
├── deploy/               ← Nginx 配置 / Docker 安装脚本 / 镜像加速
├── docs/                 ← 工作记录 / 技术点记录 / 学习指南 / 博客
├── docker-compose.yml    ← 生产编排(db + app)
└── Dockerfile            ← 多阶段构建
```

### 2.1 根基:config.ts 与 llm.ts(一切从配置开始)

**`src/config.ts`** —— 环境变量用 zod 校验,启动即快速失败:

```ts
import "dotenv/config";
import { z } from "zod";

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1).default("postgres://postgres:postgres@localhost:5432/job_agent"),
  PORT: z.coerce.number().int().positive().default(3000),
  EMBEDDING_API_KEY: z.string().default(""),
  EMBEDDING_BASE_URL: z.string().url().default("https://api.siliconflow.cn/v1"),
  EMBEDDING_MODEL: z.string().default("BAAI/bge-m3"),
  EMBEDDING_DIMENSIONS: z.coerce.number().int().positive().default(1024),
  LLM_API_KEY: z.string().default(""),
  LLM_BASE_URL: z.string().url().default("https://api.deepseek.com/v1"),
  LLM_MODEL: z.string().default("deepseek-chat"),
  USE_HASH_EMBEDDER: z.enum(["true", "false"]).default("false").transform((v) => v === "true"),
});

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  console.error("环境变量校验失败:", JSON.stringify(parsed.error.issues, null, 2));
  process.exit(1);
}
export const config = parsed.data;
```

**`src/agent/llm.ts`** —— 全文 15 行,却是「多模型可替换」的关键:

```ts
import { ChatOpenAI } from "@langchain/openai";
import { config } from "../config.js";

export function hasLLM(): boolean {
  return config.LLM_API_KEY.length > 0;
}

export function createLlm(): ChatOpenAI {
  return new ChatOpenAI({
    apiKey: config.LLM_API_KEY,
    configuration: { baseURL: config.LLM_BASE_URL },  // DeepSeek 的 OpenAI 兼容地址
    model: config.LLM_MODEL,
    temperature: 0.2,
  });
}
```

`hasLLM()` 是后面「降级设计」的开关:没有 Key,整个系统走另一条路(见 2.5)。

### 2.2 数据层:init-db.sql 与同步管道

**`scripts/init-db.sql`** —— 一张表装下「结构化 + 向量」:

```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL,                -- 数据来源渠道
  external_id TEXT NOT NULL,           -- 渠道内唯一 ID,用于去重
  title TEXT NOT NULL,
  company TEXT NOT NULL,
  city TEXT,
  salary_min INTEGER,                  -- 月薪下限(元)
  salary_max INTEGER,                  -- 月薪上限(元)
  degree TEXT,
  experience TEXT,
  job_type TEXT NOT NULL DEFAULT '校招', -- 校招 / 实习 / 社招
  skills TEXT[] NOT NULL DEFAULT '{}', -- 标签数组,支撑结构化过滤
  description TEXT NOT NULL,           -- JD 全文,Embedding 的输入
  description_embedding vector(1024),
  url TEXT,
  posted_at DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_jobs_source_external UNIQUE (source, external_id)
);

CREATE INDEX IF NOT EXISTS idx_jobs_embedding
  ON jobs USING hnsw (description_embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS idx_jobs_job_type_city ON jobs (job_type, city);
```

**`src/ingest/sync.ts`** —— 幂等同步的两个精华片段:

片段 A:upsert + `xmax=0` 区分插入/更新 + 描述变更自动重向量化:

```sql
INSERT INTO jobs (...) VALUES ($1, ..., $14)
ON CONFLICT (source, external_id) DO UPDATE SET
  ...,
  description = EXCLUDED.description,
  updated_at = now(),
  description_embedding = CASE
    WHEN jobs.description = EXCLUDED.description THEN jobs.description_embedding  -- 没变:保留旧向量
    ELSE NULL                                                                     -- 变了:置空,触发重向量化
  END
RETURNING (xmax = 0) AS inserted
```

片段 B:批处理向量化(16 条/批,单次上限 500,断点续跑):

```ts
for (let pass = 0; pass < 100; pass++) {
  const { rows } = await query<{ id: string; description: string }>(
    `SELECT id, description FROM jobs
     WHERE description_embedding IS NULL ORDER BY created_at LIMIT $1`,
    [EMBEDDING_BATCH],
  );
  if (rows.length === 0) break;
  const vectors = await embedder.embedTexts(rows.map((r) => r.description));
  for (let i = 0; i < rows.length; i++) {
    await query(`UPDATE jobs SET description_embedding = $1::vector WHERE id = $2`,
      [toSql(vectors[i]!), rows[i]!.id]);
  }
  if ((stats.embedded += rows.length) >= EMBEDDING_PASS_LIMIT) break;
}
```

**`src/embedding/embedder.ts`** —— 双实现(真实 API + 离线哈希):

```ts
export interface Embedder {
  readonly dimensions: number;
  embedTexts(texts: string[]): Promise<number[][]>;
}

export class SiliconFlowEmbedder implements Embedder {
  private readonly inner = new OpenAIEmbeddings({
    apiKey: config.EMBEDDING_API_KEY,
    configuration: { baseURL: config.EMBEDDING_BASE_URL },
    model: config.EMBEDDING_MODEL,
    batchSize: 16,
    maxRetries: 3,
  });
  async embedTexts(texts: string[]) { return this.inner.embedDocuments(texts); }
}

// 离线/测试用:确定性哈希向量,无 Key 也能跑通全链路(无语义效果)
export class HashEmbedder implements Embedder { ... }

export function createEmbedder(): Embedder {
  return config.USE_HASH_EMBEDDER ? new HashEmbedder() : new SiliconFlowEmbedder();
}
```

### 2.3 检索层:hybridSearch.ts(技术核心,全文精读)

**召回 SQL** —— 向量 + 结构化过滤一把梭:

```sql
SELECT
  id, external_id, title, company, city, job_type,
  salary_min, salary_max, skills, url, posted_at::text AS posted_at,
  description,
  (1 - (description_embedding <=> $1::vector))::float8 AS similarity
FROM jobs
WHERE description_embedding IS NOT NULL
  AND ($2::text IS NULL OR city = $2)
  AND ($3::text IS NULL OR job_type = $3)
  AND ($4::text[] IS NULL OR skills && $4::text[])
ORDER BY description_embedding <=> $1::vector
LIMIT $5   -- topK × 4 召回倍数
```

**空数组归一化**(线上踩坑后加的防线):

```ts
export function normalizeSkillsFilter(skills: string[] | undefined): string[] | null {
  return skills && skills.length > 0 ? skills : null;
}
```

**关键词打分 + 混合打分**(纯函数,有单测):

```ts
export function scoreKeywords(hit, keywords: string[]): number {
  if (keywords.length === 0) return 0;
  let matched = 0;
  for (const raw of keywords) {
    const kw = raw.toLowerCase();
    if (hit.title.includes(kw) || hit.company.includes(kw) ||
        hit.skills.some((s) => s.includes(kw)) || hit.description.includes(kw)) matched++;
  }
  return matched / keywords.length;
}

export function blendScore(similarity, keywordScore, vectorWeight): number {
  return vectorWeight * similarity + (1 - vectorWeight) * keywordScore;
}
```

**主流程**:

```ts
export async function hybridSearch(queryText, embedder, options = {}) {
  const { filters = {}, topK = 5, vectorWeight = DEFAULT_VECTOR_WEIGHT } = options;
  const [queryVector] = await embedder.embedTexts([queryText]);

  // ① 召回:top-(topK×4) 候选
  const { rows } = await query(RECALL_SQL, [
    toSql(queryVector),
    filters.city ?? null,
    filters.jobType ?? null,
    normalizeSkillsFilter(filters.skills),
    topK * RECALL_MULTIPLIER,
  ]);

  // ② 重排:混合打分后截断
  const hits = rows.map((r) => ({
    ...,
    similarity: Number(r.similarity),
    keywordScore: scoreKeywords(r, filters.keywords ?? []),
  }));
  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, topK);
}
```

### 2.4 Agent 层:prompts / toolsCore / tools / agent / sessions / degraded

**`src/agent/prompts.ts`** —— 系统提示词就是 Agent 的"行为准则"(第 2、7 条直接驱动了线上观察到的重试与完整转述行为):

```ts
export const SYSTEM_PROMPT = `你是「职途助手」,面向 2027 届校招生的 AI 岗位匹配 Agent。

工作规则:
1. 用户想找岗位时,必须先调用 search_jobs 工具检索,严禁凭空编造岗位。
2. 检索无结果时,主动建议放宽条件(城市/岗位类型/技能),并用放宽后的条件再检索一次。
3. 用户询问某个岗位的职责细节时,调用 get_job_detail。
4. 用户提供简历要点并要求评估时,调用 match_resume_to_job,并解释评分理由。
5. 引用岗位时给出名称、公司、城市、薪资(元/月)与链接。
6. 回答使用中文,分点简洁;薪资可换算成 k 表述。
7. 工具返回的岗位必须完整、逐条转述给用户,不得省略或只挑一部分。`;

export const MatchResultSchema = z.object({
  score: z.number().int().min(0).max(100).describe("综合匹配度 0-100"),
  matched: z.array(z.string()).describe("匹配点列表"),
  gaps: z.array(z.string()).describe("差距与风险点列表"),
  advice: z.string().describe("给求职者的一句话建议"),
});
```

**`src/agent/toolsCore.ts`** —— 工具真实实现(与框架解耦,Agent 和 MCP 共用):

```ts
export const SearchJobsInputSchema = z.object({
  query: z.string().describe("岗位方向描述,如 'AI Agent 实习'"),
  city: z.string().optional().describe("城市,如 '深圳'"),
  jobType: z.enum(JOB_TYPES).optional().describe("岗位类型"),
  skills: z.array(z.string()).optional().describe("要求技能标签,如 ['TypeScript']"),
});

export async function searchJobsCore(input: SearchJobsInput): Promise<string> {
  const hits = await hybridSearch(input.query, createEmbedder(), {
    topK: 5,
    filters: { city: input.city, jobType: input.jobType, skills: input.skills },
  });
  if (hits.length === 0) {
    return "没有找到符合条件的岗位。请建议用户放宽条件(去掉城市/类型限制或换更宽泛的关键词)后重试。";
  }
  // 逐行文本而非 JSON —— 实测模型转述 JSON 会丢字段
  return hits.map((h, i) => formatHit(h, i + 1)).join("\n");
}

export async function matchJobCore(input, llm): Promise<string> {
  const row = (await query(JOB_DETAIL_SQL, [input.jobId])).rows[0];
  const structuredLlm = llm.withStructuredOutput(MatchResultSchema, {
    method: "functionCalling",   // DeepSeek 不支持 json_schema,显式走工具调用路线
  });
  const result = await structuredLlm.invoke(matchPrompt(JSON.stringify(row), input.resume));
  return JSON.stringify(result);
}
```

**`src/agent/tools.ts`** —— 把核心逻辑包成 LangChain 工具:

```ts
export function buildSearchJobTool() {
  return tool(
    async (input) => searchJobsCore(input),   // 执行函数(逻辑在 toolsCore)
    {
      name: "search_jobs",
      description: "检索岗位库。query 用自然语言描述用户想找的岗位方向…",
      schema: SearchJobsInputSchema,          // zod 参数契约 → 模型的 function 签名
    },
  );
}
```

**`src/agent/agent.ts`** —— 编排核心(全文 116 行,面试前务必精读):

```ts
export async function chatStream(req: ChatRequest, emit: (e: StreamEvent) => void): Promise<void> {
  const session = getOrCreateSession(req.sessionId || "default");
  if (req.resume) setResume(session, req.resume);

  if (!hasLLM()) {
    await degradedChatStream(req, session, emit);   // 降级分支
    return;
  }

  const llm = createLlm();
  const agent = createReactAgent({
    llm,
    tools: [buildSearchJobTool(), buildGetJobDetailTool(), buildMatchTool(llm)],
    messageModifier: SYSTEM_PROMPT,
  });

  // streamEvents v2:把 Agent 内部循环的每一步"翻译"成前端事件
  const eventStream = agent.streamEvents(
    { messages: [...session.history, new HumanMessage(req.message)] },
    { version: "v2" },
  );

  let answer = "";
  for await (const ev of eventStream) {
    if (ev.event === "on_chat_model_stream") {
      const content = ev.data?.chunk?.content;
      if (typeof content === "string" && content.length > 0) {
        answer += content;
        emit({ type: "delta", text: content });          // 逐 token
      }
    } else if (ev.event === "on_tool_start") {
      emit({ type: "tool_start", name: ev.name, args: ev.data?.input });   // 工具过程透出
    } else if (ev.event === "on_tool_end") {
      emit({ type: "tool_end", name: ev.name, outputPreview: preview });
    }
  }

  if (answer) recordTurn(session, req.message, answer);   // 写入会话历史
  emit({ type: "suggestions", questions: await generateSuggestions(llm, req.message, answer) });
  emit({ type: "done" });
}
```

**`src/agent/sessions.ts`** —— 会话记忆核心:

```ts
export function recordTurn(session, userText, assistantText): void {
  if (!session.title) session.title = userText.slice(0, 30);   // 首条消息自动命名
  session.history.push(new HumanMessage(userText), new AIMessage(assistantText));
  if (session.history.length > MAX_HISTORY) {                  // MAX_HISTORY = 12
    session.history = session.history.slice(-MAX_HISTORY);
  }
  session.updatedAt = Date.now();
}
```

### 2.5 服务层:app.ts 与降级模式

**`src/server/app.ts`** —— SSE 路由(核心):

```ts
app.post("/api/chat", async (request, reply) => {
  const parsed = ChatRequestSchema.safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ error: "参数不合法", issues: parsed.error.issues });

  reply.hijack();                        // 接管原始 socket
  reply.raw.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",           // 防 Nginx 缓冲
  });

  try {
    await chatStream(parsed.data, (event) => {
      reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);   // SSE 帧格式
    });
  } catch (err) {
    reply.raw.write(`data: ${JSON.stringify({ type: "error", message: String(err) })}\n\n`);
  } finally {
    reply.raw.end();
  }
});
```

健康检查(三层状态 + 2 秒快速失败):

```ts
app.get("/api/health", async () => {
  let db = "unreachable";
  try { await pool.query("SELECT 1"); db = "ok"; } catch { db = "unreachable"; }
  return { ok: true, llm: hasLLM() ? "agent" : "degraded",
           embedding: config.EMBEDDING_MODEL, db };
});
```

**`src/agent/degraded.ts`** —— 无 Key 降级(实测可用):

```ts
say("⚠️ 未配置 LLM API Key,当前为检索降级模式…");
const hits = await hybridSearch(req.message, createEmbedder(), { topK: 5 });
for (const [i, h] of hits.entries()) {
  say(`${i + 1}. ${h.title} | ${h.company} | ${h.city ?? "-"} | ${h.jobType} | ${formatSalary(...)}\n   ${h.url}\n`);
}
if (answer) recordTurn(session, req.message, answer);   // 降级模式同样记录历史
```

### 2.6 MCP 层:同一套工具,第二个入口

**`src/mcp/server.ts`**:

```ts
export function buildMcpServer(): McpServer {
  const server = new McpServer({ name: "job-match-agent", version: "0.1.0" });

  server.registerTool(
    "search_jobs",
    {
      description: "检索岗位库(向量 + 结构化混合检索)…",
      inputSchema: SearchJobsInputSchema.shape,      // 复用 Agent 侧同一个 zod schema
    },
    async (input) => ({ content: [{ type: "text", text: await searchJobsCore(input) }] }),
  );

  // 匹配评估依赖 LLM,未配置 Key 时不注册(按能力注册)
  if (hasLLM()) { server.registerTool("match_resume_to_job", {...}, async (input) => ...); }

  return server;
}
```

### 2.7 部署层

**`Dockerfile`**(多阶段:构建产物 + 只装 prod 依赖):

```dockerfile
FROM node:22-slim AS base
ENV COREPACK_NPM_REGISTRY=https://registry.npmmirror.com
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN pnpm install --frozen-lockfile

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

FROM base AS runner
ENV NODE_ENV=production
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN pnpm install --frozen-lockfile --prod
COPY --from=build /app/dist ./dist
COPY public ./public
COPY scripts ./scripts
COPY deploy/entrypoint.sh /entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]
```

**`deploy/nginx/agent.conf`**(SSE 三件套):

```nginx
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;

    proxy_buffering off;      # 关缓冲,否则流式变一次性
    proxy_cache off;
    proxy_read_timeout 300s;
    proxy_send_timeout 300s;
    gzip off;                 # 事件流不压缩
}
```

**`docker-compose.yml`**(健康检查依赖 + 端口 5433 映射):

```yaml
services:
  db:
    image: pgvector/pgvector:pg17
    environment:
      POSTGRES_USER: jobagent
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?请在服务器 .env 中设置}
      POSTGRES_DB: job_agent
    volumes: [pgdata:/var/lib/postgresql/data]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U jobagent -d job_agent"]
      interval: 5s
      retries: 12
    ports: ["127.0.0.1:5433:5432"]   # 5433:避开服务器已有 PG
  app:
    build: .
    depends_on:
      db: { condition: service_healthy }   # 数据库健康后才起应用
    environment:
      DATABASE_URL: postgres://jobagent:${POSTGRES_PASSWORD}@db:5432/job_agent
      EMBEDDING_API_KEY: ${EMBEDDING_API_KEY:-}
      LLM_API_KEY: ${LLM_API_KEY:-}
```

---

## 3. Agent 核心机制(逐条回答你的问题)

### 3.1 Agent 是怎么创建的?

`src/agent/agent.ts`:

```ts
const llm = createLlm();
const agent = createReactAgent({
  llm,
  tools: [buildSearchJobTool(), buildGetJobDetailTool(), buildMatchTool(llm)],
  messageModifier: SYSTEM_PROMPT,
});
```

**createReactAgent 底层帮我做了什么**(LangGraph 预构建组件):
1. 把 `messageModifier`(系统提示词)+ 传入的 messages 组装成 state;
2. 把 3 个 LangChain 工具转成模型认识的 **function 签名**(name + description + JSON Schema);
3. 内部建一张两节点的状态图:**agent 节点**(调 LLM)→ **tools 节点**(执行工具)→ 回到 agent 节点,直到 LLM 不再要求调工具;
4. 维护 `messages` 状态数组(ToolMessage 自动按 tool_call_id 挂回对应 function call)。

**Agent Loop 不是我手写的 while 循环,是框架替我循环的;我负责的是"给什么工具、什么提示词、怎么取流"。**

### 3.2 LLM 在里面负责什么?

LLM 是**决策器和表达器**,不是执行器:
- **决策**:用户消息 + 工具签名 → 判断"要不要调工具、调哪个、参数是什么"。实测案例:把"深圳的 AI Agent 岗位有哪些?"解析成 `search_jobs{query:"AI Agent", city:"深圳", jobType:"校招"}`(参数完全正确)
- **表达**:拿到工具返回的文本后,整理成带链接、薪资、建议的中文回答
- 它**看不到数据库、不会执行任何代码** —— 工具执行发生在我们的 Node 进程里

### 3.3 Tool 是怎么定义和注册的?

定义(`tools.ts`):`tool(执行函数, { name, description, schema })`。其中 `schema` 是 zod 对象,`SearchJobsInputSchema`(toolsCore.ts)每个字段的 `.describe()` 文本会进入模型的 JSON Schema —— **describe 是提示词工程的一部分**。

注册:三个工具实例作为数组传给 `createReactAgent({ tools: [...] })`,框架负责转成 function definitions 随每次请求发给模型。

### 3.4 Agent 如何决定调用 Tool?

- 模型基于**系统提示词中的规则**(SYSTEM_PROMPT 第 1-4 条)和**工具描述/参数描述**做判断;
- 它输出的是结构化的 function call(工具名 + JSON 参数),而不是自由文本;
- 框架解析该输出 → 校验参数是否符合 zod schema → 符合才执行我们的函数。

### 3.5 Tool 执行后结果如何返回给 LLM?

1. 工具函数返回**纯文本**(岗位列表逐行文本,不是 JSON —— 实测模型转述 JSON 会丢字段);
2. 框架把返回值包成 `ToolMessage`,通过 `tool_call_id` 挂回之前那条 function call;
3. 把 `[system, human, ai(含tool_call), tool(结果)]` 完整 messages 再次发给模型;
4. 模型基于结果生成最终回答;若觉得信息不够,会**再次发起工具调用**。

**线上实测的完整行为链**:工具因数据库问题失败 → 模型自动换参数重试 1 次 → 仍失败 → 转为向用户询问更多信息 + 给出放宽建议 → 最后正常生成追问。这个"重试-降级"过程全部由模型自主决策,提示词第 2 条是触发器。

### 3.6 State / Memory / RAG / Workflow / Agent Loop 有没有?

| 概念 | 有没有 | 真实情况(不包装) |
|---|---|---|
| **State** | 有,但很简单 | 两层:① LangGraph 内部 messages 状态(框架管理,单次运行生命周期);② 我们的内存 Session(history 数组,`sessions.ts`)。**没有 checkpoint 持久化 —— 服务重启历史全丢**(已知限制,写在技术笔记) |
| **Memory** | 只有短时会话记忆 | 滑动窗口(保留最近 12 条)+ 30 分钟空闲清理;会话标题自动取首条消息。**没有长期记忆**(无向量记忆库、无用户画像) |
| **RAG** | 有,形态是"检索即工具" | 标准 RAG 是"检索器自动挂在链路上",本项目是**检索做成工具,由 Agent 决定何时调用** —— 这是 Agentic RAG。岗位数据天然以条为单位,没有做文档切块(JD 就是最小单元) |
| **Workflow** | **没有** | 没有多智能体、没有多节点图工作流,只有一个 ReAct Agent 循环。面试问多智能体,明确说"当前是单 Agent;多智能体方案在研究(方案 B)" |
| **Agent Loop** | 有 | ReAct 循环:LLM 思考 → 调用工具 → 观察结果 → 再思考…由 createReactAgent 内部实现。**防死循环靠框架默认步数上限 + 提示词约束**,没有额外显式控制 |

---

## 4. 从 0 重新构建(11 步复盘,含关键代码)

> 每步按「为什么需要 → 做了什么 → 得到什么」组织。这是你面试讲"项目怎么长出来的"的脚本。

### Step 1 需求分析
- **为什么**:先定边界,避免"做一个全能 AI 助手"的失控
- **做了什么**:锁定三个核心场景 —— ① 自然语言找岗位(城市/类型/技能约束)② 岗位详情查询 ③ 简历-岗位匹配评估;明确"回答必须来自岗位库,不能编造"
- **得到**:可验证的验收标准(有检索、有引用、能流式、能评测)

### Step 2 技术选型
- **为什么**:语言和组件决定后续所有开发效率
- **做了什么**:TypeScript + LangGraph prebuilt + pgvector + OpenAI 兼容接口(DeepSeek/硅基流动)+ Fastify
- **得到**:`package.json` + `tsconfig` + 分层目录

### Step 3 LLM 接入
- **为什么**:一切 Agent 的地基,先证明"模型通"
- **做了什么**:15 行的 `llm.ts`(见 2.1)+ `scripts/check-apis.mjs` 探针立刻实测
- **得到**:LLM 工厂 + `hasLLM()` 开关(降级设计的伏笔)

### Step 4 Prompt
- **为什么**:工具用不用、怎么用,全靠提示词约束
- **做了什么**:SYSTEM_PROMPT 七条规则(见 2.4);匹配评估、追问生成两个专用提示词
- **得到**:`prompts.ts`;线上"无结果自动放宽重试"就是第 2 条驱动的

### Step 5 Tool
- **为什么**:Agent 的手,能力边界由工具决定
- **做了什么**:zod 契约(toolsCore)→ 真实逻辑 → `tool()` 包装(tools.ts)
- **得到**:三个可调用工具;匹配工具踩坑后固定 `method: "functionCalling"`

### Step 6 Agent 编排
- **为什么**:把 LLM + Prompt + Tool 组装成会循环的智能体
- **做了什么**:createReactAgent + streamEvents v2 三种事件提取(见 2.4 agent.ts)
- **得到**:能流式、能透出工具过程的主聊天流 `chatStream`

### Step 7 Memory / RAG
- **为什么**:多轮对话需要上下文;检索需要数据先入库
- **做了什么**:Memory = 内存 Session + 截断(见 2.4 sessions.ts);RAG = 管道(init-db.sql → sync.ts upsert + 批向量化 → hybridSearch 两阶段检索)
- **得到**:实测 hit@1 92.9%、hit@5 100%、MRR 0.9524

### Step 8 API
- **为什么**:把能力暴露成协议,前端和 MCP 才能接
- **做了什么**:/api/chat(SSE,hijack 手写事件流)+ /api/health(三层状态)+ /api/sessions CRUD(见 2.5)
- **得到**:`server/app.ts` + `index.ts` 入口

### Step 9 前端
- **为什么**:流式体验的最终呈现
- **做了什么**:单文件原生 JS,fetch + ReadableStream 解析 SSE:

```js
const reader = res.body.getReader();
const decoder = new TextDecoder();
let buf = "";
for (;;) {
  const { done, value } = await reader.read();
  if (done) break;
  buf += decoder.decode(value, { stream: true });
  let idx;
  while ((idx = buf.indexOf("\n\n")) >= 0) {   // 按空行分帧
    const raw = buf.slice(0, idx); buf = buf.slice(idx + 2);
    for (const line of raw.split("\n")) {
      if (!line.startsWith("data: ")) continue;
      const ev = JSON.parse(line.slice(6));    // 取出事件 JSON
      if (ev.type === "delta") bubble.innerHTML = renderMarkdown(rawText + ev.text);
      // ... tool_start/tool_end/suggestions/done/error 分别处理
    }
  }
}
```

- **得到**:`public/index.html` + `public/markdown.js`(先转义再放行白名单标签,防 XSS)

### Step 10 测试
- **为什么**:Agent 输出不稳定,必须把"确定的部分"钉死
- **做了什么**:vitest 纯函数单测 + 5 个探针脚本 + 14 条标注评测集

```ts
// tests/hybridSearch.test.ts 示例
describe("normalizeSkillsFilter", () => {
  it("空数组视为不启用过滤(LLM 常传 skills: [])", () => {
    expect(normalizeSkillsFilter([])).toBeNull();
  });
});
```

- **得到**:CI 可跑的回归网 + 写进简历的评测数字

### Step 11 部署
- **为什么**:从"本地能跑"到"线上能用"
- **做了什么**:Docker 多阶段 + Compose(见 2.7)+ Nginx SSE 三件套 + HTTPS + 镜像加速 + 优雅关闭 + GitHub Actions
- **得到**:https://agent.xiaoxiaoptopfile.top 线上运行

---

## 5. 知识点分层清单

### 🔴 必须掌握(面试一定要能讲)

**1. RAG 与 Agentic RAG**
- 是什么:检索增强生成;本项目把检索做成工具,由 Agent 决定何时检索
- 为什么用:岗位数据模型不知道,且要求回答可溯源、不编造
- 项目哪里:`searchJobsCore → hybridSearch`(2.4、2.3)
- 面试问法:"你的 RAG 和普通 RAG 有什么区别?"→ 答:固定链路 vs Agent 决策;灵活性换来的代价是行为不完全可控,靠提示词 + 评测兜底

**2. Embedding 与向量检索**
- 是什么:文本 → 1024 维向量;语义相近向量相近
- 为什么用:bge-m3 中文好、便宜、OpenAI 兼容
- 项目哪里:`embedder.ts`、`<=>` 余弦距离、HNSW 索引(2.2、2.3)
- 面试问法:"为什么用余弦相似度?HNSW 和 IVFFlat?"→ 余弦对长度不敏感;HNSW 图结构查询快、增量友好,IVFFlat 需预训练

**3. Tool Calling 与 zod Schema**
- 是什么:模型输出结构化"工具调用意图",应用执行后回传结果
- 为什么用:让模型接入真实数据,参数必须可校验
- 项目哪里:`SearchJobsInputSchema` + `tool()`(2.4)
- 面试问法:"LLM 传非法参数怎么办?"→ zod 校验拦截;但"合法却有害"的参数(空数组)要业务层归一化(`normalizeSkillsFilter`)

**4. ReAct 循环与 LangGraph**
- 是什么:思考-行动-观察循环;createReactAgent 是预构建实现
- 为什么用:不重复造轮子;ToolMessage 回挂、状态管理、流式事件框架都处理了
- 项目哪里:`agent.ts` 的 createReactAgent + streamEvents v2(2.4)
- 面试问法:"Agent 为什么会停?怎么防死循环?"→ 模型不再输出 tool_call 就停;框架步数上限 + 提示词约束

**5. SSE 流式输出**
- 是什么:单向长连接,`data: {...}\n\n` 事件流
- 为什么用:逐 token 出字,体验远好于等完整回答
- 项目哪里:hijack 手写事件(app.ts)、前端 ReadableStream 分帧(index.html)、Nginx 三件套(2.5、2.7)
- 面试问法:"SSE 和 WebSocket 区别?Nginx 不配会怎样?"→ 单向 vs 双向;不关 buffering 流式变一次性

**6. 混合检索(召回-重排)**
- 是什么:向量粗筛 + 结构化过滤召回,关键词加权重排
- 为什么用:纯向量漏同义不同词,纯关键词漏语义相关
- 项目哪里:RECALL_SQL + blendScore(0.7/0.3)(2.3)
- 面试问法:"权重怎么定的?关键词为什么只影响排序?"→ 经验初值 + 评测回归;过滤太狠会误杀语义近但用词不同的岗位

**7. 评测(hit@k / MRR)**
- 是什么:检索排序质量指标
- 为什么用:Agent 效果必须可量化
- 项目哪里:evalSet.ts 14 条 + eval.ts;实测 hit@1 92.9%
- 面试问法:"评测集怎么建?一题多答案?"→ 期望用集合,任一命中即算对

**8. 结构化输出**
- 是什么:让模型输出可编程解析的 JSON(评分/差距/建议)
- 为什么用:匹配结果要进 UI、要可校验
- 项目哪里:matchJobCore 的 `withStructuredOutput(..., { method: "functionCalling" })`(2.4)
- 面试问法:"DeepSeek 为什么 400?"→ 不支持 json_schema response_format,改 function calling 路线

**9. 多轮会话与上下文管理**
- 是什么:会话状态保持与截断策略
- 为什么用:追问依赖上文;无限历史撑爆 token
- 项目哪里:`recordTurn` 截断 12 条(2.4)
- 面试问法:"上下文超长怎么办?"→ 滑动窗口(当前)/摘要压缩/长期记忆(未做,如实说)

**10. MCP**
- 是什么:客户端-工具标准协议,工具跨客户端复用
- 为什么用:同一套工具给 Claude Desktop/Cursor 用,不重写
- 项目哪里:mcp/server.ts 复用 toolsCore(2.6)
- 面试问法:"MCP 和 Function Calling 什么关系?"→ 客户端-工具协议 vs 模型-工具交互,两个层面

### 🟡 应该理解(知道原理和用途)
OpenAI 兼容接口(baseURL 复用)→ llm.ts;upsert 幂等 + xmax=0 → sync.ts;批量 embedding 限流(16/批、500 上限)→ sync.ts;降级设计(无 Key 直答、三层健康检查)→ degraded.ts/app.ts;优雅关闭(onClose→pool.end)→ app.ts;Docker 多阶段与 healthcheck 依赖 → Dockerfile/compose;会话 CRUD 设计 → app.ts;安全 Markdown 渲染(转义+白名单)→ markdown.js;内存会话 vs Redis → sessions.ts;Nginx SSE 三件套 → agent.conf

### 🟢 了解即可
LangGraph 状态图/checkpoint 机制(只用 prebuilt);pgvector HNSW 参数(m/ef_construction);zod v3/v4 API 差异;pnpm 11 allowBuilds;langchain 聚合包 0.3.37 根入口缺失;Fastify 插件体系与 inject 测试;MCP Streamable HTTP(未用)
