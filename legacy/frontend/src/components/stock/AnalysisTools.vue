<template>
  <div class="analysis-tools">
    <a-row :gutter="16">
      <a-col :span="12">
        <a-card title="DCF估值模型" class="analysis-card">
          <a-form :model="dcfForm" layout="vertical">
            <a-form-item label="自由现金流 (万元)">
              <a-input-number
                v-model:value="dcfForm.freeCashFlow"
                :min="0"
                :step="1000"
                style="width: 100%"
              />
            </a-form-item>
            <a-form-item label="增长率 (%)">
              <a-input-number
                v-model:value="dcfForm.growthRate"
                :min="0"
                :max="100"
                :step="1"
                style="width: 100%"
              />
            </a-form-item>
            <a-form-item label="折现率 (%)">
              <a-input-number
                v-model:value="dcfForm.discountRate"
                :min="0"
                :max="100"
                :step="0.5"
                style="width: 100%"
              />
            </a-form-item>
            <a-form-item label="永续增长率 (%)">
              <a-input-number
                v-model:value="dcfForm.terminalGrowth"
                :min="0"
                :max="5"
                :step="0.1"
                style="width: 100%"
              />
            </a-form-item>
            <a-form-item>
              <a-button type="primary" @click="calculateDCF" block>
                计算DCF估值
              </a-button>
            </a-form-item>
          </a-form>

          <div v-if="dcfResult" class="result-section">
            <h4>DCF估值结果</h4>
            <div class="result-item">
              <span>内在价值:</span>
              <span class="result-value">¥{{ dcfResult.intrinsicValue.toFixed(2) }}</span>
            </div>
            <div class="result-item">
              <span>安全边际:</span>
              <span :class="['result-value', dcfResult.marginOfSafety >= 0 ? 'positive' : 'negative']">
                {{ (dcfResult.marginOfSafety * 100).toFixed(2) }}%
              </span>
            </div>
          </div>
        </a-card>
      </a-col>

      <a-col :span="12">
        <a-card title="CAPM模型" class="analysis-card">
          <a-form :model="capmForm" layout="vertical">
            <a-form-item label="无风险利率 (%)">
              <a-input-number
                v-model:value="capmForm.riskFreeRate"
                :min="0"
                :max="10"
                :step="0.1"
                style="width: 100%"
              />
            </a-form-item>
            <a-form-item label="市场回报率 (%)">
              <a-input-number
                v-model:value="capmForm.marketReturn"
                :min="0"
                :max="20"
                :step="0.5"
                style="width: 100%"
              />
            </a-form-item>
            <a-form-item label="贝塔系数">
              <a-input-number
                v-model:value="capmForm.beta"
                :min="0"
                :max="3"
                :step="0.1"
                style="width: 100%"
              />
            </a-form-item>
            <a-form-item>
              <a-button type="primary" @click="calculateCAPM" block>
                计算预期回报
              </a-button>
            </a-form-item>
          </a-form>

          <div v-if="capmResult" class="result-section">
            <h4>CAPM计算结果</h4>
            <div class="result-item">
              <span>预期回报率:</span>
              <span class="result-value">{{ (capmResult.expectedReturn * 100).toFixed(2) }}%</span>
            </div>
            <div class="result-item">
              <span>风险溢价:</span>
              <span class="result-value">{{ (capmResult.riskPremium * 100).toFixed(2) }}%</span>
            </div>
          </div>
        </a-card>
      </a-col>
    </a-row>

    <a-row :gutter="16" class="mt-16">
      <a-col :span="24">
        <a-card title="财务指标分析" class="metrics-card">
          <a-spin :spinning="metricsLoading">
            <div v-if="financialMetrics.length > 0" class="metrics-grid">
              <div
                v-for="metric in financialMetrics"
                :key="metric.name"
                class="metric-card"
                :class="getMetricCardClass(metric.trend)"
              >
                <div class="metric-name">{{ metric.name }}</div>
                <div class="metric-value">{{ metric.value }}</div>
                <div class="metric-trend" :class="metric.trend">
                  {{ metric.trend === 'up' ? '↑' : metric.trend === 'down' ? '↓' : '→' }}
                </div>
              </div>
            </div>
            <div v-else class="no-data">
              <p>暂无财务数据</p>
              <a-button type="link" @click="$emit('syncFinancial')">
                同步财务数据
              </a-button>
            </div>
          </a-spin>
        </a-card>
      </a-col>
    </a-row>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'

interface DCFResult {
  intrinsicValue: number
  marginOfSafety: number
}

interface CAPMResult {
  expectedReturn: number
  riskPremium: number
}

interface FinancialMetric {
  name: string
  value: string
  trend: 'up' | 'down' | 'stable'
}

// Props
defineProps<{
  stock: any
}>()

// Emits
const emit = defineEmits<{
  syncFinancial: []
}>()

// DCF Form and Result
const dcfForm = reactive({
  freeCashFlow: 10000,
  growthRate: 10,
  discountRate: 8,
  terminalGrowth: 2
})

const dcfResult = ref<DCFResult | null>(null)

// CAPM Form and Result
const capmForm = reactive({
  riskFreeRate: 3,
  marketReturn: 10,
  beta: 1.2
})

const capmResult = ref<CAPMResult | null>(null)

// Financial Metrics
const financialMetrics = ref<FinancialMetric[]>([])
const metricsLoading = ref(false)

// Methods
const calculateDCF = () => {
  const { freeCashFlow, growthRate, discountRate, terminalGrowth } = dcfForm

  // 简化的DCF计算逻辑
  const forecastPeriod = 5
  let presentValue = 0

  // 预测期现金流现值
  for (let i = 1; i <= forecastPeriod; i++) {
    const futureCashFlow = freeCashFlow * Math.pow(1 + growthRate / 100, i)
    const discountFactor = Math.pow(1 + discountRate / 100, i)
    presentValue += futureCashFlow / discountFactor
  }

  // 终值计算
  const terminalValue = (freeCashFlow * Math.pow(1 + growthRate / 100, forecastPeriod + 1)) /
                       ((discountRate / 100) - (terminalGrowth / 100))
  const terminalValuePresent = terminalValue / Math.pow(1 + discountRate / 100, forecastPeriod)

  const intrinsicValue = presentValue + terminalValuePresent
  const marginOfSafety = (intrinsicValue - freeCashFlow * 10) / (freeCashFlow * 10) // 假设当前市值为自由现金流的10倍

  dcfResult.value = {
    intrinsicValue,
    marginOfSafety
  }
}

const calculateCAPM = () => {
  const { riskFreeRate, marketReturn, beta } = capmForm

  const riskPremium = (marketReturn - riskFreeRate) / 100
  const expectedReturn = (riskFreeRate / 100) + beta * riskPremium

  capmResult.value = {
    expectedReturn,
    riskPremium
  }
}

const getMetricCardClass = (trend: string) => {
  return {
    'metric-up': trend === 'up',
    'metric-down': trend === 'down',
    'metric-stable': trend === 'stable'
  }
}

const loadFinancialMetrics = async () => {
  metricsLoading.value = true
  try {
    // Mock financial metrics data
    financialMetrics.value = [
      { name: 'ROE', value: '15.2%', trend: 'up' },
      { name: '毛利率', value: '42.5%', trend: 'up' },
      { name: '净利率', value: '28.3%', trend: 'stable' },
      { name: '资产负债率', value: '32.1%', trend: 'down' },
      { name: '营收增长', value: '179.2%', trend: 'up' },
      { name: '净利润增长', value: '312.3%', trend: 'up' }
    ]
  } catch (error) {
    console.error('Failed to load financial metrics:', error)
  } finally {
    metricsLoading.value = false
  }
}

onMounted(() => {
  loadFinancialMetrics()
})
</script>

<style scoped>
.analysis-tools {
  padding: 16px 0;
}

.analysis-card {
  height: 100%;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.metrics-card {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.mt-16 {
  margin-top: 16px;
}

.result-section {
  margin-top: 20px;
  padding: 16px;
  background: #f8f9fa;
  border-radius: 8px;
}

.result-section h4 {
  margin-bottom: 12px;
  color: #1f1f1f;
}

.result-item {
  display: flex;
  justify-content: space-between;
  margin-bottom: 8px;
  padding-bottom: 8px;
  border-bottom: 1px solid #e8e8e8;
}

.result-item:last-child {
  border-bottom: none;
  margin-bottom: 0;
}

.result-value {
  font-weight: bold;
}

.result-value.positive {
  color: #52c41a;
}

.result-value.negative {
  color: #ff4d4f;
}

.metrics-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
}

.metric-card {
  padding: 16px;
  border-radius: 8px;
  text-align: center;
  background: #f8f9fa;
  transition: all 0.3s ease;
}

.metric-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.metric-card.metric-up {
  border-left: 4px solid #52c41a;
}

.metric-card.metric-down {
  border-left: 4px solid #ff4d4f;
}

.metric-card.metric-stable {
  border-left: 4px solid #faad14;
}

.metric-name {
  font-size: 0.9em;
  color: #666;
  margin-bottom: 8px;
}

.metric-value {
  font-size: 1.5em;
  font-weight: bold;
  color: #1f1f1f;
  margin-bottom: 8px;
}

.metric-trend {
  font-size: 1.2em;
  font-weight: bold;
}

.metric-trend.up {
  color: #52c41a;
}

.metric-trend.down {
  color: #ff4d4f;
}

.metric-trend.stable {
  color: #faad14;
}

.no-data {
  text-align: center;
  padding: 40px 0;
  color: #999;
}
</style>