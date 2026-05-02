<script setup lang="ts">
import { useQuery } from "@tanstack/vue-query";
import { ref } from "vue";
import Button from "@/components/ui/Button.vue";
import Card from "@/components/ui/Card.vue";
import CardContent from "@/components/ui/CardContent.vue";
import CardHeader from "@/components/ui/CardHeader.vue";
import CardTitle from "@/components/ui/CardTitle.vue";
import Skeleton from "@/components/ui/Skeleton.vue";
import { apiGet, apiPost } from "@/lib/api";
import { formatNumber } from "@/lib/utils";
import type { FinancialResponse, FinancialType } from "@yzinvest/shared";

const props = defineProps<{ tsCode: string }>();

const tabs = [
  { key: "balance_sheet", label: "资产负债表", path: "balance-sheet" },
  { key: "income_statement", label: "利润表", path: "income-statement" },
  { key: "cash_flow", label: "现金流量表", path: "cash-flow" },
  { key: "main_indicators", label: "主要指标", path: "main-indicators" },
] as const;

const active = ref<typeof tabs[number]>(tabs[0]);

const { data, isLoading, error, refetch } = useQuery({
  queryKey: ["financial", () => props.tsCode, () => active.value.key],
  queryFn: () =>
    apiGet<FinancialResponse>(`/financial/${props.tsCode}/${active.value.path}`),
});

async function syncNow() {
  await apiPost(`/financial/${props.tsCode}/sync?type=${active.value.key}`);
  await refetch();
}

function periodOrder(periodType: string): number {
  return { year: 0, middle: 1, three: 2, one: 3 }[periodType] ?? 99;
}
</script>

<template>
  <Card>
    <CardHeader class="flex flex-row items-center justify-between gap-2">
      <div class="flex flex-wrap gap-1">
        <Button
          v-for="t in tabs"
          :key="t.key"
          size="sm"
          :variant="active.key === t.key ? 'default' : 'outline'"
          @click="active = t"
        >
          {{ t.label }}
        </Button>
      </div>
      <Button size="sm" variant="ghost" @click="syncNow">同步</Button>
    </CardHeader>
    <CardContent>
      <Skeleton v-if="isLoading" class="h-64 w-full" />
      <div v-else-if="error" class="space-y-3">
        <p class="text-sm text-destructive">{{ (error as Error).message }}</p>
        <p class="text-sm text-muted-foreground">
          首次访问会触发后端从东方财富拉取，可能需要 3-5 秒。失败后请点"同步"再试。
        </p>
      </div>
      <div v-else-if="!data || Object.keys(data.data ?? {}).length === 0" class="text-sm text-muted-foreground">
        暂无数据，点击"同步"拉取
      </div>
      <div v-else class="space-y-6">
        <div
          v-for="periodType in Object.keys(data.data).sort((a, b) => periodOrder(a) - periodOrder(b))"
          :key="periodType"
        >
          <h3 class="mb-2 text-sm font-medium text-muted-foreground">
            {{
              { year: "年报", middle: "中报", three: "三季报", one: "一季报" }[
                periodType as string
              ] || periodType
            }}
          </h3>
          <div class="overflow-x-auto rounded-md border border-border">
            <table class="w-full text-sm">
              <thead class="border-b border-border bg-secondary/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th class="sticky left-0 bg-secondary/40 px-3 py-2 text-left font-medium">指标</th>
                  <th
                    v-for="date in Object.keys(data.data[periodType]).sort().reverse()"
                    :key="date"
                    class="px-3 py-2 text-right font-medium"
                  >
                    {{ date.slice(0, 4) }}
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="key in Array.from(
                    new Set(
                      Object.values(data.data[periodType]).flatMap((d) => Object.keys(d))
                    )
                  )"
                  :key="key"
                  class="border-b border-border last:border-0"
                >
                  <td class="sticky left-0 bg-card px-3 py-2 font-medium">{{ key }}</td>
                  <td
                    v-for="date in Object.keys(data.data[periodType]).sort().reverse()"
                    :key="date"
                    class="px-3 py-2 text-right font-mono tabular-nums"
                  >
                    {{
                      data.data[periodType][date]?.[key]?.value != null
                        ? formatNumber(data.data[periodType][date][key].value as number)
                        : "—"
                    }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <p class="text-xs text-muted-foreground">数据来源：东方财富</p>
      </div>
    </CardContent>
  </Card>
</template>
