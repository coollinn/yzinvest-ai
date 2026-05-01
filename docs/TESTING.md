# 测试策略

> 最后更新：2026.05.01
> 本项目当前测试覆盖率较低（v2 重构期优先功能落地）。本文档既是 **现状说明**，也是 **后续要补的清单**。

---

## 1. 测试金字塔（理想态）

```
       ┌─────────┐
       │   E2E   │  ← Playwright，5~10 条关键流程，CI 跑
       └─────────┘
      ┌───────────┐
      │integration│  ← API 层 + 真实 D1 (本地)，覆盖路由 + 业务
      └───────────┘
    ┌───────────────┐
    │     unit       │  ← Vitest，纯函数 / composable / 工具
    └───────────────┘
```

### 现阶段重点

| 层 | 状态 | 优先级 |
|----|------|--------|
| 单元测试 | ❌ 几乎没有 | 🔴 高 |
| 集成测试 | ❌ 没有 | 🟡 中 |
| E2E | ❌ 没有 | 🟡 中 |
| 类型检查 | ✅ `pnpm typecheck` 已接 CI | 🟢 维持 |
| Lint | ⚠️ 没接 ESLint，靠 TS 类型挡 | 🟡 中 |

---

## 2. 单元测试（Vitest）

### 2.1 安装与配置

未来需要时执行：

```bash
# 给两个 workspace 都装
pnpm --filter @yzinvest/api add -D vitest @vitest/coverage-v8
pnpm --filter @yzinvest/web add -D vitest @vue/test-utils @vitest/coverage-v8 jsdom
```

`apps/web/vitest.config.ts`：

```ts
import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'jsdom',
    globals: true,
    coverage: { reporter: ['text', 'html'] },
  },
});
```

`package.json` 加 script：

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage"
  }
}
```

### 2.2 必测的纯函数（优先级 🔴）

| 文件 | 函数 | 边界 case |
|------|------|-----------|
| `apps/web/src/lib/finance.ts` | `calculateDCF` | growthRate=0、discountRate≤terminalGrowth 应抛错 |
| `apps/web/src/lib/finance.ts` | `calculateCAPM` | β=0 / β=1 / 市场回报为负 |
| `apps/web/src/lib/utils.ts` | `formatNumber` | 大数字（亿/万）、负数、null |
| `apps/web/src/lib/utils.ts` | `formatPercent` | 已是百分点（不重复 *100）、null |
| `apps/web/src/lib/utils.ts` | `colorByChange` | 0 应返回中性色 |
| `apps/api/src/services/eastmoney.ts` | `tsCodeToSecid` | 各板块代码段；非法输入抛错 |
| `apps/api/src/lib/jwt.ts` | sign/verify roundtrip | 过期 token 应失败 |
| `apps/api/src/lib/password.ts` | hash/compare | 空字符串、过长字符串 |

### 2.3 示例（DCF）

`apps/web/src/lib/finance.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { calculateDCF } from './finance';

describe('calculateDCF', () => {
  it('returns positive intrinsic value for normal inputs', () => {
    const v = calculateDCF({
      freeCashFlow: 1000,
      growthRate: 10,
      discountRate: 8,
      terminalGrowth: 3,
    });
    expect(v).toBeGreaterThan(0);
  });

  it('throws when discount <= terminal growth', () => {
    expect(() =>
      calculateDCF({ freeCashFlow: 1000, growthRate: 5, discountRate: 3, terminalGrowth: 3 })
    ).toThrow();
  });
});
```

### 2.4 Vue 组件单测（次要）

只对纯展示组件值得做，业务组件优先用 E2E 覆盖。

```ts
import { mount } from '@vue/test-utils';
import StockPriceLabel from './StockPriceLabel.vue';

it('renders red for positive change', () => {
  const w = mount(StockPriceLabel, { props: { value: 1.5 } });
  expect(w.classes()).toContain('text-up');
});
```

---

## 3. 集成测试（API + 真实 D1）

### 3.1 思路

- 用 `wrangler dev --local` + 临时 D1 文件
- 测试前 reset → 跑 migrations → 调路由 → 断言
- **不 mock 数据库**（否则验不出 SQL 错误）

### 3.2 工具栈

```bash
pnpm --filter @yzinvest/api add -D vitest miniflare @cloudflare/workers-types
```

`apps/api/test/setup.ts`：

```ts
import { Miniflare } from 'miniflare';
import fs from 'node:fs';

export async function createTestEnv() {
  const mf = new Miniflare({
    modules: true,
    scriptPath: 'src/index.ts',
    d1Databases: { DB: ':memory:' },
    kvNamespaces: ['KV'],
  });
  // apply migrations
  const migrations = fs.readdirSync('./drizzle/migrations').sort();
  const db = await mf.getD1Database('DB');
  for (const f of migrations) {
    if (!f.endsWith('.sql')) continue;
    const sql = fs.readFileSync(`./drizzle/migrations/${f}`, 'utf-8');
    await db.exec(sql);
  }
  return mf;
}
```

### 3.3 一个示例

```ts
import { describe, it, expect, beforeAll } from 'vitest';
import { createTestEnv } from './setup';

let mf: Miniflare;
beforeAll(async () => { mf = await createTestEnv(); });

it('register → login → me', async () => {
  // register
  const r1 = await mf.dispatchFetch('http://localhost/api/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'alice', email: 'a@b.com', password: 'test1234' }),
  });
  expect(r1.status).toBe(201);
  const { access_token } = await r1.json();

  // me
  const r2 = await mf.dispatchFetch('http://localhost/api/auth/me', {
    headers: { authorization: `Bearer ${access_token}` },
  });
  expect(r2.status).toBe(200);
  const { username } = await r2.json();
  expect(username).toBe('alice');
});
```

---

## 4. E2E 测试（Playwright）

### 4.1 关键流程清单

| # | 流程 | 优先级 |
|---|------|--------|
| 1 | 注册 → 登录 → 看 dashboard | 🔴 |
| 2 | 搜索股票 → 进详情 → 看 K 线 | 🔴 |
| 3 | 加收藏 → 收藏页可见 | 🟡 |
| 4 | 写笔记 → 笔记页可见 → 编辑 | 🟡 |
| 5 | DCF 估值 → 卡片显示结果 | 🟡 |
| 6 | 暗色模式切换 → 不塌陷 | 🟢 |
| 7 | Cmd+K 搜索 → 跳转 | 🟢 |

### 4.2 安装

```bash
pnpm add -DwR -F root @playwright/test
pnpm exec playwright install --with-deps chromium
```

`playwright.config.ts`：

```ts
import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: 'e2e',
  use: { baseURL: process.env.E2E_BASE || 'https://yzinvest-ai.pages.dev' },
  retries: process.env.CI ? 2 : 0,
});
```

### 4.3 示例

```ts
// e2e/auth.spec.ts
import { test, expect } from '@playwright/test';

test('register and login', async ({ page }) => {
  await page.goto('/register');
  await page.fill('input[name=username]', `u${Date.now()}`);
  await page.fill('input[name=email]', `${Date.now()}@test.io`);
  await page.fill('input[name=password]', 'test1234');
  await page.click('button[type=submit]');
  await expect(page).toHaveURL(/\/$/);
});
```

### 4.4 在 CI 跑

```yaml
# .github/workflows/e2e.yml（计划中）
on:
  pull_request:
  schedule: [{ cron: '0 4 * * *' }]   # 每日凌晨自检线上
jobs:
  e2e:
    runs-on: ubuntu-22.04
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
      - run: pnpm install --frozen-lockfile
      - run: pnpm exec playwright install --with-deps chromium
      - run: pnpm exec playwright test
        env:
          E2E_BASE: https://yzinvest-ai.pages.dev
```

---

## 5. 类型检查（已接入）

```bash
pnpm typecheck                    # 全 workspace
pnpm --filter @yzinvest/api typecheck
pnpm --filter @yzinvest/web typecheck
```

CI 配置在 `.github/workflows/deploy-*.yml` 的 build 步骤里。**typecheck 失败 = 部署失败**。

---

## 6. 手动测试 Checklist（PR 必跑）

PR 合并前，自己点一遍：

- [ ] 注册新账号能成功
- [ ] 登录后访问 `/`、`/stocks`、`/favorites`、`/notes` 不白屏
- [ ] 改完 schema 跑过 `pnpm db:migrate:local`，本地 wrangler dev 不报错
- [ ] 改了 API 端点，前端调用点也同步
- [ ] DevTools Console 没有 error 红字
- [ ] Network 面板里 `/api/*` 都是 200，401/500 要追根因
- [ ] 暗色 / 浅色模式都看一眼，没塌陷

---

## 7. 数据完整性 / 业务校验

> 数据脚本本身要有 sanity check。

`scripts/manage.sh` 已有：

```bash
./scripts/manage.sh db-status     # 数据量校验
./scripts/manage.sh validate      # 抽样字段校验（计划中）
```

后续应增加：
- 涨跌幅在 ±20% 内（异常停牌 ±10% 除外）
- `vol > 0 ∧ amount > 0` 一致性
- ts_code 格式正则匹配
- close > 0（停牌例外）

---

## 8. 性能 / 负载测试

详见 [PERFORMANCE.md](./PERFORMANCE.md)。

### 8.1 简易压测

```bash
# autocannon 单端点压测
npx autocannon -c 50 -d 30 https://yzinvest-ai.pages.dev/api/stocks?limit=20
```

CF Workers 免费版限速：每分钟 ~100k 次，单 Worker isolate ~30s CPU 上限，对小流量足够。

---

## 9. 已知测试空白（开 issue 跟踪）

- [ ] DCF/CAPM 公式无单测（金融逻辑必须测）
- [ ] Auth 路由无集成测试（密码哈希 + JWT）
- [ ] 东方财富 fetch 无 fixture（应当 mock 一份 JSON 响应做回归）
- [ ] 前端组件零覆盖
- [ ] 没有任何 E2E
- [ ] 数据脚本无 dry-run 单测

---

## 10. 测试理念

> "Test the contract, not the implementation."

- 优先测 **公开行为**（API 响应、组件渲染结果），别测私有方法
- 优先测 **金融计算 + 数据完整性**（出错代价最高）
- 优先测 **跨模块边界**（前后端契约、数据库 schema）
- 不追求 100% 覆盖，追求 **关键路径 100%**
