<script setup lang="ts">
import { useQuery, useQueryClient } from "@tanstack/vue-query";
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  Search,
  Star,
  TrendingUp,
} from "lucide-vue-next";
import { computed } from "vue";
import { RouterLink } from "vue-router";
import Badge from "@/components/ui/Badge.vue";
import Card from "@/components/ui/Card.vue";
import CardContent from "@/components/ui/CardContent.vue";
import Button from "@/components/ui/Button.vue";
import Skeleton from "@/components/ui/Skeleton.vue";
import { apiGet, apiDelete } from "@/lib/api";
import { useAuthStore } from "@/stores/auth";
import type { Stock } from "@yzinvest/shared";

const auth = useAuthStore();
const qc = useQueryClient();

// 自选股
const { data: favorites, isLoading: favLoading } = useQuery({
  queryKey: ["favorites"],
  queryFn: () => apiGet<{ items: Array<{ ts_code: string; stock: Stock | null }> }>("/favorites"),
  enabled: () => auth.isAuthenticated,
});

// 统计数据
const { data: stats } = useQuery({
  queryKey: ["stats"],
  queryFn: () => apiGet<{ total_stocks: number; favorites: number }>("/stocks/stats"),
});

async function removeFavorite(ts_code: string) {
  await apiDelete(`/favorites/${ts_code}`);
  qc.invalidateQueries({ queryKey: ["favorites"] });
}

// 当前时间
const now = computed(() => {
  const d = new Date();
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return { date, time };
});

// 快捷入口配置
const quickActions = [
  { icon: TrendingUp, label: "市场行情", to: "/stocks", desc: "全市场实时行情" },
  { icon: Search, label: "搜索股票", to: "/stocks", desc: "代码/名称搜索" },
  { icon: Star, label: "我的自选", to: "/favorites", desc: `${favorites.value?.items.length ?? 0} 只` },
  { icon: BookOpen, label: "投资笔记", to: "/notes", desc: "记录投资思考" },
];
</script>

<template>
  <div class="flex h-full flex-col">
    <!-- 顶部 Header -->
    <header class="shrink-0 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div class="flex items-center justify-between px-4 py-3">
        <div class="flex items-center gap-3">
          <div class="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/10">
            <BarChart3 class="h-4.5 w-4.5 text-accent" />
          </div>
          <div>
            <h1 class="text-base font-semibold">
              {{ auth.isAuthenticated ? `${auth.user?.full_name || auth.user?.username}，你好` : "欢迎使用 YZInvest" }}
            </h1>
            <p class="text-xs text-muted-foreground">{{ now.date }} {{ now.time }}</p>
          </div>
        </div>
        <div class="flex items-center gap-3">
          <span v-if="stats" class="hidden text-xs text-muted-foreground sm:block">
            股票库 {{ stats.total_stocks }} 只 · 自选 {{ stats.favorites }} 只
          </span>
          <RouterLink to="/stocks">
            <Button size="sm" class="gap-1.5">
              <Search class="h-3 w-3" />
              <span class="hidden sm:inline">搜索股票</span>
            </Button>
          </RouterLink>
        </div>
      </div>
    </header>

    <!-- 主内容 -->
    <main class="flex-1 overflow-auto p-4">
      <!-- 快捷入口 -->
      <div class="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <RouterLink
          v-for="action in quickActions"
          :key="action.label"
          :to="action.to"
          class="flex items-center gap-2.5 rounded-lg border border-border bg-card p-2.5 transition-colors hover:border-accent/30 hover:bg-accent/5"
        >
          <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-accent/10">
            <component :is="action.icon" class="h-3.5 w-3.5 text-accent" />
          </div>
          <div class="min-w-0">
            <p class="text-xs font-medium">{{ action.label }}</p>
            <p class="truncate text-[10px] text-muted-foreground">{{ action.desc }}</p>
          </div>
        </RouterLink>
      </div>

      <!-- 自选股 -->
      <section class="mb-4">
        <div class="mb-2 flex items-center justify-between">
          <div class="flex items-center gap-2">
            <h2 class="text-sm font-semibold">我的自选</h2>
            <Badge v-if="favorites" variant="secondary" class="text-[10px]">
              {{ favorites.items.length }} 只
            </Badge>
          </div>
          <RouterLink
            v-if="auth.isAuthenticated"
            to="/favorites"
            class="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            全部 <ArrowRight class="h-3 w-3" />
          </RouterLink>
          <RouterLink
            v-else
            to="/login"
            class="text-xs text-accent hover:underline"
          >
            登录管理自选
          </RouterLink>
        </div>

        <!-- 未登录 -->
        <Card v-if="!auth.isAuthenticated" class="border-dashed">
          <CardContent class="flex items-center justify-between py-4">
            <div class="flex items-center gap-2.5">
              <div class="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/10">
                <Star class="h-4 w-4 text-accent" />
              </div>
              <div>
                <p class="text-xs font-medium">登录后管理自选股</p>
                <p class="text-[10px] text-muted-foreground">收藏关注的股票，随时查看</p>
              </div>
            </div>
            <RouterLink to="/login">
              <Button variant="outline" size="sm" class="text-xs">登录</Button>
            </RouterLink>
          </CardContent>
        </Card>

        <!-- 加载中 -->
        <div v-else-if="favLoading" class="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Skeleton v-for="i in 4" :key="i" class="h-16" />
        </div>

        <!-- 空状态 -->
        <Card v-else-if="!favorites?.items.length" class="border-dashed">
          <CardContent class="flex flex-col items-center gap-2 py-5 text-center">
            <Star class="h-6 w-6 text-muted-foreground/50" />
            <div>
              <p class="text-xs font-medium text-muted-foreground">暂无自选股票</p>
              <p class="text-[10px] text-muted-foreground/70">在行情页添加关注</p>
            </div>
          </CardContent>
        </Card>

        <!-- 收藏列表 -->
        <div v-else class="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Card
            v-for="f in favorites.items.slice(0, 4)"
            :key="f.ts_code"
            class="group overflow-hidden transition-colors hover:border-accent/30"
          >
            <CardContent class="flex items-center justify-between p-2.5">
              <RouterLink
                :to="`/stocks/${f.ts_code}`"
                class="min-w-0 flex-1 hover:underline"
              >
                <div class="flex items-center gap-1.5">
                  <span class="font-mono text-[11px] text-muted-foreground">
                    {{ f.stock?.symbol ?? f.ts_code.split('.')[0] }}
                  </span>
                  <span class="text-xs font-medium">{{ f.stock?.name ?? "—" }}</span>
                </div>
                <div class="mt-0.5 flex gap-2 text-[10px] text-muted-foreground">
                  <span>{{ f.stock?.industry || "—" }}</span>
                  <span v-if="f.stock?.pe_ttm">PE {{ f.stock.pe_ttm }}</span>
                </div>
              </RouterLink>
              <button
                class="ml-1 shrink-0 rounded p-1 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-destructive/10"
                title="取消收藏"
                @click.stop="removeFavorite(f.ts_code)"
              >
                <Star class="h-3 w-3 fill-accent text-accent" />
              </button>
            </CardContent>
          </Card>
        </div>
      </section>

      <!-- 市场概览 -->
      <section>
        <div class="mb-2 flex items-center justify-between">
          <h2 class="text-sm font-semibold">市场概览</h2>
          <RouterLink
            to="/stocks"
            class="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            查看行情 <ArrowRight class="h-3 w-3" />
          </RouterLink>
        </div>
        <Card class="border-dashed">
          <CardContent class="flex flex-col items-center gap-2 py-6 text-center">
            <TrendingUp class="h-6 w-6 text-muted-foreground/50" />
            <div>
              <p class="text-xs font-medium text-muted-foreground">行情数据同步中</p>
              <p class="text-[10px] text-muted-foreground/70">请稍后刷新页面获取最新数据</p>
            </div>
          </CardContent>
        </Card>
      </section>
    </main>
  </div>
</template>
