<script setup lang="ts">
import { reactive, ref } from "vue";
import Button from "@/components/ui/Button.vue";
import Card from "@/components/ui/Card.vue";
import CardContent from "@/components/ui/CardContent.vue";
import CardHeader from "@/components/ui/CardHeader.vue";
import CardTitle from "@/components/ui/CardTitle.vue";
import Input from "@/components/ui/Input.vue";
import Label from "@/components/ui/Label.vue";
import { calculateCAPM, calculateDCF } from "@/lib/finance";
import { colorByChange, formatNumber, formatPercent } from "@/lib/utils";
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
</script>

<template>
  <div class="grid gap-4 lg:grid-cols-2">
    <Card>
      <CardHeader>
        <CardTitle>DCF 估值</CardTitle>
        <p class="text-sm text-muted-foreground">5 年预测 + 终值，输入单位：万元 / %</p>
      </CardHeader>
      <CardContent class="space-y-4">
        <div class="grid grid-cols-2 gap-3">
          <div class="space-y-1.5">
            <Label>自由现金流</Label>
            <Input v-model.number="dcfForm.freeCashFlow" type="number" />
          </div>
          <div class="space-y-1.5">
            <Label>增长率 (%)</Label>
            <Input v-model.number="dcfForm.growthRate" type="number" />
          </div>
          <div class="space-y-1.5">
            <Label>折现率 (%)</Label>
            <Input v-model.number="dcfForm.discountRate" type="number" />
          </div>
          <div class="space-y-1.5">
            <Label>永续增长率 (%)</Label>
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
            <Label>无风险利率 (%)</Label>
            <Input v-model.number="capmForm.riskFreeRate" type="number" />
          </div>
          <div class="space-y-1.5">
            <Label>市场回报率 (%)</Label>
            <Input v-model.number="capmForm.marketReturn" type="number" />
          </div>
          <div class="space-y-1.5">
            <Label>贝塔系数</Label>
            <Input v-model.number="capmForm.beta" type="number" />
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
</template>
