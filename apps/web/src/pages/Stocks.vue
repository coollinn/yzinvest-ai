<script setup lang="ts">
import { keepPreviousData, useQuery } from "@tanstack/vue-query";
import { ChevronLeft, ChevronRight } from "lucide-vue-next";
import { computed, ref } from "vue";
import { RouterLink } from "vue-router";
import Button from "@/components/ui/Button.vue";
import Skeleton from "@/components/ui/Skeleton.vue";
import { apiGet } from "@/lib/api";
import type { ListResponse, Stock } from "@yzinvest/shared";

const page = ref(1);
const limit = ref(30);

const { data, isLoading, isFetching } = useQuery({
  queryKey: ["stocks", page, limit],
  queryFn: () =>
    apiGet<ListResponse<Stock>>(`/stocks?page=${page.value}&limit=${limit.value}`),
  placeholderData: keepPreviousData,
});

const totalPages = computed(() => data.value?.pagination.total_pages ?? 1);
const items = computed(() => data.value?.items ?? []);
</script>

<template>
  <section class="space-y-4">
    <header class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="text-2xl font-bold tracking-tight">股票库</h1>
        <p class="text-sm text-muted-foreground">
          全市场上市股票（仅显示状态 = L 上市中）
        </p>
      </div>
      <div class="text-sm tabular-nums text-muted-foreground">
        共 {{ data?.pagination.total_items ?? "—" }} 只
      </div>
    </header>

    <div class="overflow-hidden rounded-lg border border-border">
      <table class="w-full text-sm">
        <thead class="border-b border-border bg-secondary/50 text-xs uppercase text-muted-foreground">
          <tr>
            <th class="px-4 py-3 text-left font-medium">代码</th>
            <th class="px-4 py-3 text-left font-medium">名称</th>
            <th class="px-4 py-3 text-left font-medium">行业</th>
            <th class="hidden px-4 py-3 text-left font-medium md:table-cell">所属</th>
            <th class="hidden px-4 py-3 text-left font-medium md:table-cell">市场</th>
            <th class="hidden px-4 py-3 text-left font-medium lg:table-cell">上市日期</th>
          </tr>
        </thead>
        <tbody>
          <template v-if="isLoading">
            <tr v-for="i in 10" :key="i" class="border-b border-border last:border-0">
              <td class="px-4 py-3"><Skeleton class="h-4 w-16" /></td>
              <td class="px-4 py-3"><Skeleton class="h-4 w-24" /></td>
              <td class="px-4 py-3"><Skeleton class="h-4 w-20" /></td>
              <td class="hidden px-4 py-3 md:table-cell"><Skeleton class="h-4 w-16" /></td>
              <td class="hidden px-4 py-3 md:table-cell"><Skeleton class="h-4 w-16" /></td>
              <td class="hidden px-4 py-3 lg:table-cell"><Skeleton class="h-4 w-20" /></td>
            </tr>
          </template>
          <template v-else>
            <tr
              v-for="s in items"
              :key="s.ts_code"
              class="border-b border-border last:border-0 hover:bg-secondary/40"
            >
              <td class="px-4 py-3 font-mono text-xs">{{ s.symbol }}</td>
              <td class="px-4 py-3 font-medium">
                <RouterLink :to="`/stocks/${s.ts_code}`" class="hover:underline">{{ s.name }}</RouterLink>
              </td>
              <td class="px-4 py-3 text-muted-foreground">{{ s.industry || "—" }}</td>
              <td class="hidden px-4 py-3 text-muted-foreground md:table-cell">{{ s.area || "—" }}</td>
              <td class="hidden px-4 py-3 text-muted-foreground md:table-cell">{{ s.market || "—" }}</td>
              <td class="hidden px-4 py-3 font-mono text-xs text-muted-foreground lg:table-cell">
                {{ s.list_date ? `${s.list_date.slice(0,4)}-${s.list_date.slice(4,6)}-${s.list_date.slice(6,8)}` : "—" }}
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>

    <footer class="flex items-center justify-between">
      <p class="text-sm text-muted-foreground">
        第 {{ page }} / {{ totalPages }} 页
        <span v-if="isFetching" class="ml-2 text-xs">更新中…</span>
      </p>
      <div class="flex gap-2">
        <Button variant="outline" size="sm" :disabled="page <= 1" @click="page--">
          <ChevronLeft class="h-3.5 w-3.5" /> 上一页
        </Button>
        <Button variant="outline" size="sm" :disabled="page >= totalPages" @click="page++">
          下一页 <ChevronRight class="h-3.5 w-3.5" />
        </Button>
      </div>
    </footer>
  </section>
</template>
