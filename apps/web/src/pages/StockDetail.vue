<script setup lang="ts">
import { useQuery } from "@tanstack/vue-query";
import {
  ArrowLeft,
  RefreshCw,
  Star,
  StarOff,
  TrendingUp,
  TrendingDown,
  Activity,
  DollarSign,
  BarChart2,
  Target,
  Zap,
  AlertCircle,
} from "lucide-vue-next";
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
  formatNumber,
  formatPercent,
  formatVolume,
  formatCurrency,
  formatDate,
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

// 涨跌方向
const isUp = computed(() => (data.value?.analysis_data.pct_chg ?? 0) >= 0);
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- ===== 页面顶部 Header ===== -->
    <div class="flex items-center justify-between border-b border-border bg-background px-5 py-3">
      <div class="flex items-center gap-4">
        <button
          class="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
          @click="router.back()"
        >
          <ArrowLeft class="h-3.5 w-3.5" /> 返回
        </button>
        <div class="h-5 w-px bg-border" />
        <div v-if="isLoading">
          <Skeleton class="h-5 w-40" />
        </div>
        <template v-else-if="data">
          <div class="flex items-center gap-2">
            <h1 class="text-lg font-semibold tracking-tight">{{ data.stock.name }}</h1>
            <span class="font-mono text-sm text-muted-foreground">{{ data.stock.ts_code }}</span>
          </div>
          <div class="flex items-center gap-1.5">
            <Badge variant="outline" class="text-xs">{{ data.stock.market || "—" }}</Badge>
            <Badge v-if="data.stock.industry" variant="secondary" class="text-xs">
              {{ data.stock.industry }}
            </Badge>
            <span class="text-xs text-muted-foreground">{{ data.stock.area || "—" }}</span>
          </div>
        </template>
      </div>
      <div class="flex items-center gap-2">
        <Button variant="outline" size="sm" @click="refetch()">
          <RefreshCw class="h-3.5 w-3.5" /> 刷新
        </Button>
        <Button :variant="isFavorite ? 'default' : 'outline'" size="sm" @click="toggleFavorite">
          <component :is="isFavorite ? Star : StarOff" class="h-3.5 w-3.5" />
          {{ isFavorite ? "已收藏" : "收藏" }}
        </Button>
      </div>
    </div>

    <!-- ===== 加载状态 ===== -->
    <div v-if="isLoading" class="flex-1 space-y-4 p-5">
      <Skeleton class="h-72 w-full" />
      <div class="grid grid-cols-4 gap-4">
        <Skeleton v-for="i in 4" :key="i" class="h-32" />
      </div>
    </div>

    <!-- ===== 主内容区 ===== -->
    <template v-else-if="data">
      <!-- ----- 图表 + 右侧信息卡区（高密度布局） ----- -->
      <div class="flex gap-4 border-b border-border p-5">
        <!-- 左侧：K线图（占约60%） -->
        <div class="flex-1 min-w-0">
          <KLineChart :ts-code="tsCode" />
        </div>

        <!-- 右侧：信息密度卡组（占约40%） -->
        <div class="flex w-80 shrink-0 flex-col gap-3">
          <!-- 1. 价格卡 -->
          <Card class="overflow-hidden">
            <CardHeader class="pb-2 px-4 pt-4">
              <div class="flex items-center justify-between">
                <CardTitle class="text-xs font-medium text-muted-foreground">当前价格</CardTitle>
                <component
                  :is="isUp ? TrendingUp : TrendingDown"
                  class="h-3.5 w-3.5"
                  :class="isUp ? 'text-up' : 'text-down'"
                />
              </div>
            </CardHeader>
            <CardContent class="px-4 pb-4">
              <div
                class="font-mono text-3xl font-bold tracking-tight"
                :class="colorByChange(data.analysis_data.price_change)"
              >
                {{ formatNumber(data.analysis_data.current_price) }}
              </div>
              <div
                class="mt-1 flex items-center gap-1.5 font-mono text-sm"
                :class="colorByChange(data.analysis_data.price_change)"
              >
                <span>{{ formatNumber(data.analysis_data.price_change) }}</span>
                <Badge
                  :variant="isUp ? 'default' : 'secondary'"
                  class="font-mono text-xs"
                  :class="isUp ? 'bg-up/15 text-up border-up/20' : 'bg-down/10 text-down'"
                >
                  {{ formatPercent(data.analysis_data.pct_chg, true, false) }}
                </Badge>
              </div>
              <div class="mt-3 grid grid-cols-2 gap-2 border-t border-border/50 pt-3">
                <div class="flex justify-between text-xs">
                  <span class="text-muted-foreground">开盘</span>
                  <span class="font-mono">{{ formatNumber(data.analysis_data.open) }}</span>
                </div>
                <div class="flex justify-between text-xs">
                  <span class="text-muted-foreground">昨收</span>
                  <span class="font-mono">{{ formatNumber(data.analysis_data.pre_close) }}</span>
                </div>
                <div class="flex justify-between text-xs text-up">
                  <span class="text-muted-foreground">最高</span>
                  <span class="font-mono">{{ formatNumber(data.analysis_data.high) }}</span>
                </div>
                <div class="flex justify-between text-xs text-down">
                  <span class="text-muted-foreground">最低</span>
                  <span class="font-mono">{{ formatNumber(data.analysis_data.low) }}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <!-- 2. 成交卡 -->
          <Card class="overflow-hidden">
            <CardHeader class="pb-2 px-4 pt-4">
              <CardTitle class="text-xs font-medium text-muted-foreground">成交数据</CardTitle>
            </CardHeader>
            <CardContent class="px-4 pb-4">
              <div class="flex justify-between text-xs mb-2">
                <span class="text-muted-foreground">成交量</span>
                <span class="font-mono font-medium">{{ formatVolume(data.analysis_data.volume) }} 手</span>
              </div>
              <div class="flex justify-between text-xs mb-2">
                <span class="text-muted-foreground">成交额</span>
                <span class="font-mono">{{ formatCurrency(data.analysis_data.amount) }}</span>
              </div>
              <div class="border-t border-border/50 pt-2 flex gap-3">
                <div class="flex items-center gap-1">
                  <div
                    class="h-2 w-2 rounded-full"
                    :class="data.has_real_data ? 'bg-up' : 'bg-warning'"
                  />
                  <span class="text-xs text-muted-foreground">
                    {{ data.has_real_data ? '行情已就绪' : '行情缺失' }}
                  </span>
                </div>
                <div class="flex items-center gap-1">
                  <div
                    class="h-2 w-2 rounded-full"
                    :class="data.has_financial_data ? 'bg-accent' : 'bg-warning'"
                  />
                  <span class="text-xs text-muted-foreground">
                    {{ data.has_financial_data ? '财报已加载' : '待加载财报' }}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          <!-- 3. 财务指标卡 -->
          <Card class="overflow-hidden">
            <CardHeader class="pb-2 px-4 pt-4">
              <CardTitle class="text-xs font-medium text-muted-foreground">核心财务</CardTitle>
            </CardHeader>
            <CardContent class="px-4 pb-4">
              <div class="space-y-2">
                <div class="flex justify-between text-xs">
                  <span class="text-muted-foreground">总市值</span>
                  <span class="font-mono font-medium">
                    {{ formatCurrency(data.stock.market_cap) }}
                  </span>
                </div>
                <div class="flex justify-between text-xs">
                  <span class="text-muted-foreground">市盈率(TTM)</span>
                  <span class="font-mono">{{ data.stock.pe_ttm || '—' }}</span>
                </div>
                <div class="flex justify-between text-xs">
                  <span class="text-muted-foreground">市净率</span>
                  <span class="font-mono">{{ data.stock.pb || '—' }}</span>
                </div>
                <div class="flex justify-between text-xs">
                  <span class="text-muted-foreground">市销率(TTM)</span>
                  <span class="font-mono">{{ data.stock.ps_ttm || '—' }}</span>
                </div>
                <div class="flex justify-between text-xs">
                  <span class="text-muted-foreground">ROE</span>
                  <span class="font-mono">{{ data.stock.roe ? formatPercent(data.stock.roe) : '—' }}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <!-- ----- 标签页切换区（左侧Tab + 右侧内容） ----- -->
      <div class="flex flex-1 overflow-hidden">
        <!-- 左侧：Tab 导航 -->
        <div class="flex w-40 shrink-0 flex-col border-r border-border py-2">
          <button
            v-for="t in [
              { key: 'chart', label: 'K 线' },
              { key: 'financial', label: '财务分析' },
              { key: 'valuation', label: '估值模型' },
              { key: 'notes', label: '投资笔记' },
            ]"
            :key="t.key"
            class="flex items-center gap-2 px-4 py-2.5 text-left text-sm transition-colors"
            :class="
              activeTab === t.key
                ? 'bg-accent/10 text-accent border-r-2 border-accent font-medium'
                : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground'
            "
            @click="activeTab = t.key as typeof activeTab"
          >
            <component
              :is="{
                chart: BarChart2,
                financial: Activity,
                valuation: Target,
                notes: AlertCircle,
              }[t.key]"
              class="h-4 w-4 shrink-0"
            />
            {{ t.label }}
          </button>
        </div>

        <!-- 右侧：内容 -->
        <div class="flex-1 overflow-auto p-5">
          <KLineChart v-if="activeTab === 'chart'" :ts-code="tsCode" />
          <FinancialPanel v-else-if="activeTab === 'financial'" :ts-code="tsCode" />
          <ValuationPanel v-else-if="activeTab === 'valuation'" :ts-code="tsCode" />
          <NotesPanel v-else-if="activeTab === 'notes'" :ts-code="tsCode" />
        </div>
      </div>
    </template>
  </div>
</template>