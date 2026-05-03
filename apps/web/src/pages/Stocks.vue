<script setup lang="ts">
import { keepPreviousData, useQuery } from "@tanstack/vue-query";
import { ChevronLeft, ChevronRight, Search, TrendingUp, TrendingDown } from "lucide-vue-next";
import { computed, ref, watch } from "vue";
import { RouterLink } from "vue-router";
import Button from "@/components/ui/Button.vue";
import Input from "@/components/ui/Input.vue";
import Skeleton from "@/components/ui/Skeleton.vue";
import { apiGet } from "@/lib/api";
import { colorByChange, formatNumber, formatVolume } from "@/lib/utils";

interface StockListItem {
  ts_code: string;
  symbol: string;
  name: string;
  industry: string | null;
  market: string | null;
  list_date: string | null;
}

interface QuoteItem {
  ts_code: string;
  current_price: number;
  pct_chg: number;
  price_change: number;
  volume: number;
  amount: number;
  pe_ttm: number | null;
  pb: number | null;
  market_cap: number | null;
  turnover: number | null;
}

const page = ref(1);
const limit = ref(30);
const searchQuery = ref("");

// 搜索模式：有关键词时调用 /api/stocks/search（全库搜索），否则分页列表
const isSearchMode = computed(() => searchQuery.value.trim().length > 0);

// 搜索时重置到第 1 页
watch(searchQuery, () => {
  page.value = 1;
});

// ---- 普通分页列表（本地数据库）----
const { data: listData, isLoading: listLoading, isFetching: listFetching } = useQuery({
  queryKey: ["stocks", page, limit],
  queryFn: () =>
    apiGet<{
      items: StockListItem[];
      pagination: { total_items: number; total_pages: number };
    }>(`/stocks?page=${page.value}&limit=${limit.value}`),
  placeholderData: keepPreviousData,
  enabled: computed(() => !isSearchMode.value),
});

// ---- 全库搜索（本地数据库）----
const { data: searchData, isLoading: searchLoading } = useQuery({
  queryKey: ["stocks-search", searchQuery],
  queryFn: () =>
    apiGet<{ items: StockListItem[]; count: number; query: string }>(
      `/stocks/search?q=${encodeURIComponent(searchQuery.value.trim())}&limit=50`
    ),
  placeholderData: keepPreviousData,
  enabled: computed(() => isSearchMode.value),
});

// ---- 批量实时行情（东方财富）----
const tsCodes = computed(() => {
  if (isSearchMode.value) return searchData.value?.items.map((s) => s.ts_code) ?? [];
  return listData.value?.items.map((s) => s.ts_code) ?? [];
});

const { data: quotesData, isLoading: quotesLoading } = useQuery({
  queryKey: ["stocks-quotes", () => tsCodes.value.join(",")],
  queryFn: () =>
    apiGet<{ items: QuoteItem[] }>(
      `/stocks/quotes?ts_codes=${encodeURIComponent(tsCodes.value.join(","))}`
    ),
  placeholderData: keepPreviousData,
  enabled: computed(() => tsCodes.value.length > 0 && tsCodes.value.length <= 100),
  staleTime: 1000 * 30, // 30s 缓存
});

// 合并股票信息和实时行情
const mergedItems = computed(() => {
  const stocks = isSearchMode.value
    ? (searchData.value?.items ?? [])
    : (listData.value?.items ?? []);
  const quotes = new Map(quotesData.value?.items.map((q) => [q.ts_code, q]));

  return stocks.map((s) => ({
    ...s,
    quote: quotes.get(s.ts_code) ?? null,
  }));
});

const isLoading = computed(() =>
  isSearchMode.value
    ? searchLoading.value || quotesLoading.value
    : listLoading.value || quotesLoading.value
);
const isFetching = computed(() => !isSearchMode.value && listFetching.value);

// 分页（搜索模式下不分页）
const totalPages = computed(() =>
  isSearchMode.value ? 1 : (listData.value?.pagination.total_pages ?? 1)
);
const totalItems = computed(() =>
  isSearchMode.value
    ? (searchData.value?.count ?? 0)
    : (listData.value?.pagination.total_items ?? 0)
);

function formatDate(dateStr: string | null | undefined) {
  if (!dateStr || dateStr.length !== 8) return "—";
  return `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`;
}

function formatCurrency(amount: number | null | undefined): string {
  if (amount == null) return "—";
  if (amount >= 100000000) return `${(amount / 100000000).toFixed(1)}亿`;
  if (amount >= 10000) return `${(amount / 10000).toFixed(1)}万`;
  return `${amount.toFixed(0)}`;
}
</script>

<template>
  <div class="flex h-full flex-col">
    <!-- 顶部 Header -->
    <header class="shrink-0 border-b border-border bg-background/95 backdrop-blur">
      <div class="flex flex-wrap items-end justify-between gap-3 px-4 py-3">
        <div>
          <h1 class="text-base font-semibold">股票列表</h1>
          <p class="text-xs text-muted-foreground">
            <template v-if="isSearchMode">
              搜索"{{ searchQuery }}"共 {{ totalItems }} 条结果
            </template>
            <template v-else>
              共 {{ totalItems }} 只上市股票
            </template>
          </p>
        </div>
        <div class="flex items-center gap-2">
          <div class="relative">
            <Search class="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              v-model="searchQuery"
              placeholder="搜索代码/名称/行业"
              class="h-8 w-40 pl-8 text-xs sm:w-48"
            />
          </div>
        </div>
      </div>
    </header>

    <!-- 表格 -->
    <div class="flex-1 overflow-auto">
      <table class="w-full text-xs">
        <thead class="sticky top-0 border-b border-border bg-muted/50 text-[10px] uppercase tracking-wide text-muted-foreground">
          <tr>
            <th class="px-3 py-2 text-left font-medium">代码</th>
            <th class="px-3 py-2 text-left font-medium">名称</th>
            <th class="hidden px-3 py-2 text-right font-medium sm:table-cell">最新价</th>
            <th class="hidden px-3 py-2 text-right font-medium sm:table-cell">涨跌幅</th>
            <th class="hidden px-3 py-2 text-right font-medium md:table-cell">成交量</th>
            <th class="hidden px-3 py-2 text-right font-medium lg:table-cell">成交额</th>
            <th class="hidden px-3 py-2 text-right font-medium lg:table-cell">市值</th>
            <th class="hidden px-3 py-2 text-left font-medium md:table-cell">行业</th>
            <th class="hidden px-3 py-2 text-left font-medium lg:table-cell">市场</th>
          </tr>
        </thead>
        <tbody>
          <template v-if="isLoading">
            <tr v-for="i in 15" :key="i" class="border-b border-border/50">
              <td class="px-3 py-2"><Skeleton class="h-3.5 w-14" /></td>
              <td class="px-3 py-2"><Skeleton class="h-3.5 w-20" /></td>
              <td class="hidden px-3 py-2 sm:table-cell"><Skeleton class="h-3.5 w-14" /></td>
              <td class="hidden px-3 py-2 sm:table-cell"><Skeleton class="h-3.5 w-14" /></td>
              <td class="hidden px-3 py-2 md:table-cell"><Skeleton class="h-3.5 w-14" /></td>
              <td class="hidden px-3 py-2 lg:table-cell"><Skeleton class="h-3.5 w-14" /></td>
              <td class="hidden px-3 py-2 lg:table-cell"><Skeleton class="h-3.5 w-14" /></td>
              <td class="hidden px-3 py-2 md:table-cell"><Skeleton class="h-3.5 w-16" /></td>
              <td class="hidden px-3 py-2 lg:table-cell"><Skeleton class="h-3.5 w-12" /></td>
            </tr>
          </template>
          <template v-else-if="mergedItems.length === 0">
            <tr>
              <td colspan="9" class="px-3 py-8 text-center text-muted-foreground">
                {{ searchQuery ? '未找到匹配的股票' : '暂无股票数据' }}
              </td>
            </tr>
          </template>
          <template v-else>
            <tr
              v-for="s in mergedItems"
              :key="s.ts_code"
              class="border-b border-border/50 hover:bg-muted/30"
            >
              <td class="px-3 py-2 font-mono">{{ s.symbol }}</td>
              <td class="px-3 py-2">
                <RouterLink
                  :to="`/stocks/${s.ts_code}`"
                  class="font-medium hover:underline"
                >
                  {{ s.name }}
                </RouterLink>
              </td>
              <td class="hidden px-3 py-2 text-right font-mono sm:table-cell"
                  :class="s.quote ? colorByChange(s.quote.pct_chg) : ''"
              >
                {{ s.quote ? formatNumber(s.quote.current_price) : '—' }}
              </td>
              <td class="hidden px-3 py-2 text-right sm:table-cell"
                  :class="s.quote ? colorByChange(s.quote.pct_chg) : ''"
              >
                <span v-if="s.quote" class="inline-flex items-center gap-0.5 font-mono">
                  <component :is="s.quote.pct_chg >= 0 ? TrendingUp : TrendingDown" class="h-3 w-3" />
                  {{ s.quote.pct_chg >= 0 ? '+' : '' }}{{ formatNumber(s.quote.pct_chg) }}%
                </span>
                <span v-else>—</span>
              </td>
              <td class="hidden px-3 py-2 text-right font-mono text-muted-foreground md:table-cell">
                {{ s.quote ? formatVolume(s.quote.volume) : '—' }}
              </td>
              <td class="hidden px-3 py-2 text-right font-mono text-muted-foreground lg:table-cell">
                {{ s.quote ? formatCurrency(s.quote.amount) : '—' }}
              </td>
              <td class="hidden px-3 py-2 text-right font-mono text-muted-foreground lg:table-cell">
                {{ s.quote?.market_cap ? formatCurrency(s.quote.market_cap * 100000000) : '—' }}
              </td>
              <td class="hidden px-3 py-2 text-muted-foreground md:table-cell">
                {{ s.industry || "—" }}
              </td>
              <td class="hidden px-3 py-2 text-muted-foreground lg:table-cell">
                {{ s.market || "—" }}
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>

    <!-- 分页（搜索模式下隐藏） -->
    <footer v-if="!isSearchMode" class="shrink-0 border-t border-border bg-background/95 px-4 py-2">
      <div class="flex items-center justify-between">
        <p class="text-[10px] text-muted-foreground">
          第 {{ page }} / {{ totalPages }} 页
          <span v-if="isFetching" class="ml-1">更新中…</span>
        </p>
        <div class="flex gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            class="h-7 px-2 text-xs"
            :disabled="page <= 1"
            @click="page--"
          >
            <ChevronLeft class="mr-0.5 h-3 w-3" />上一页
          </Button>
          <Button
            variant="ghost"
            size="sm"
            class="h-7 px-2 text-xs"
            :disabled="page >= totalPages"
            @click="page++"
          >
            下一页<ChevronRight class="ml-0.5 h-3 w-3" />
          </Button>
        </div>
      </div>
    </footer>
  </div>
</template>
