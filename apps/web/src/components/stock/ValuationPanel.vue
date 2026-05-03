<script setup lang="ts">
import { useQuery } from "@tanstack/vue-query";
import { reactive, ref } from "vue";
import Button from "@/components/ui/Button.vue";
import Card from "@/components/ui/Card.vue";
import CardContent from "@/components/ui/CardContent.vue";
import CardHeader from "@/components/ui/CardHeader.vue";
import CardTitle from "@/components/ui/CardTitle.vue";
import Input from "@/components/ui/Input.vue";
import Label from "@/components/ui/Label.vue";
import Skeleton from "@/components/ui/Skeleton.vue";
import { calculateCAPM, calculateDCF } from "@/lib/finance";
import { colorByChange, formatNumber, formatPercent } from "@/lib/utils";
import { apiGet, apiPost } from "@/lib/api";
import type { CAPMResult, DCFResult } from "@yzinvest/shared";

const props = defineProps<{ tsCode: string }>();

const dcfForm = reactive({
  freeCashFlow: 10000,
  growthRate: 10,
  discountRate: 8,
  terminalGrowth: 2,
});
const dcfResult = ref<DCFResult | null>(null);

const capmForm = reactive({
  riskFreeRate: 3,
  marketReturn: 10,
  beta: 1.2,
});
const capmResult = ref<CAPMResult | null>(null);

function runDCF() {
  dcfResult.value = calculateDCF(dcfForm);
}
function runCAPM() {
  capmResult.value = calculateCAPM(capmForm);
}

// 自动填充真实财务数据
const { data: paramsData, isLoading: paramsLoading } = useQuery({
  queryKey: ["valuation-params", () => props.tsCode],
  queryFn: () =>
    apiGet<{
      dcf_defaults: typeof dcfForm;
      capm_defaults: typeof capmForm;
      data_source: string;
      report_date: string | null;
      metrics: {
        net_cash_operate: number | null;
        revenue_cagr: number | null;
        roe: number | null;
        bps: number | null;
        eps: number | null;
        beta: number;
      };
    }>(`/valuation/${props.tsCode}/params`),
  staleTime: 1000 * 60 * 60,
});

function autoFill() {
  if (!paramsData.value) return;
  const d = paramsData.value.dcf_defaults;
  const c = paramsData.value.capm_defaults;
  dcfForm.freeCashFlow = d.freeCashFlow;
  dcfForm.growthRate = d.growthRate;
  dcfForm.discountRate = d.discountRate;
  dcfForm.terminalGrowth = d.terminalGrowth;
  capmForm.riskFreeRate = c.riskFreeRate;
  capmForm.marketReturn = c.marketReturn;
  capmForm.beta = c.beta;
}
</script>

<template>
  <div class="space-y-5">
    <!-- 数据来源提示 -->
    <div v-if="paramsData" class="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2 text-sm">
      <span class="text-muted-foreground">
        数据来源：<span class="font-medium text-foreground">{{ paramsData.data_source }}</span>
        <span v-if="paramsData.report_date" class="ml-1">({{ paramsData.report_date }})</span>
      </span>
      <Button size="sm" variant="outline" :loading="paramsLoading" @click="autoFill">
        自动填充
      </Button>
    </div>

    <div class="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>DCF 估值</CardTitle>
          <p class="text-sm text-muted-foreground">5 年预测 + 终值，输入单位：万元 / %</p>
        </CardHeader>
        <CardContent class="space-y-4">
          <div class="grid grid-cols-2 gap-3">
            <div class="space-y-1.5">
              <Label>自由现金流（万元）</Label>
              <Input v-model.number="dcfForm.freeCashFlow" type="number" />
              <p v-if="paramsData?.metrics.net_cash_operate" class="text-[10px] text-muted-foreground">
                经营活动现金流 {{ formatNumber(paramsData.metrics.net_cash_operate) }} 万元
              </p>
            </div>
            <div class="space-y-1.5">
              <Label>增长率（%）</Label>
              <Input v-model.number="dcfForm.growthRate" type="number" />
              <p v-if="paramsData?.metrics.revenue_cagr != null" class="text-[10px] text-muted-foreground">
                营收 CAGR {{ formatNumber(paramsData.metrics.revenue_cagr) }}%
              </p>
            </div>
            <div class="space-y-1.5">
              <Label>折现率（%）</Label>
              <Input v-model.number="dcfForm.discountRate" type="number" />
            </div>
            <div class="space-y-1.5">
              <Label>永续增长率（%）</Label>
              <Input v-model.number="dcfForm.terminalGrowth" type="number" />
            </div>
          </div>
          <Button class="w-full" @click="runDCF">计算</Button>
          <div v-if="dcfResult" class="space-y-2 rounded-md bg-secondary/50 p-3 font-mono text-sm">
            <div class="flex justify-between">
              <span class="text-muted-foreground">内在价值</span>
              <span class="font-bold">{{ formatNumber(dcfResult.intrinsicValue) }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-muted-foreground">现值合计</span>
              <span>{{ formatNumber(dcfResult.presentValue) }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-muted-foreground">终值现值</span>
              <span>{{ formatNumber(dcfResult.terminalValue) }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-muted-foreground">安全边际</span>
              <span :class="colorByChange(dcfResult.marginOfSafety)">
                {{ formatPercent(dcfResult.marginOfSafety, true, true) }}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>CAPM 预期回报</CardTitle>
          <p class="text-sm text-muted-foreground">资本资产定价模型</p>
        </CardHeader>
        <CardContent class="space-y-4">
          <div class="space-y-3">
            <div class="space-y-1.5">
              <Label>无风险利率（%）</Label>
              <Input v-model.number="capmForm.riskFreeRate" type="number" />
            </div>
            <div class="space-y-1.5">
              <Label>市场回报率（%）</Label>
              <Input v-model.number="capmForm.marketReturn" type="number" />
            </div>
            <div class="space-y-1.5">
              <Label>贝塔系数</Label>
              <Input v-model.number="capmForm.beta" type="number" />
              <p v-if="paramsData?.metrics.beta" class="text-[10px] text-muted-foreground">
                基于近30日股价波动计算 β = {{ formatNumber(paramsData.metrics.beta) }}
              </p>
            </div>
          </div>
          <Button class="w-full" @click="runCAPM">计算</Button>
          <div v-if="capmResult" class="space-y-2 rounded-md bg-secondary/50 p-3 font-mono text-sm">
            <div class="flex justify-between">
              <span class="text-muted-foreground">预期回报率</span>
              <span class="font-bold" :class="colorByChange(capmResult.expectedReturn)">
                {{ formatPercent(capmResult.expectedReturn, false, true) }}
              </span>
            </div>
            <div class="flex justify-between">
              <span class="text-muted-foreground">风险溢价</span>
              <span>{{ formatPercent(capmResult.riskPremium, false, true) }}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>

    <!-- 财务指标参考 -->
    <Card v-if="paramsData?.metrics">
      <CardHeader>
        <CardTitle class="text-base">关键财务指标参考</CardTitle>
      </CardHeader>
      <CardContent>
        <div class="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <div class="rounded-md border border-border p-2.5 text-center">
            <div class="text-[10px] text-muted-foreground">ROE</div>
            <div class="font-mono font-medium">{{ paramsData.metrics.roe ? formatNumber(paramsData.metrics.roe) + '%' : '—' }}</div>
          </div>
          <div class="rounded-md border border-border p-2.5 text-center">
            <div class="text-[10px] text-muted-foreground">BPS</div>
            <div class="font-mono font-medium">{{ paramsData.metrics.bps ? formatNumber(paramsData.metrics.bps) : '—' }}</div>
          </div>
          <div class="rounded-md border border-border p-2.5 text-center">
            <div class="text-[10px] text-muted-foreground">EPS</div>
            <div class="font-mono font-medium">{{ paramsData.metrics.eps ? formatNumber(paramsData.metrics.eps) : '—' }}</div>
          </div>
          <div class="rounded-md border border-border p-2.5 text-center">
            <div class="text-[10px] text-muted-foreground">营收 CAGR</div>
            <div class="font-mono font-medium">{{ paramsData.metrics.revenue_cagr != null ? formatNumber(paramsData.metrics.revenue_cagr) + '%' : '—' }}</div>
          </div>
          <div class="rounded-md border border-border p-2.5 text-center">
            <div class="text-[10px] text-muted-foreground">经营现金流</div>
            <div class="font-mono font-medium">{{ paramsData.metrics.net_cash_operate ? formatNumber(paramsData.metrics.net_cash_operate) + '万' : '—' }}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  </div>
</template>
