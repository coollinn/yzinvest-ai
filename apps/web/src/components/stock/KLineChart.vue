<script setup lang="ts">
import { useQuery } from "@tanstack/vue-query";
import { use } from "echarts/core";
import { CandlestickChart, LineChart } from "echarts/charts";
import { GridComponent, TooltipComponent, DataZoomComponent, LegendComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import { computed, ref } from "vue";
import VChart from "vue-echarts";
import Button from "@/components/ui/Button.vue";
import Skeleton from "@/components/ui/Skeleton.vue";
import { apiGet } from "@/lib/api";
import type { StockDaily } from "@yzinvest/shared";

use([
  CandlestickChart,
  LineChart,
  GridComponent,
  TooltipComponent,
  DataZoomComponent,
  LegendComponent,
  CanvasRenderer,
]);

const props = defineProps<{ tsCode: string }>();

const range = ref<"1M" | "3M" | "6M" | "1Y">("3M");

const { data, isLoading } = useQuery({
  queryKey: ["daily", () => props.tsCode, range],
  queryFn: () =>
    apiGet<{ items: StockDaily[]; count: number }>(
      `/daily/${props.tsCode}?range=${range.value}`
    ),
  enabled: () => !!props.tsCode,
});

const option = computed(() => {
  const items = data.value?.items ?? [];
  const dates = items.map((i) => i.trade_date);
  // [open, close, low, high]
  const candles = items.map((i) => [i.open ?? 0, i.close ?? 0, i.low ?? 0, i.high ?? 0]);
  const volumes = items.map((i, idx) => ({
    value: i.vol ?? 0,
    itemStyle: {
      color: (i.close ?? 0) >= (i.open ?? 0) ? "#DC2626" : "#16A34A",
    },
  }));

  return {
    backgroundColor: "transparent",
    grid: [
      { left: 50, right: 16, top: 24, height: "60%" },
      { left: 50, right: 16, top: "75%", height: "18%" },
    ],
    xAxis: [
      {
        type: "category",
        data: dates,
        scale: true,
        boundaryGap: false,
        axisLine: { lineStyle: { color: "rgba(120,120,120,0.3)" } },
        splitLine: { show: false },
        axisLabel: {
          formatter: (val: string) =>
            val.length === 8 ? `${val.slice(4, 6)}/${val.slice(6, 8)}` : val,
        },
      },
      {
        type: "category",
        gridIndex: 1,
        data: dates,
        boundaryGap: false,
        axisTick: { show: false },
        axisLabel: { show: false },
        axisLine: { show: false },
      },
    ],
    yAxis: [
      {
        scale: true,
        position: "right",
        axisLine: { show: false },
        splitLine: { lineStyle: { color: "rgba(120,120,120,0.15)" } },
      },
      {
        gridIndex: 1,
        scale: true,
        position: "right",
        axisLine: { show: false },
        splitLine: { show: false },
        axisLabel: { show: false },
      },
    ],
    dataZoom: [
      { type: "inside", xAxisIndex: [0, 1], start: 0, end: 100 },
      { show: true, xAxisIndex: [0, 1], type: "slider", bottom: 0, height: 18 },
    ],
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "cross" },
      backgroundColor: "rgba(0,0,0,0.85)",
      borderWidth: 0,
      textStyle: { color: "#fff", fontSize: 12 },
    },
    series: [
      {
        type: "candlestick",
        name: "K线",
        data: candles,
        itemStyle: {
          color: "#DC2626",
          color0: "#16A34A",
          borderColor: "#DC2626",
          borderColor0: "#16A34A",
        },
      },
      {
        type: "bar",
        name: "成交量",
        data: volumes,
        xAxisIndex: 1,
        yAxisIndex: 1,
      },
    ],
  };
});
</script>

<template>
  <div class="space-y-3">
    <div class="flex items-center justify-end gap-1">
      <Button
        v-for="r in ['1M', '3M', '6M', '1Y'] as const"
        :key="r"
        size="sm"
        :variant="range === r ? 'default' : 'outline'"
        @click="range = r"
      >
        {{ r }}
      </Button>
    </div>
    <div class="rounded-lg border border-border bg-card p-3">
      <Skeleton v-if="isLoading" class="h-96 w-full" />
      <div v-else-if="!data?.items?.length" class="flex h-96 items-center justify-center text-sm text-muted-foreground">
        暂无日线数据。Tushare 拉取中或当前股票无数据。
      </div>
      <VChart v-else :option="option" autoresize style="height: 480px;" />
    </div>
  </div>
</template>
