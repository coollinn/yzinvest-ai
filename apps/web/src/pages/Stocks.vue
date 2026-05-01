<script setup lang="ts">
import { keepPreviousData, useQuery } from "@tanstack/vue-query";
import { ChevronLeft, ChevronRight, Search } from "lucide-vue-next";
import { computed, ref } from "vue";
import { RouterLink } from "vue-router";
import Button from "@/components/ui/Button.vue";
import Input from "@/components/ui/Input.vue";
import Skeleton from "@/components/ui/Skeleton.vue";
import { apiGet } from "@/lib/api";
import type { ListResponse, Stock } from "@yzinvest/shared";

const page = ref(1);
const limit = ref(30);
const searchQuery = ref("");

const { data, isLoading, isFetching } = useQuery({
  queryKey: ["stocks", page, limit],
  queryFn: () =>
    apiGet<ListResponse<Stock>>(`/stocks?page=${page.value}&limit=${limit.value}`),
  placeholderData: keepPreviousData,
});

// 搜索过滤
const filteredItems = computed(() => {
  if (!searchQuery.value.trim()) return data.value?.items ?? [];
  const q = searchQuery.value.toLowerCase();
  return (data.value?.items ?? []).filter(
    (s) =>
      s.name?.toLowerCase().includes(q) ||
      s.symbol?.toLowerCase().includes(q) ||
      s.industry?.toLowerCase().includes(q)
  );
});

const totalPages = computed(() => data.value?.pagination.total_pages ?? 1);
const totalItems = computed(() => data.value?.pagination.total_items ?? 0);

function formatDate(dateStr: string | null | undefined) {
  if (!dateStr || dateStr.length !== 8) return "—";
  return `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`;
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
            共 {{ totalItems }} 只上市股票
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
            <th class="hidden px-3 py-2 text-left font-medium sm:table-cell">行业</th>
            <th class="hidden px-3 py-2 text-left font-medium md:table-cell">市场</th>
            <th class="hidden px-3 py-2 text-left font-medium lg:table-cell">上市日期</th>
          </tr>
        </thead>
        <tbody>
          <template v-if="isLoading">
            <tr v-for="i in 15" :key="i" class="border-b border-border/50">
              <td class="px-3 py-2"><Skeleton class="h-3.5 w-14" /></td>
              <td class="px-3 py-2"><Skeleton class="h-3.5 w-20" /></td>
              <td class="hidden px-3 py-2 sm:table-cell"><Skeleton class="h-3.5 w-16" /></td>
              <td class="hidden px-3 py-2 md:table-cell"><Skeleton class="h-3.5 w-12" /></td>
              <td class="hidden px-3 py-2 lg:table-cell"><Skeleton class="h-3.5 w-20" /></td>
            </tr>
          </template>
          <template v-else-if="filteredItems.length === 0">
            <tr>
              <td colspan="5" class="px-3 py-8 text-center text-muted-foreground">
                {{ searchQuery ? '未找到匹配的股票' : '暂无股票数据' }}
              </td>
            </tr>
          </template>
          <template v-else>
            <tr
              v-for="s in filteredItems"
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
              <td class="hidden px-3 py-2 text-muted-foreground sm:table-cell">
                {{ s.industry || "—" }}
              </td>
              <td class="hidden px-3 py-2 text-muted-foreground md:table-cell">
                {{ s.market || "—" }}
              </td>
              <td class="hidden px-3 py-2 font-mono text-muted-foreground lg:table-cell">
                {{ formatDate(s.list_date) }}
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>

    <!-- 分页 -->
    <footer class="shrink-0 border-t border-border bg-background/95 px-4 py-2">
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
