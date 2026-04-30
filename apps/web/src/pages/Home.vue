<script setup lang="ts">
import { useQuery } from "@tanstack/vue-query";
import { ArrowRight, Sparkles, TrendingUp, Wallet } from "lucide-vue-next";
import { RouterLink } from "vue-router";
import Card from "@/components/ui/Card.vue";
import CardContent from "@/components/ui/CardContent.vue";
import CardDescription from "@/components/ui/CardDescription.vue";
import CardHeader from "@/components/ui/CardHeader.vue";
import CardTitle from "@/components/ui/CardTitle.vue";
import { apiGet } from "@/lib/api";
import type { ListResponse, Stock } from "@yzinvest/shared";

const { data: random } = useQuery({
  queryKey: ["random-stocks"],
  queryFn: () => apiGet<{ items: Stock[] }>("/stocks/random?limit=12"),
});
</script>

<template>
  <section class="space-y-12">
    <!-- Hero -->
    <div class="space-y-6 py-12 text-center">
      <div class="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary/50 px-3 py-1 text-xs text-muted-foreground">
        <Sparkles class="h-3 w-3" />
        基于 Tushare + cninfo 实时财务数据
      </div>
      <h1 class="text-balance text-4xl font-bold tracking-tight sm:text-5xl">
        把研报变成<span class="text-up">可计算</span>的投资决策
      </h1>
      <p class="mx-auto max-w-2xl text-balance text-muted-foreground">
        A 股全市场覆盖。DCF / CAPM 估值模型、四张主报表、关键指标趋势 — 一处分析，账户全程在线。
      </p>
      <div class="flex justify-center gap-3">
        <RouterLink
          to="/stocks"
          class="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          浏览股票库 <ArrowRight class="h-3.5 w-3.5" />
        </RouterLink>
        <RouterLink
          to="/register"
          class="inline-flex items-center gap-2 rounded-md border border-border px-5 py-2.5 text-sm font-medium hover:bg-secondary"
        >
          免费注册
        </RouterLink>
      </div>
    </div>

    <!-- 卖点卡片 -->
    <div class="grid gap-4 sm:grid-cols-3">
      <Card>
        <CardHeader>
          <TrendingUp class="h-5 w-5 text-up" />
          <CardTitle>实时行情</CardTitle>
          <CardDescription>沪深北全市场，按需拉取，本地缓存</CardDescription>
        </CardHeader>
      </Card>
      <Card>
        <CardHeader>
          <Wallet class="h-5 w-5 text-accent" />
          <CardTitle>财务三表</CardTitle>
          <CardDescription>资产负债 / 利润 / 现金流，按年/中报/一/三季展开</CardDescription>
        </CardHeader>
      </Card>
      <Card>
        <CardHeader>
          <Sparkles class="h-5 w-5 text-warning" />
          <CardTitle>估值模型</CardTitle>
          <CardDescription>DCF 5 年预测 + 终值，CAPM 预期回报</CardDescription>
        </CardHeader>
      </Card>
    </div>

    <!-- 随机股票 -->
    <div>
      <h2 class="mb-4 flex items-center justify-between text-lg font-semibold">
        随机看看
        <RouterLink to="/stocks" class="text-sm font-normal text-muted-foreground hover:text-foreground">
          查看全部 →
        </RouterLink>
      </h2>
      <div v-if="random" class="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        <RouterLink
          v-for="s in random.items"
          :key="s.ts_code"
          :to="`/stocks/${s.ts_code}`"
          class="group rounded-lg border border-border bg-card p-4 transition-colors hover:border-foreground/20"
        >
          <div class="flex items-center justify-between">
            <span class="font-mono text-xs text-muted-foreground">{{ s.symbol }}</span>
            <span class="text-xs text-muted-foreground">{{ s.market }}</span>
          </div>
          <div class="mt-1 truncate font-medium">{{ s.name }}</div>
          <div class="mt-2 truncate text-xs text-muted-foreground">{{ s.industry }}</div>
        </RouterLink>
      </div>
    </div>
  </section>
</template>
