<script setup lang="ts">
import { useQuery } from "@tanstack/vue-query";
import { ref, computed } from "vue";
import Button from "@/components/ui/Button.vue";
import Card from "@/components/ui/Card.vue";
import CardContent from "@/components/ui/CardContent.vue";
import CardHeader from "@/components/ui/CardHeader.vue";
import CardTitle from "@/components/ui/CardTitle.vue";
import Input from "@/components/ui/Input.vue";
import Badge from "@/components/ui/Badge.vue";
import Skeleton from "@/components/ui/Skeleton.vue";
import { apiGet, apiPost, apiDelete } from "@/lib/api";

const activeTab = ref<
  "dashboard" | "users" | "notes" | "favorites" | "stocks" | "daily"
>("dashboard");

// Dashboard
const { data: dash, refetch: refetchDash } = useQuery({
  queryKey: ["admin-dashboard"],
  queryFn: () =>
    apiGet<{
      user_stats: { total_users: number; total_notes: number; total_favorites: number };
      system_stats: { total_stocks: number; total_predictions: number; total_reports: number };
    }>("/admin/dashboard"),
});

// Sync states
const syncing = ref(false);
const syncMsg = ref("");

async function syncStocks() {
  syncing.value = true;
  syncMsg.value = "";
  try {
    const r = await apiPost<{ message: string; stocks_upserted: number }>("/admin/sync/stocks?syncDaily=true");
    syncMsg.value = r.message + ` (${r.stocks_upserted} stocks)`;
    await refetchDash();
  } catch (e: any) {
    syncMsg.value = e.message || "Sync failed";
  } finally {
    syncing.value = false;
  }
}

async function syncAllStocks() {
  syncing.value = true;
  syncMsg.value = "";
  try {
    const r = await apiPost<{ message: string; stocks_processed: number }>("/admin/sync/stocks/all?maxPages=5");
    syncMsg.value = r.message + ` (${r.stocks_processed} stocks)`;
    await refetchDash();
  } catch (e: any) {
    syncMsg.value = e.message || "Sync failed";
  } finally {
    syncing.value = false;
  }
}

// Users
const userSearch = ref("");
const userPage = ref(1);
const { data: usersData, refetch: refetchUsers } = useQuery({
  queryKey: ["admin-users", () => userSearch.value, () => userPage.value],
  queryFn: () =>
    apiGet<{
      items: Array<{
        id: number;
        username: string;
        email: string;
        full_name: string | null;
        role: string;
        created_at: string;
      }>;
      pagination: { total_items: number; total_pages: number };
    }>(`/admin/users?q=${encodeURIComponent(userSearch.value)}&page=${userPage.value}&limit=20`),
  enabled: () => activeTab.value === "users",
});

const editingUser = ref<number | null>(null);
const editUserRole = ref("");

async function updateUserRole(id: number) {
  try {
    await apiPost(`/admin/users/${id}`, { role: editUserRole.value });
    editingUser.value = null;
    await refetchUsers();
  } catch (e: any) {
    alert(e.message || "Update failed");
  }
}

async function deleteUser(id: number) {
  if (!confirm(`确认删除用户 #${id}？`)) return;
  try {
    await apiDelete(`/admin/users/${id}`);
    await refetchUsers();
    await refetchDash();
  } catch (e: any) {
    alert(e.message || "Delete failed");
  }
}

async function resetUserPassword(id: number) {
  const pw = prompt("输入新密码（至少6位）：");
  if (!pw || pw.length < 6) return;
  try {
    await apiPost(`/admin/users/${id}/reset-password`, { new_password: pw });
    alert("密码重置成功");
  } catch (e: any) {
    alert(e.message || "Reset failed");
  }
}

// Notes
const noteSearch = ref("");
const notePage = ref(1);
const { data: notesData, refetch: refetchNotes } = useQuery({
  queryKey: ["admin-notes", () => noteSearch.value, () => notePage.value],
  queryFn: () =>
    apiGet<{
      items: Array<{
        id: number;
        user_id: number;
        ts_code: string;
        content: string;
        username?: string;
        created_at: string;
      }>;
      pagination: { total_items: number; total_pages: number };
    }>(`/admin/notes?q=${encodeURIComponent(noteSearch.value)}&page=${notePage.value}&limit=20`),
  enabled: () => activeTab.value === "notes",
});

async function deleteNote(id: number) {
  if (!confirm(`确认删除笔记 #${id}？`)) return;
  try {
    await apiDelete(`/admin/notes/${id}`);
    await refetchNotes();
    await refetchDash();
  } catch (e: any) {
    alert(e.message || "Delete failed");
  }
}

// Favorites
const favPage = ref(1);
const { data: favData, refetch: refetchFav } = useQuery({
  queryKey: ["admin-favorites", () => favPage.value],
  queryFn: () =>
    apiGet<{
      items: Array<{
        id: number;
        user_id: number;
        ts_code: string;
        username?: string;
        created_at: string;
      }>;
      pagination: { total_items: number; total_pages: number };
    }>(`/admin/favorites?page=${favPage.value}&limit=20`),
  enabled: () => activeTab.value === "favorites",
});

async function deleteFavorite(id: number) {
  if (!confirm(`确认删除收藏 #${id}？`)) return;
  try {
    await apiDelete(`/admin/favorites/${id}`);
    await refetchFav();
    await refetchDash();
  } catch (e: any) {
    alert(e.message || "Delete failed");
  }
}

// Stocks
const stockSearch = ref("");
const stockPage = ref(1);
const { data: stocksData, refetch: refetchStocks } = useQuery({
  queryKey: ["admin-stocks", () => stockSearch.value, () => stockPage.value],
  queryFn: () =>
    apiGet<{
      items: Array<{
        id: number;
        ts_code: string;
        name: string;
        symbol: string;
        industry: string | null;
        market: string | null;
      }>;
      pagination: { total_items: number; total_pages: number };
    }>(`/admin/db/stocks?q=${encodeURIComponent(stockSearch.value)}&page=${stockPage.value}&limit=20`),
  enabled: () => activeTab.value === "stocks",
});

async function deleteStock(id: number) {
  if (!confirm(`确认删除股票 #${id}？`)) return;
  try {
    await apiDelete(`/admin/db/stocks/${id}`);
    await refetchStocks();
    await refetchDash();
  } catch (e: any) {
    alert(e.message || "Delete failed");
  }
}

// Daily
const dailyTsCode = ref("");
const dailyPage = ref(1);
const { data: dailyData, refetch: refetchDaily } = useQuery({
  queryKey: ["admin-daily", () => dailyTsCode.value, () => dailyPage.value],
  queryFn: () =>
    apiGet<{
      items: Array<{
        ts_code: string;
        trade_date: string;
        close: number;
        open: number;
        high: number;
        low: number;
        vol: number;
      }>;
      pagination: { total_items: number; total_pages: number };
    }>(`/admin/db/daily?ts_code=${encodeURIComponent(dailyTsCode.value)}&page=${dailyPage.value}&limit=20`),
  enabled: () => activeTab.value === "daily",
});

async function deleteDaily(ts_code: string, trade_date: string) {
  if (!confirm(`确认删除 ${ts_code} ${trade_date} 的日线数据？`)) return;
  try {
    await apiDelete(`/admin/db/daily/${encodeURIComponent(ts_code)}/${encodeURIComponent(trade_date)}`);
    await refetchDaily();
  } catch (e: any) {
    alert(e.message || "Delete failed");
  }
}

async function syncKline() {
  const code = prompt("输入股票代码（如 300394.SZ）：");
  if (!code) return;
  const days = prompt("同步天数（默认365）：") || "365";
  syncing.value = true;
  try {
    const r = await apiPost<{ fetched: number }>(`/admin/sync/kline?ts_code=${code}&days=${days}`);
    syncMsg.value = `${code} 同步完成：${r.fetched} 条`;
  } catch (e: any) {
    syncMsg.value = e.message || "Sync failed";
  } finally {
    syncing.value = false;
  }
}

async function refreshQuotes() {
  syncing.value = true;
  try {
    const r = await apiPost<{ updated: number; total: number }>("/admin/refresh/quotes");
    syncMsg.value = `行情刷新完成：${r.updated}/${r.total}`;
  } catch (e: any) {
    syncMsg.value = e.message || "Refresh failed";
  } finally {
    syncing.value = false;
  }
}

const tabs = [
  { key: "dashboard" as const, label: "仪表盘" },
  { key: "users" as const, label: "用户" },
  { key: "notes" as const, label: "笔记" },
  { key: "favorites" as const, label: "收藏" },
  { key: "stocks" as const, label: "股票" },
  { key: "daily" as const, label: "日K线" },
];
</script>

<template>
  <section class="space-y-4">
    <header class="flex items-center gap-4">
      <h1 class="text-2xl font-bold tracking-tight">管理后台</h1>
    </header>

    <!-- Tab 导航 -->
    <div class="flex flex-wrap gap-1">
      <Button
        v-for="t in tabs"
        :key="t.key"
        size="sm"
        :variant="activeTab === t.key ? 'default' : 'outline'"
        @click="activeTab = t.key"
      >
        {{ t.label }}
      </Button>
    </div>

    <!-- ===== 仪表盘 ===== -->
    <template v-if="activeTab === 'dashboard'">
      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader class="pb-2">
            <CardTitle class="text-sm font-medium text-muted-foreground">用户数</CardTitle>
          </CardHeader>
          <CardContent>
            <div class="font-mono text-2xl font-bold">{{ dash?.user_stats.total_users ?? "—" }}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader class="pb-2">
            <CardTitle class="text-sm font-medium text-muted-foreground">股票数</CardTitle>
          </CardHeader>
          <CardContent>
            <div class="font-mono text-2xl font-bold">{{ dash?.system_stats.total_stocks ?? "—" }}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader class="pb-2">
            <CardTitle class="text-sm font-medium text-muted-foreground">笔记数</CardTitle>
          </CardHeader>
          <CardContent>
            <div class="font-mono text-2xl font-bold">{{ dash?.user_stats.total_notes ?? "—" }}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader class="pb-2">
            <CardTitle class="text-sm font-medium text-muted-foreground">收藏数</CardTitle>
          </CardHeader>
          <CardContent>
            <div class="font-mono text-2xl font-bold">{{ dash?.user_stats.total_favorites ?? "—" }}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>数据同步</CardTitle>
        </CardHeader>
        <CardContent class="space-y-3">
          <div class="flex flex-wrap gap-2">
            <Button :loading="syncing" size="sm" @click="syncStocks">同步股票池</Button>
            <Button :loading="syncing" size="sm" variant="outline" @click="syncAllStocks">批量同步（5页）</Button>
            <Button :loading="syncing" size="sm" variant="outline" @click="syncKline">同步日K</Button>
            <Button :loading="syncing" size="sm" variant="outline" @click="refreshQuotes">刷新行情</Button>
          </div>
          <p v-if="syncMsg" class="text-sm text-muted-foreground">{{ syncMsg }}</p>
        </CardContent>
      </Card>
    </template>

    <!-- ===== 用户管理 ===== -->
    <template v-if="activeTab === 'users'">
      <div class="flex gap-2">
        <Input v-model="userSearch" placeholder="搜索用户名/邮箱" class="max-w-xs" @keyup.enter="userPage = 1; refetchUsers()" />
        <Button size="sm" @click="userPage = 1; refetchUsers()">搜索</Button>
      </div>
      <div class="overflow-x-auto rounded-md border border-border">
        <table class="w-full text-sm">
          <thead class="border-b border-border bg-secondary/40 text-xs text-muted-foreground">
            <tr>
              <th class="px-3 py-2 text-left font-medium">ID</th>
              <th class="px-3 py-2 text-left font-medium">用户名</th>
              <th class="px-3 py-2 text-left font-medium">邮箱</th>
              <th class="px-3 py-2 text-left font-medium">角色</th>
              <th class="px-3 py-2 text-left font-medium">注册时间</th>
              <th class="px-3 py-2 text-right font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="u in usersData?.items" :key="u.id" class="border-b border-border last:border-0">
              <td class="px-3 py-2 font-mono">{{ u.id }}</td>
              <td class="px-3 py-2">{{ u.username }}</td>
              <td class="px-3 py-2">{{ u.email }}</td>
              <td class="px-3 py-2">
                <span v-if="editingUser !== u.id"><Badge :variant="u.role === 'admin' ? 'default' : 'secondary'">{{ u.role }}</Badge></span>
                <select v-else v-model="editUserRole" class="text-xs border rounded px-1 py-0.5">
                  <option value="user">user</option>
                  <option value="admin">admin</option>
                </select>
              </td>
              <td class="px-3 py-2 text-muted-foreground">{{ u.created_at?.substring(0, 10) }}</td>
              <td class="px-3 py-2 text-right">
                <div class="flex gap-1 justify-end">
                  <Button v-if="editingUser !== u.id" size="sm" variant="ghost" @click="editingUser = u.id; editUserRole = u.role">编辑</Button>
                  <Button v-if="editingUser === u.id" size="sm" @click="updateUserRole(u.id)">保存</Button>
                  <Button size="sm" variant="ghost" @click="resetUserPassword(u.id)">重置密码</Button>
                  <Button size="sm" variant="destructive" @click="deleteUser(u.id)">删除</Button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-if="usersData?.pagination" class="flex items-center gap-2 text-sm">
        <Button size="sm" variant="outline" :disabled="userPage <= 1" @click="userPage--; refetchUsers()">上一页</Button>
        <span class="text-muted-foreground">第 {{ userPage }} / {{ usersData.pagination.total_pages }} 页</span>
        <Button size="sm" variant="outline" :disabled="userPage >= usersData.pagination.total_pages" @click="userPage++; refetchUsers()">下一页</Button>
      </div>
    </template>

    <!-- ===== 笔记管理 ===== -->
    <template v-if="activeTab === 'notes'">
      <div class="flex gap-2">
        <Input v-model="noteSearch" placeholder="搜索笔记内容" class="max-w-xs" @keyup.enter="notePage = 1; refetchNotes()" />
        <Button size="sm" @click="notePage = 1; refetchNotes()">搜索</Button>
      </div>
      <div class="overflow-x-auto rounded-md border border-border">
        <table class="w-full text-sm">
          <thead class="border-b border-border bg-secondary/40 text-xs text-muted-foreground">
            <tr>
              <th class="px-3 py-2 text-left font-medium">ID</th>
              <th class="px-3 py-2 text-left font-medium">用户</th>
              <th class="px-3 py-2 text-left font-medium">股票</th>
              <th class="px-3 py-2 text-left font-medium">内容</th>
              <th class="px-3 py-2 text-left font-medium">时间</th>
              <th class="px-3 py-2 text-right font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="n in notesData?.items" :key="n.id" class="border-b border-border last:border-0">
              <td class="px-3 py-2 font-mono">{{ n.id }}</td>
              <td class="px-3 py-2">{{ n.username ?? n.user_id }}</td>
              <td class="px-3 py-2 font-mono">{{ n.ts_code }}</td>
              <td class="px-3 py-2 max-w-xs truncate">{{ n.content }}</td>
              <td class="px-3 py-2 text-muted-foreground">{{ n.created_at?.substring(0, 10) }}</td>
              <td class="px-3 py-2 text-right">
                <Button size="sm" variant="destructive" @click="deleteNote(n.id)">删除</Button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-if="notesData?.pagination" class="flex items-center gap-2 text-sm">
        <Button size="sm" variant="outline" :disabled="notePage <= 1" @click="notePage--; refetchNotes()">上一页</Button>
        <span class="text-muted-foreground">第 {{ notePage }} / {{ notesData.pagination.total_pages }} 页</span>
        <Button size="sm" variant="outline" :disabled="notePage >= notesData.pagination.total_pages" @click="notePage++; refetchNotes()">下一页</Button>
      </div>
    </template>

    <!-- ===== 收藏管理 ===== -->
    <template v-if="activeTab === 'favorites'">
      <div class="overflow-x-auto rounded-md border border-border">
        <table class="w-full text-sm">
          <thead class="border-b border-border bg-secondary/40 text-xs text-muted-foreground">
            <tr>
              <th class="px-3 py-2 text-left font-medium">ID</th>
              <th class="px-3 py-2 text-left font-medium">用户</th>
              <th class="px-3 py-2 text-left font-medium">股票</th>
              <th class="px-3 py-2 text-left font-medium">时间</th>
              <th class="px-3 py-2 text-right font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="f in favData?.items" :key="f.id" class="border-b border-border last:border-0">
              <td class="px-3 py-2 font-mono">{{ f.id }}</td>
              <td class="px-3 py-2">{{ f.username ?? f.user_id }}</td>
              <td class="px-3 py-2 font-mono">{{ f.ts_code }}</td>
              <td class="px-3 py-2 text-muted-foreground">{{ f.created_at?.substring(0, 10) }}</td>
              <td class="px-3 py-2 text-right">
                <Button size="sm" variant="destructive" @click="deleteFavorite(f.id)">删除</Button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-if="favData?.pagination" class="flex items-center gap-2 text-sm">
        <Button size="sm" variant="outline" :disabled="favPage <= 1" @click="favPage--; refetchFav()">上一页</Button>
        <span class="text-muted-foreground">第 {{ favPage }} / {{ favData.pagination.total_pages }} 页</span>
        <Button size="sm" variant="outline" :disabled="favPage >= favData.pagination.total_pages" @click="favPage++; refetchFav()">下一页</Button>
      </div>
    </template>

    <!-- ===== 股票管理 ===== -->
    <template v-if="activeTab === 'stocks'">
      <div class="flex gap-2">
        <Input v-model="stockSearch" placeholder="搜索代码/名称/行业" class="max-w-xs" @keyup.enter="stockPage = 1; refetchStocks()" />
        <Button size="sm" @click="stockPage = 1; refetchStocks()">搜索</Button>
      </div>
      <div class="overflow-x-auto rounded-md border border-border">
        <table class="w-full text-sm">
          <thead class="border-b border-border bg-secondary/40 text-xs text-muted-foreground">
            <tr>
              <th class="px-3 py-2 text-left font-medium">ID</th>
              <th class="px-3 py-2 text-left font-medium">代码</th>
              <th class="px-3 py-2 text-left font-medium">名称</th>
              <th class="px-3 py-2 text-left font-medium">行业</th>
              <th class="px-3 py-2 text-left font-medium">市场</th>
              <th class="px-3 py-2 text-right font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="s in stocksData?.items" :key="s.id" class="border-b border-border last:border-0">
              <td class="px-3 py-2 font-mono">{{ s.id }}</td>
              <td class="px-3 py-2 font-mono">{{ s.ts_code }}</td>
              <td class="px-3 py-2">{{ s.name }}</td>
              <td class="px-3 py-2">{{ s.industry || "—" }}</td>
              <td class="px-3 py-2">{{ s.market || "—" }}</td>
              <td class="px-3 py-2 text-right">
                <Button size="sm" variant="destructive" @click="deleteStock(s.id)">删除</Button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-if="stocksData?.pagination" class="flex items-center gap-2 text-sm">
        <Button size="sm" variant="outline" :disabled="stockPage <= 1" @click="stockPage--; refetchStocks()">上一页</Button>
        <span class="text-muted-foreground">第 {{ stockPage }} / {{ stocksData.pagination.total_pages }} 页</span>
        <Button size="sm" variant="outline" :disabled="stockPage >= stocksData.pagination.total_pages" @click="stockPage++; refetchStocks()">下一页</Button>
      </div>
    </template>

    <!-- ===== 日K线管理 ===== -->
    <template v-if="activeTab === 'daily'">
      <div class="flex gap-2">
        <Input v-model="dailyTsCode" placeholder="输入股票代码过滤" class="max-w-xs" @keyup.enter="dailyPage = 1; refetchDaily()" />
        <Button size="sm" @click="dailyPage = 1; refetchDaily()">筛选</Button>
      </div>
      <div class="overflow-x-auto rounded-md border border-border">
        <table class="w-full text-sm">
          <thead class="border-b border-border bg-secondary/40 text-xs text-muted-foreground">
            <tr>
              <th class="px-3 py-2 text-left font-medium">股票</th>
              <th class="px-3 py-2 text-left font-medium">日期</th>
              <th class="px-3 py-2 text-right font-medium">开盘</th>
              <th class="px-3 py-2 text-right font-medium">收盘</th>
              <th class="px-3 py-2 text-right font-medium">最高</th>
              <th class="px-3 py-2 text-right font-medium">最低</th>
              <th class="px-3 py-2 text-right font-medium">成交量</th>
              <th class="px-3 py-2 text-right font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="d in dailyData?.items" :key="d.ts_code + d.trade_date" class="border-b border-border last:border-0">
              <td class="px-3 py-2 font-mono">{{ d.ts_code }}</td>
              <td class="px-3 py-2">{{ d.trade_date }}</td>
              <td class="px-3 py-2 text-right font-mono">{{ d.open?.toFixed(2) }}</td>
              <td class="px-3 py-2 text-right font-mono">{{ d.close?.toFixed(2) }}</td>
              <td class="px-3 py-2 text-right font-mono">{{ d.high?.toFixed(2) }}</td>
              <td class="px-3 py-2 text-right font-mono">{{ d.low?.toFixed(2) }}</td>
              <td class="px-3 py-2 text-right font-mono">{{ d.vol?.toLocaleString() }}</td>
              <td class="px-3 py-2 text-right">
                <Button size="sm" variant="destructive" @click="deleteDaily(d.ts_code, d.trade_date)">删除</Button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-if="dailyData?.pagination" class="flex items-center gap-2 text-sm">
        <Button size="sm" variant="outline" :disabled="dailyPage <= 1" @click="dailyPage--; refetchDaily()">上一页</Button>
        <span class="text-muted-foreground">第 {{ dailyPage }} / {{ dailyData.pagination.total_pages }} 页</span>
        <Button size="sm" variant="outline" :disabled="dailyPage >= dailyData.pagination.total_pages" @click="dailyPage++; refetchDaily()">下一页</Button>
      </div>
    </template>
  </section>
</template>
