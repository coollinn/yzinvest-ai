<script setup lang="ts">
import { useQuery } from "@tanstack/vue-query";
import { ArrowLeft, RefreshCw, Star, StarOff } from "lucide-vue-next";
import { computed, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import Badge from "@/components/ui/Badge.vue";
import Button from "@/components/ui/Button.vue";
import Card from "@/components/ui/Card.vue";
import CardContent from "@/components/ui/CardContent.vue";
import CardHeader from "@/components/ui/CardHeader.vue";
import CardTitle from "@/components/ui/CardTitle.vue";
import Skeleton from "@/components/ui/Skeleton.vue";
import { apiDelete, apiGet, apiPost } from "@/lib/api";
import {
  colorByChange,
  formatCurrency,
  formatDate,
  formatNumber,
  formatPercent,
  formatVolume,
} from "@/lib/utils";
import { useAuthStore } from "@/stores/auth";
import type { StockDetailResponse } from "@yzinvest/shared";
import KLineChart from "@/components/stock/KLineChart.vue";
import FinancialPanel from "@/components/stock/FinancialPanel.vue";
import ValuationPanel from "@/components/stock/ValuationPanel.vue";
import NotesPanel from "@/components/stock/NotesPanel.vue";

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

const tsCode = computed(() => route.params.tsCode as string);
const activeTab = ref<"chart" | "financial" | "valuation" | "notes">("chart");

const { data, isLoading, refetch } = useQuery({
  queryKey: ["stock-detail", tsCode],
  queryFn: () => apiGet<StockDetailResponse>(`/stocks/${tsCode.value}/detail`),
  enabled: () => !!tsCode.value,
});

const { data: favCheck, refetch: refetchFav } = useQuery({
  queryKey: ["fav-check", tsCode],
  queryFn: () => apiGet<{ is_favorite: boolean }>(`/favorites/${tsCode.value}/check`),
  enabled: () => auth.isAuthenticated,
});

const isFavorite = computed(() => !!favCheck.value?.is_favorite);

async function toggleFavorite() {
  if (!auth.isAuthenticated) {
    router.push({ name: "login", query: { redirect: route.fullPath } });
    return;
  }
  if (isFavorite.value) {
    await apiDelete(`/favorites/${tsCode.value}`);
  } else {
    await apiPost("/favorites", { ts_code: tsCode.value });
  }
  await refetchFav();
}
</script>

<template>
  <section class="space-y-6">
    <button
      class="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      @click="router.back()"
    >
      <ArrowLeft class="h-3.5 w-3.5" /> 返回
    </button>

    <div v-if="isLoading" class="space-y-3">
      <Skeleton class="h-8 w-64" />
      <Skeleton class="h-4 w-96" />
      <div class="grid gap-4 sm:grid-cols-3">
        <Skeleton class="h-32" />
        <Skeleton class="h-32" />
        <Skeleton class="h-32" />
      </div>
    </div>

    <template v-else-if="data">
      <!-- Header -->
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div class="flex flex-wrap items-center gap-2">
            <h1 class="text-2xl font-bold tracking-tight">{{ data.stock.name }}</h1>
            <span class="font-mono text-sm text-muted-foreground">{{ data.stock.ts_code }}</span>
          </div>
          <div class="mt-2 flex flex-wrap items-center gap-2">
            <Badge variant="outline">{{ data.stock.market || "—" }}</Badge>
            <Badge v-if="data.stock.industry" variant="secondary">{{ data.stock.industry }}</Badge>
            <span class="text-xs text-muted-foreground">{{ data.stock.area || "—" }}</span>
            <span class="text-xs text-muted-foreground">
              上市 {{ formatDate(data.stock.list_date) }}
            </span>
          </div>
        </div>
        <div class="flex gap-2">
          <Button variant="outline" size="sm" @click="refetch()">
            <RefreshCw class="h-3.5 w-3.5" /> 刷新
          </Button>
          <Button :variant="isFavorite ? 'default' : 'outline'" size="sm" @click="toggleFavorite">
            <component :is="isFavorite ? Star : StarOff" class="h-3.5 w-3.5" />
            {{ isFavorite ? "已收藏" : "加入收藏" }}
          </Button>
        </div>
      </div>

      <!-- Quick stats -->
      <div class="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader class="pb-2">
            <p class="text-xs text-muted-foreground">最新价</p>
          </CardHeader>
          <CardContent>
            <div class="font-mono text-3xl font-bold tracking-tight" :class="colorByChange(data.analysis_data.price_change)">
              {{ formatNumber(data.analysis_data.current_price) }}
            </div>
            <div class="mt-1 flex items-center gap-2 font-mono text-sm" :class="colorByChange(data.analysis_data.price_change)">
              <span>{{ formatNumber(data.analysis_data.price_change) }}</span>
              <span>({{ formatPercent(data.analysis_data.pct_chg, true, false) }})</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader class="pb-2">
            <p class="text-xs text-muted-foreground">区间</p>
          </CardHeader>
          <CardContent class="space-y-1.5 font-mono text-sm">
            <div class="flex justify-between">
              <span class="text-muted-foreground">开盘</span>
              <span>{{ formatNumber(data.analysis_data.open) }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-muted-foreground">最高</span>
              <span class="text-up">{{ formatNumber(data.analysis_data.high) }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-muted-foreground">最低</span>
              <span class="text-down">{{ formatNumber(data.analysis_data.low) }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-muted-foreground">昨收</span>
              <span>{{ formatNumber(data.analysis_data.pre_close) }}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader class="pb-2">
            <p class="text-xs text-muted-foreground">成交</p>
          </CardHeader>
          <CardContent class="space-y-1.5 font-mono text-sm">
            <div class="flex justify-between">
              <span class="text-muted-foreground">成交量</span>
              <span>{{ formatVolume(data.analysis_data.volume) }} 手</span>
            </div>
            <div class="flex justify-between">
              <span class="text-muted-foreground">行情</span>
              <span class="text-xs text-muted-foreground">
                {{ data.has_real_data ? "已就绪" : "暂无数据" }}
              </span>
            </div>
            <div class="flex justify-between">
              <span class="text-muted-foreground">财报</span>
              <span class="text-xs text-muted-foreground">
                {{ data.has_financial_data ? "已就绪" : "首次访问会拉取" }}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      <!-- Tabs -->
      <div class="border-b border-border">
        <nav class="flex gap-1">
          <button
            v-for="t in [
              { key: 'chart', label: 'K 线' },
              { key: 'financial', label: '财报' },
              { key: 'valuation', label: '估值' },
              { key: 'notes', label: '笔记' },
            ]"
            :key="t.key"
            class="border-b-2 px-3 py-2 text-sm font-medium transition-colors"
            :class="
              activeTab === t.key
                ? 'border-foreground text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            "
            @click="activeTab = t.key as typeof activeTab"
          >
            {{ t.label }}
          </button>
        </nav>
      </div>

      <KLineChart v-if="activeTab === 'chart'" :ts-code="tsCode" />
      <FinancialPanel v-else-if="activeTab === 'financial'" :ts-code="tsCode" />
      <ValuationPanel v-else-if="activeTab === 'valuation'" :ts-code="tsCode" />
      <NotesPanel v-else-if="activeTab === 'notes'" :ts-code="tsCode" />
    </template>
  </section>
</template>
