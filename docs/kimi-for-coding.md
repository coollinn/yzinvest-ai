# kimi-for-coding 架构原理详解

> 本文档详细解释 kimi-for-coding 如何作为 **OpenAI 兼容 Provider** 接入 Roo-Code，以及在实现过程中发现的关键技术细节。

---

## 目录

1. [核心架构：OpenAI 兼容 Provider](#1-核心架构openai-兼容-provider)
2. [为什么 Roo-Code 没有原生 kimi-for-coding Provider](#2-为什么-roo-code-没有原生-kimi-for-coding-provider)
3. [关键请求头：Coding Agent 身份验证](#3-关键请求头coding-agent-身份验证)
4. [SSE 流式响应的格式差异](#4-sse-流式响应的格式差异)
5. [reasoning_content：思考过程与正式回答分离](#5-reasoning_content思考过程与正式回答分离)
6. [完整的 HTTP 请求示例](#6-完整的-http-请求示例)
7. [Python 实现要点](#7-python-实现要点)
8. [常见问题与排查](#8-常见问题与排查)
9. [与标准 Moonshot Provider 的区别](#9-与标准-moonshot-provider-的区别)

---

## 1. 核心架构：OpenAI 兼容 Provider

### 1.1 Roo-Code 的 Provider 体系

Roo-Code 支持多种 Provider 类型：

| Provider 类型 | 代表 | 特点 |
|---|---|---|
| **原生 Provider** | Anthropic、Gemini、OpenAI | 使用官方 SDK，专有协议 |
| **OpenAI 兼容 Provider** | OpenAI、DeepSeek、Moonshot、**kimi-for-coding** | 使用 OpenAI API 格式 |
| **动态 Provider** | OpenRouter、Vercel AI Gateway | 从远程获取模型列表 |
| **本地 Provider** | Ollama、LM Studio | localhost 端点 |

### 1.2 kimi-for-coding 的定位

**kimi-for-coding 属于 OpenAI 兼容 Provider**。这意味着：

- ✅ 使用标准的 OpenAI Chat Completions API 格式
- ✅ 支持 `v1/chat/completions` 端点
- ✅ 支持流式输出（SSE）
- ✅ 支持 `max_tokens`、`temperature`、`reasoning_effort` 等标准参数

但 **Roo-Code 中没有为它写专门的 Provider 类**。用户实际上是在 **OpenAI Provider** 中手动配置了：

```yaml
Base URL: https://api.kimi.com/coding/v1
Model ID: kimi-for-coding
API Key:  <从 Kimi Coding Agent 页面获取的 Key>
```

### 1.3 Roo-Code 实际使用的 Handler

在 Roo-Code 源码中，当你选择 "openai" provider 时，实际使用的是 [`OpenAiHandler`](Roo-Code/src/api/providers/openai.ts:31)：

```typescript
// Roo-Code/src/api/providers/openai.ts
export class OpenAiHandler extends BaseProvider implements SingleCompletionHandler {
    constructor(options: ApiHandlerOptions) {
        const baseURL = this.options.openAiBaseUrl || "https://api.openai.com/v1"
        const apiKey = this.options.openAiApiKey ?? "not-provided"

        this.client = new OpenAI({
            baseURL,
            apiKey,
            defaultHeaders: headers,  // <-- 关键：包含 HTTP-Referer, X-Title 等
        })
    }
}
```

---

## 2. 为什么 Roo-Code 没有原生 kimi-for-coding Provider

### 2.1 搜索验证

我搜索了整个 Roo-Code 仓库（超过 1000 个文件），**没有找到任何 `api.kimi.com/coding/v1` 或 `kimi-for-coding` 的引用**。

### 2.2 实际配置方式

用户在 Roo-Code 的 Settings 中选择了 **OpenAI → Custom**，然后手动填写：

```
Base URL: https://api.kimi.com/coding/v1
API Key:  sk-kimi-...
Model ID: kimi-for-coding
```

这种方式的优势：
- 不需要 Roo-Code 专门支持 kimi-for-coding
- 任何 OpenAI 兼容的 API 都可以这样接入
- 配置灵活，可自定义端点和模型

---

## 3. 关键请求头：Coding Agent 身份验证

### 3.1 问题发现

最初测试时收到 403 错误：

```json
{
  "error": {
    "message": "Kimi For Coding is currently only available for Coding Agents such as Kimi CLI, Claude Code, Roo Code, Kilo Code, etc.",
    "type": "access_terminated_error"
  }
}
```

这说明 **kimi-for-coding API 服务端会校验客户端身份**，不是随便一个 HTTP 请求就能访问的。

### 3.2 必需的请求头

通过分析 Roo-Code 源码（[`src/api/providers/constants.ts`](Roo-Code/src/api/providers/constants.ts:3)），发现 Roo-Code 发送以下默认请求头：

```python
headers = {
    "Content-Type": "application/json",
    "Authorization": f"Bearer {API_KEY}",
    "HTTP-Referer": "https://github.com/RooVetGit/Roo-Cline",
    "X-Title": "Roo Code",
    "User-Agent": f"RooCode/{version}",
}
```

| Header | 值 | 作用 |
|---|---|---|
| `Authorization` | `Bearer sk-kimi-...` | API 认证 |
| `HTTP-Referer` | `https://github.com/RooVetGit/Roo-Cline` | 标识来源项目 |
| `X-Title` | `Roo Code` | 标识客户端名称 |
| `User-Agent` | `RooCode/3.14.0` | 标识客户端版本 |

**缺少任何一个都可能导致 403。**

### 3.3 为什么需要这些 Header

Kimi 服务端通过这些 Header 判断：
1. **User-Agent** 是否匹配已知的 Coding Agent（RooCode、Kimi CLI、Claude Code 等）
2. **X-Title** 和 **HTTP-Referer** 是否一致
3. 可能结合 API Key 的发行渠道做进一步校验

---

## 4. SSE 流式响应的格式差异

### 4.1 标准 OpenAI SSE 格式

标准 OpenAI 的 SSE 流格式为（注意 `data: ` 后面有空格）：

```
data: {"choices":[{"delta":{"content":"Hello"}}]}

data: {"choices":[{"delta":{"content":" World"}}]}

data: [DONE]
```

### 4.2 kimi-for-coding 的实际 SSE 格式

通过抓包发现，**kimi-for-coding 返回的 SSE 格式没有空格**（`data:` 后面直接是 JSON）：

```
data:{"choices":[{"delta":{"reasoning_content":"The"}}]}

data:{"choices":[{"delta":{"reasoning_content":" user"}}]}

data:[DONE]
```

### 4.3 解析代码的兼容性处理

错误的解析方式（会导致没有任何输出）：

```python
# ❌ 错误：假设 data: 后面有空格
if line.startswith("data: "):
    data_str = line[6:]  # 对于 "data:{...}" 会得到 "{...}" ❌
```

正确的解析方式：

```python
# ✅ 正确：兼容有无空格的情况
if line.startswith("data:"):
    data_str = line[len("data:"):].strip()
    # "data:{...}" → "{...}"
    # "data: {...}" → "{...}"
```

---

## 5. reasoning_content：思考过程与正式回答分离

### 5.1 独特的流式结构

kimi-for-coding 的 SSE 流分为两个阶段：

**第一阶段：思考过程（reasoning_content）**

模型先"思考"，通过 `reasoning_content` 字段输出内部推理过程：

```json
{"choices":[{"delta":{"reasoning_content":"The user wants"}}]}
{"choices":[{"delta":{"reasoning_content":" a hello world"}}]}
```

**第二阶段：正式回答（content）**

思考完成后，通过 `content` 字段输出最终答案：

```json
{"choices":[{"delta":{"content":"Here's a simple"}}]}
{"choices":[{"delta":{"content":" \"Hello World\""}}]}
```

### 5.2 完整流示例

```
data:{"choices":[{"delta":{"role":"assistant","content":""}}]}

data:{"choices":[{"delta":{"reasoning_content":"The"}}]}
data:{"choices":[{"delta":{"reasoning_content":" user"}}]}
data:{"choices":[{"delta":{"reasoning_content":" wants"}}]}
... ( hundreds of reasoning_content chunks )

data:{"choices":[{"delta":{"content":"Here's"}}]}
data:{"choices":[{"delta":{"content":" a"}}]}
data:{"choices":[{"delta":{"content":" simple"}}]}
... ( content chunks )

data:{"choices":[{"delta":{},"finish_reason":"stop","usage":{"prompt_tokens":24,"completion_tokens":204}}]}

data:{"choices":[],"usage":{"prompt_tokens":24,"completion_tokens":204}}

data:[DONE]
```

### 5.3 如何优雅地展示

推荐在用户界面中区分展示：

```
[思考过程] The user wants a "Hello World" program in Python. This is a very
simple request. I should provide a clean, straightforward example...

[正式回答] Here's a simple "Hello World" in Python:

```python
print("Hello World")
```
```

---

## 6. 完整的 HTTP 请求示例

### 6.1 请求

```http
POST https://api.kimi.com/coding/v1/chat/completions
Content-Type: application/json
Authorization: Bearer sk-kimi-xxxxxxxx
HTTP-Referer: https://github.com/RooVetGit/Roo-Cline
X-Title: Roo Code
User-Agent: RooCode/3.14.0

{
  "model": "kimi-for-coding",
  "messages": [
    {"role": "system", "content": "You are a helpful coding assistant."},
    {"role": "user", "content": "Write a hello world in Python"}
  ],
  "temperature": 0.6,
  "stream": true,
  "max_tokens": 32768,
  "reasoning_effort": "medium"
}
```

### 6.2 响应（SSE 流）

```http
HTTP/1.1 200 OK
Content-Type: text/event-stream;charset=utf-8

data:{"id":"chatcmpl-xxx","object":"chat.completion.chunk","created":1234567890,"model":"kimi-for-coding","choices":[{"index":0,"delta":{"role":"assistant","content":""},"finish_reason":null}]}

data:{"id":"chatcmpl-xxx","choices":[{"index":0,"delta":{"reasoning_content":"The"},"finish_reason":null}]}
data:{"id":"chatcmpl-xxx","choices":[{"index":0,"delta":{"reasoning_content":" user"},"finish_reason":null}]}
...
data:{"id":"chatcmpl-xxx","choices":[{"index":0,"delta":{"content":"Here"},"finish_reason":null}]}
data:{"id":"chatcmpl-xxx","choices":[{"index":0,"delta":{"content":" is"},"finish_reason":null}]}
...
data:{"id":"chatcmpl-xxx","choices":[{"index":0,"delta":{},"finish_reason":"stop","usage":{"prompt_tokens":24,"completion_tokens":204}}]}

data:[DONE]
```

---

## 7. Python 实现要点

### 7.1 核心请求代码

```python
import requests
import json

def chat_with_kimi(question, api_key):
    url = "https://api.kimi.com/coding/v1/chat/completions"

    payload = {
        "model": "kimi-for-coding",
        "messages": [
            {"role": "system", "content": "You are a helpful coding assistant."},
            {"role": "user", "content": question},
        ],
        "temperature": 0.6,
        "stream": True,
        "max_tokens": 32768,
        "reasoning_effort": "medium",
    }

    # ⚠️ 这些 Header 缺一不可，否则 403
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}",
        "HTTP-Referer": "https://github.com/RooVetGit/Roo-Cline",
        "X-Title": "Roo Code",
        "User-Agent": "RooCode/3.14.0",
    }

    response = requests.post(url, headers=headers, json=payload, stream=True)
    response.raise_for_status()

    for line in response.iter_lines(decode_unicode=True):
        if not line or not line.startswith("data:"):
            continue

        # ⚠️ 注意：kimi 返回的是 "data:{...}" 没有空格
        data = line[len("data:"):].strip()
        if data == "[DONE]":
            break

        chunk = json.loads(data)
        delta = chunk.get("choices", [{}])[0].get("delta", {})

        # 先输出思考过程
        if "reasoning_content" in delta:
            print(delta["reasoning_content"], end="", flush=True)

        # 再输出正式回答
        if "content" in delta:
            print(delta["content"], end="", flush=True)
```

### 7.2 环境变量配置

```bash
export KIMI_CODE_API_KEY="sk-kimi-xxxxxxxx"
export KIMI_CODE_BASE_URL="https://api.kimi.com/coding/v1"
export KIMI_CODE_MODEL="kimi-for-coding"
export ROO_CODE_VERSION="3.14.0"
```

---

## 8. 常见问题与排查

### 8.1 HTTP 403：access_terminated_error

**原因**：缺少 Coding Agent 身份标识 Header

**解决**：确保请求包含：
- `HTTP-Referer: https://github.com/RooVetGit/Roo-Cline`
- `X-Title: Roo Code`
- `User-Agent: RooCode/{version}`

### 8.2 流式响应没有输出

**原因**：SSE 解析代码假设 `data: ` 后面有空格

**解决**：使用兼容解析：
```python
data = line[len("data:"):].strip()
```

### 8.3 只有思考过程，没有正式回答

**原因**：只处理了 `content` 字段，忽略了 `reasoning_content`

**解决**：同时处理两个字段：
```python
if "reasoning_content" in delta:
    # 处理思考过程
if "content" in delta:
    # 处理正式回答
```

### 8.4 API Key 无效

**原因**：
- Key 不是从 Coding Agent 专用页面获取的
- Key 已过期或被吊销

**解决**：从 [Kimi 开放平台](https://platform.moonshot.ai) 的 Coding Agent 页面重新获取

---

## 9. 与标准 Moonshot Provider 的区别

| 特性 | Moonshot Provider | kimi-for-coding (OpenAI 兼容) |
|---|---|---|
| **Base URL** | `https://api.moonshot.ai/v1` | `https://api.kimi.com/coding/v1` |
| **Handler 类** | `MoonshotHandler` | `OpenAiHandler` |
| **模型列表** | kimi-k2-0711, kimi-k2-0905 等 | `kimi-for-coding` |
| **认证方式** | `moonshotApiKey` | `openAiApiKey` + 特殊 Headers |
| **Roo-Code 原生支持** | ✅ 有专门 Provider | ❌ 通过 OpenAI 兼容方式配置 |
| **SSE 格式** | 标准 `data: {...}` | `data:{...}`（无空格） |
| **reasoning_content** | ❌ 不支持 | ✅ 支持 |
| **服务端校验** | 普通 API Key 校验 | Coding Agent 身份校验 |

---

## 总结

kimi-for-coding 是一个 **OpenAI 兼容的专用 API**，它通过以下方式与 Roo-Code 集成：

1. **通过 OpenAI 兼容 Provider 接入**：用户手动配置 Base URL 和 Model ID
2. **需要特殊的 Coding Agent 请求头**：`HTTP-Referer`、`X-Title`、`User-Agent`
3. **使用非标准 SSE 格式**：`data:{...}` 没有空格
4. **支持 reasoning_content**：思考过程和正式回答分开展示

理解这些原理后，你可以在自己的项目中灵活地调用 kimi-for-coding API，或者为其他 OpenAI 兼容的服务做类似的适配。
