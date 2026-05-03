<script setup lang="ts">
import { useQuery } from "@tanstack/vue-query";
import { ref, computed } from "vue";
import Button from "@/components/ui/Button.vue";
import Card from "@/components/ui/Card.vue";
import CardContent from "@/components/ui/CardContent.vue";
import CardHeader from "@/components/ui/CardHeader.vue";
import CardTitle from "@/components/ui/CardTitle.vue";
import Skeleton from "@/components/ui/Skeleton.vue";
import Badge from "@/components/ui/Badge.vue";
import { apiGet, apiPost } from "@/lib/api";
import { formatNumber, colorByChange } from "@/lib/utils";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Activity,
  Target,
  Shield,
  BarChart3,
  FileText,
  Sparkles,
} from "lucide-vue-next";

// 简易 Markdown → HTML（仅支持研报中常见格式）
function mdToHtml(md: string): string {
  return md
    .replace(/### (.+)/g, '<h3 class="text-sm font-bold mt-3 mb-1.5">$1</h3>')
    .replace(/## (.+)/g, '<h2 class="text-base font-bold mt-4 mb-2">$1</h2>')
    .replace(/# (.+)/g, '<h1 class="text-lg font-bold mt-4 mb-2">$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^- (.+)$/gm, '<li class="ml-4 text-xs leading-relaxed">$1</li>')
    .replace(/^(\d+)\. (.+)$/gm, '<li class="ml-4 text-xs leading-relaxed"><span class="font-medium">$1.</span> $2</li>')
    .replace(/\n\n/g, '</p><p class="text-xs leading-relaxed mb-2">')
    .replace(/\n/g, ' ')
    .replace(/^(.+)$/gm, (m) => {
      if (m.startsWith('<')) return m;
      return '<p class="text-xs leading-relaxed mb-2">' + m + '</p>';
    });
}

const props = defineProps<{ tsCode: string }>();

const windowDays = ref(30);

// AI 研报
const reportLoading = ref(false);
const reportData = ref<{ report: string; model: string; generated_at: string; source: string } | null>(null);
const reportError = ref("");

async function generateReport() {
  reportLoading.value = true;
  reportError.value = "";
  try {
    const r = await apiPost<{ report: string; model: string; generated_at: string; source: string }>(
      `/prediction/${props.tsCode}/report`
    );
    reportData.value = r;
  } catch (e: any) {
    reportError.value = e.message || "生成失败";
  } finally {
    reportLoading.value = false;
  }
}

const {
  data: pred,
  isLoading: predLoading,
  error: predError,
} = useQuery({
  queryKey: ["prediction", () => props.tsCode],
  queryFn: () =>
    apiGet<{
      base_price: number;
      predict_dates: string[];
      predict_prices: number[];
      confidence: number;
      signal: "bull" | "bear" | "neutral";
      metrics: {
        ma5: number;
        ma10: number;
        ma20: number;
        ma60: number;
        rsi14: number;
        boll_upper: number;
        boll_lower: number;
        trend_slope: number;
        avg_daily_vol: number;
        recent_high: number;
        recent_low: number;
        max_drawdown_30d: number;
        volatility_20d: number;
        support_level: number;
        resistance_level: number;
      };
    }>(`/prediction/${props.tsCode}/next-week`),
  staleTime: 1000 * 60 * 30, // 30min cache
});

const {
  data: bt,
  isLoading: btLoading,
} = useQuery({
  queryKey: ["backtest", () => props.tsCode, () => windowDays.value],
  queryFn: () =>
    apiGet<{
      window_days: number;
      mae: number;
      rmse: number;
      direction_accuracy: number;
      actual_prices: number[];
      predicted_prices: number[];
    }>(`/prediction/${props.tsCode}/backtest?window=${windowDays.value}`),
  staleTime: 1000 * 60 * 60,
});

const signalConfig = {
  bull: {
    label: "看涨",
    icon: TrendingUp,
    class: "bg-up/10 text-up border-up/20",
    badge: "bg-up text-white",
  },
  bear: {
    label: "看跌",
    icon: TrendingDown,
    class: "bg-down/10 text-down border-down/20",
    badge: "bg-down text-white",
  },
  neutral: {
    label: "震荡",
    icon: Minus,
    class: "bg-secondary text-secondary-foreground",
    badge: "bg-muted text-muted-foreground",
  },
};

const signalInfo = computed(() => signalConfig[pred.value?.signal || "neutral"]);

const priceChange = computed(() => {
  if (!pred.value) return 0;
  const first = pred.value.base_price;
  const last = pred.value.predict_prices[pred.value.predict_prices.length - 1];
  return ((last - first) / first) * 100;
});

function dateLabel(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

// 简易折线图：用 CSS 渐变模拟
const sparklinePath = computed(() => {
  if (!bt.value?.actual_prices?.length) return "";
  const prices = bt.value.actual_prices;
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;
  const w = 300;
  const h = 60;
  return prices
    .map((p, i) => {
      const x = (i / (prices.length - 1)) * w;
      const y = h - ((p - min) / range) * h;
      return `${x},${y}`;
    })
    .join(" ");
});
</script>

<template>
  <div class="space-y-5">
    <!-- 预测概览卡 -->
    <Card>
      <CardHeader class="flex flex-row items-center justify-between">
        <CardTitle class="text-base">AI 价格预测（未来 5 个交易日）</CardTitle>
        <Badge v-if="pred" :class="signalInfo.badge">{{ signalInfo.label }}</Badge>
      </CardHeader>
      <CardContent class="space-y-5">
        <Skeleton v-if="predLoading" class="h-48 w-full" />
        <div v-else-if="predError" class="text-sm text-destructive">
          {{ (predError as Error).message }}
        </div>
        <div v-else-if="pred" class="space-y-5">
          <!-- 关键指标行 -->
          <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div class="rounded-lg border border-border p-3">
              <div class="text-xs text-muted-foreground">当前基准价</div>
              <div class="text-xl font-bold font-mono">{{ formatNumber(pred.base_price) }}</div>
            </div>
            <div class="rounded-lg border border-border p-3">
              <div class="text-xs text-muted-foreground">5日预测涨跌幅</div>
              <div class="text-xl font-bold font-mono" :class="colorByChange(priceChange)">
                {{ priceChange > 0 ? "+" : "" }}{{ formatNumber(priceChange) }}%
              </div>
            </div>
            <div class="rounded-lg border border-border p-3">
              <div class="text-xs text-muted-foreground">置信度</div>
              <div class="text-xl font-bold font-mono">{{ pred.confidence }}%</div>
            </div>
            <div class="rounded-lg border border-border p-3">
              <div class="text-xs text-muted-foreground">RSI(14)</div>
              <div class="text-xl font-bold font-mono">{{ formatNumber(pred.metrics.rsi14) }}</div>
            </div>
          </div>

          <!-- 逐日预测 -->
          <div class="rounded-lg border border-border overflow-hidden">
            <table class="w-full text-sm">
              <thead class="border-b border-border bg-secondary/40 text-xs text-muted-foreground">
                <tr>
                  <th class="px-3 py-2 text-left font-medium">日期</th>
                  <th class="px-3 py-2 text-right font-medium">预测价</th>
                  <th class="px-3 py-2 text-right font-medium">预测涨跌</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="(date, i) in pred.predict_dates"
                  :key="date"
                  class="border-b border-border last:border-0"
                >
                  <td class="px-3 py-2">{{ dateLabel(date) }}</td>
                  <td class="px-3 py-2 text-right font-mono">
                    {{ formatNumber(pred.predict_prices[i]) }}
                  </td>
                  <td
                    class="px-3 py-2 text-right font-mono"
                    :class="
                      i === 0
                        ? colorByChange(pred.predict_prices[i] - pred.base_price)
                        : colorByChange(pred.predict_prices[i] - pred.predict_prices[i - 1])
                    "
                  >
                    {{
                      i === 0
                        ? formatNumber(((pred.predict_prices[i] - pred.base_price) / pred.base_price) * 100)
                        : formatNumber(((pred.predict_prices[i] - pred.predict_prices[i - 1]) / pred.predict_prices[i - 1]) * 100)
                    }}%
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </CardContent>
    </Card>

    <!-- 技术指标 -->
    <Card v-if="pred">
      <CardHeader>
        <CardTitle class="text-base">技术指标</CardTitle>
      </CardHeader>
      <CardContent>
        <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div class="space-y-1 rounded-md border border-border p-3">
            <div class="text-xs text-muted-foreground">MA5</div>
            <div class="font-mono font-medium">{{ formatNumber(pred.metrics.ma5) }}</div>
          </div>
          <div class="space-y-1 rounded-md border border-border p-3">
            㰇>
          </div>
          <div class="space-y-1 rounded-md border border-border p-3">
            <div class="text-xs text-muted-foreground">MA10</div>
            <div class="font-mono font-medium">{{ formatNumber(pred.metrics.ma10) }}</div>
          </div>
          <div class="space-y-1 rounded-md border border-border p-3">
            <div class="text-xs text-muted-foreground">MA20</div>
            <div class="font-mono font-medium">{{ formatNumber(pred.metrics.ma20) }}</div>
          </div>
          <div class="space-y-1 rounded-md border border-border p-3">
            <div class="text-xs text-muted-foreground">MA60</div>
            <div class="font-mono font-medium">{{ formatNumber(pred.metrics.ma60) }}</div>
          </div>
          <div class="space-y-1 rounded-md border border-border p-3">
            <div class="text-xs text-muted-foreground">布林带上轨</div>
            <div class="font-mono font-medium">{{ formatNumber(pred.metrics.boll_upper) }}</div>
          </div>
          <div class="space-y-1 rounded-md border border-border p-3">
            <div class="text-xs text-muted-foreground">布林带下轨</div>
            <div class="font-mono font-medium">{{ formatNumber(pred.metrics.boll_lower) }}</div>
          </div>
          <div class="space-y-1 rounded-md border border-border p-3">
            <div class="text-xs text-muted-foreground">支撑位</div>
            <div class="font-mono font-medium text-down">{{ formatNumber(pred.metrics.support_level) }}</div>
          </div>
          <div class="space-y-1 rounded-md border border-border p-3">
            <div class="text-xs text-muted-foreground">阻力位</div>
            <div class="font-mono font-medium text-up">{{ formatNumber(pred.metrics.resistance_level) }}</div>
          </div>
          <div class="space-y-1 rounded-md border border-border p-3">
            <div class="text-xs text-muted-foreground">30日最大回撤</div>
            <div class="font-mono font-medium">{{ formatNumber(pred.metrics.max_drawdown_30d) }}%</div>
          </div>
          <div class="space-y-1 rounded-md border border-border p-3">
            <div class="text-xs text-muted-foreground">20日波动率</div>
            <div class="font-mono font-medium">{{ formatNumber(pred.metrics.volatility_20d) }}%</div>
          </div>
          <div class="space-y-1 rounded-md border border-border p-3">
            <div class="text-xs text-muted-foreground">趋势斜率</div>
            <div class="font-mono font-medium">{{ formatNumber(pred.metrics.trend_slope) }}</div>
          </div>
          <div class="space-y-1 rounded-md border border-border p-3">
            <div class="text-xs text-muted-foreground">日均成交量</div>
            <div class="font-mono font-medium">{{ pred.metrics.avg_daily_vol.toLocaleString() }}</div>
          </div>
        </div>
        <p class="mt-3 text-xs text-muted-foreground">
          预测模型：均线 + 线性回归 + RSI + 布林带综合评分
        </p>
      </CardContent>
    </Card>

    <!-- 回测结果 -->
    <Card v-if="bt">
      <CardHeader class="flex flex-row items-center justify-between">
        <CardTitle class="text-base">历史回测</CardTitle>
        <div class="flex items-center gap-1">
          <Button
            v-for="w in [10, 20, 30, 60]"
            :key="w"
            size="sm"
            :variant="windowDays === w ? 'default' : 'outline'"
            @click="windowDays = w"
          >
            {{ w }}天
          </Button>
        </div>
      </CardHeader>
      <CardContent class="space-y-4">
        <Skeleton v-if="btLoading" class="h-32 w-full" />
        <div v-else-if="bt" class="space-y-3">
          <div class="grid grid-cols-3 gap-3">
            <div class="rounded-lg border border-border p-3 text-center">
              <div class="text-xs text-muted-foreground">方向准确率</div>
              <div class="text-2xl font-bold font-mono">{{ bt.direction_accuracy }}%</div>
            </div>
            <div class="rounded-lg border border-border p-3 text-center">
              <div class="text-xs text-muted-foreground">MAE</div>
              <div class="text-2xl font-bold font-mono">{{ formatNumber(bt.mae) }}</div>
            </div>
            <div class="rounded-lg border border-border p-3 text-center">
              <div class="text-xs text-muted-foreground">RMSE</div>
              <div class="text-2xl font-bold font-mono">{{ formatNumber(bt.rmse) }}</div>
            </div>
          </div>

          <!-- 简易折线图 -->
          <div class="rounded-lg border border-border p-3">
            <div class="text-xs text-muted-foreground mb-2">实际价 vs 预测价</div>
            <div class="overflow-x-auto">
              <svg viewBox="0 0 300 80" class="w-full" style="max-width:600px">
                <polyline
                  :points="sparklinePath"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.5"
                  class="text-primary opacity-60"
                />
                <text x="280" y="12" class="text-[8px] fill-muted-foreground">实际</text>
              </svg>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>

    <!-- AI 智能研报 -->
    <Card>
      <CardHeader class="flex flex-row items-center justify-between">
        <div class="flex items-center gap-2">
          <Sparkles class="h-4 w-4 text-accent" />
          <CardTitle class="text-base">AI 智能研报</CardTitle>
          <Badge v-if="reportData?.source === 'cache'" variant="secondary" class="text-[10px]">缓存</Badge>
        </div>
        <Button :loading="reportLoading" size="sm" variant="outline" @click="generateReport">
          {{ reportData ? '重新生成' : '生成研报' }}
        </Button>
      </CardHeader>
      <CardContent>
        <div v-if="reportLoading" class="space-y-2">
          <Skeleton class="h-4 w-full" />
          <Skeleton class="h-4 w-5/6" />
          <Skeleton class="h-4 w-4/6" />
          <Skeleton class="h-4 w-full" />
        </div>
        <div v-else-if="reportError" class="text-sm text-destructive">{{ reportError }}</div>
        <div v-else-if="reportData">
          <div
            class="prose prose-sm max-w-none dark:prose-invert"
            v-html="mdToHtml(reportData.report)"
          />
          <p class="mt-3 text-[10px] text-muted-foreground">
            模型：{{ reportData.model }} · 生成时间：{{ reportData.generated_at?.substring(0, 16).replace('T', ' ') }}
          </p>
        </div>
        <div v-else class="flex flex-col items-center gap-2 py-6 text-center">
          <FileText class="h-8 w-8 text-muted-foreground/40" />
          <p class="text-xs text-muted-foreground">点击"生成研报"，AI 将基于财务数据、技术指标和价格预测生成分析报告</p>
        </div>
      </CardContent>
    </Card>
  </div>
</template>
