<template>
  <div class="home-view">
    <!-- Hero Section -->
    <a-row class="hero-section" type="flex" align="middle">
      <a-col :span="12">
        <h1 class="hero-title">YZInvest AI</h1>
        <h2 class="hero-subtitle">智能股票分析平台</h2>
        <p class="hero-description">
          专业的股票数据分析工具，提供DCF估值、CAPM模型计算、技术分析等高级功能，
          帮助您做出更明智的投资决策。
        </p>
        <div class="hero-actions">
          <a-button type="primary" size="large" @click="goToStocks">
            开始分析
          </a-button>
          <a-button size="large" style="margin-left: 16px" @click="goToRandomStocks">
            随机探索
          </a-button>
        </div>
      </a-col>
      <a-col :span="12">
        <div class="hero-image">
          <!-- Placeholder for stock chart illustration -->
          <div class="chart-placeholder">
            📈
          </div>
        </div>
      </a-col>
    </a-row>

    <!-- Features Section -->
    <div class="features-section">
      <h2 class="section-title">核心功能</h2>
      <a-row :gutter="24">
        <a-col :span="8">
          <a-card class="feature-card">
            <template #cover>
              <div class="feature-icon analysis">📊</div>
            </template>
            <a-card-meta
              title="深度分析"
              description="提供DCF估值模型、CAPM模型、技术指标等多维度分析工具"
            />
          </a-card>
        </a-col>
        <a-col :span="8">
          <a-card class="feature-card">
            <template #cover>
              <div class="feature-icon data">📈</div>
            </template>
            <a-card-meta
              title="实时数据"
              description="整合Tushare数据源，提供实时股票行情和财务数据"
            />
          </a-card>
        </a-col>
        <a-col :span="8">
          <a-card class="feature-card">
            <template #cover>
              <div class="feature-icon notes">📝</div>
            </template>
            <a-card-meta
              title="投资笔记"
              description="记录您的投资分析和决策过程，构建个人知识库"
            />
          </a-card>
        </a-col>
      </a-row>
    </div>

    <!-- Random Stocks Section -->
    <div class="stocks-section">
      <div class="section-header">
        <h2 class="section-title">热门股票推荐</h2>
        <a-button type="link" @click="refreshRandomStocks">
          刷新
        </a-button>
      </div>

      <a-spin :spinning="loading">
        <a-row :gutter="16">
          <a-col
            v-for="stock in randomStocks"
            :key="stock.id"
            :span="6"
          >
            <a-card
              class="stock-card"
              hoverable
              @click="goToStockDetail(stock)"
            >
              <template #cover>
                <div class="stock-trend">
                  <trend-chart :data="generateMockData()" />
                </div>
              </template>
              <a-card-meta
                :title="stock.name"
                :description="`${stock.symbol} · ${stock.industry || '未知行业'}`"
              />
              <div class="stock-price">
                <span class="price">¥{{ getMockPrice(stock.id) }}</span>
                <span
                  class="change"
                  :class="getChangeClass(stock.id)"
                >
                  {{ getMockChange(stock.id) }}%
                </span>
              </div>
            </a-card>
          </a-col>
        </a-row>
      </a-spin>
    </div>

    <!-- Quick Actions -->
    <div class="quick-actions">
      <h2 class="section-title">快速操作</h2>
      <a-row :gutter="16">
        <a-col :span="6">
          <a-card hoverable class="action-card" @click="goToStocks">
            <div class="action-content">
              <div class="action-icon">🔍</div>
              <h3>股票搜索</h3>
              <p>快速查找股票信息</p>
            </div>
          </a-card>
        </a-col>
        <a-col :span="6">
          <a-card hoverable class="action-card" @click="goToFavorites">
            <div class="action-content">
              <div class="action-icon">⭐</div>
              <h3>收藏管理</h3>
              <p>查看关注股票</p>
            </div>
          </a-card>
        </a-col>
        <a-col :span="6">
          <a-card hoverable class="action-card" @click="goToNotes">
            <div class="action-content">
              <div class="action-icon">📋</div>
              <h3>投资笔记</h3>
              <p>管理分析记录</p>
            </div>
          </a-card>
        </a-col>
        <a-col :span="6">
          <a-card hoverable class="action-card" @click="goToAdmin">
            <div class="action-content">
              <div class="action-icon">⚙️</div>
              <h3>系统管理</h3>
              <p>数据同步设置</p>
            </div>
          </a-card>
        </a-col>
      </a-row>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { stockAPI } from '../services/api'

interface Stock {
  id: number
  ts_code: string
  symbol: string
  name: string
  industry?: string
  market?: string
}

const router = useRouter()
const loading = ref(false)
const randomStocks = ref<Stock[]>([])

// Mock data for demonstration
const generateMockData = () => {
  return Array.from({ length: 10 }, (_, i) => ({
    x: i,
    y: Math.random() * 100 + 50
  }))
}

const getMockPrice = (id: number) => {
  const base = (id * 123.45) % 100 + 10
  return base.toFixed(2)
}

const getMockChange = (id: number) => {
  const change = (id * 0.123) % 0.1 - 0.05
  return (change * 100).toFixed(2)
}

const getChangeClass = (id: number) => {
  const change = parseFloat(getMockChange(id))
  return change >= 0 ? 'positive' : 'negative'
}

const goToStocks = () => {
  router.push({ name: 'stocks' })
}

const goToStockDetail = (stock: Stock) => {
  router.push({ name: 'stock-detail', params: { id: stock.id } })
}

const goToFavorites = () => {
  router.push({ name: 'favorites' })
}

const goToNotes = () => {
  router.push({ name: 'notes' })
}

const goToAdmin = () => {
  router.push({ name: 'admin' })
}

const goToRandomStocks = () => {
  refreshRandomStocks()
}

const refreshRandomStocks = async () => {
  try {
    loading.value = true
    const response = await stockAPI.getRandomStocks(8)
    randomStocks.value = response.data.stocks
  } catch (error) {
    console.error('Failed to fetch random stocks:', error)
    // Fallback mock data
    randomStocks.value = [
      { id: 1, ts_code: '000001.SZ', symbol: '000001', name: '平安银行', industry: '银行' },
      { id: 2, ts_code: '000002.SZ', symbol: '000002', name: '万科A', industry: '房地产' },
      { id: 3, ts_code: '600036.SH', symbol: '600036', name: '招商银行', industry: '银行' },
      { id: 4, ts_code: '601318.SH', symbol: '601318', name: '中国平安', industry: '保险' },
      { id: 5, ts_code: '600519.SH', symbol: '600519', name: '贵州茅台', industry: '食品饮料' },
      { id: 6, ts_code: '000858.SZ', symbol: '000858', name: '五粮液', industry: '食品饮料' },
      { id: 7, ts_code: '002415.SZ', symbol: '002415', name: '海康威视', industry: '电子' },
      { id: 8, ts_code: '300750.SZ', symbol: '300750', name: '宁德时代', industry: '电力设备' },
    ]
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  refreshRandomStocks()
})

// Simple trend chart component for demonstration
const TrendChart = {
  props: ['data'],
  template: `
    <div class="trend-chart">
      <svg width="100%" height="40" viewBox="0 0 100 40">
        <path
          :d="generatePath"
          fill="none"
          stroke="#1890ff"
          stroke-width="2"
        />
      </svg>
    </div>
  `,
  computed: {
    generatePath() {
      const points = this.data.map((point: any, index: number) => {
        const x = (index / (this.data.length - 1)) * 100
        const y = 40 - (point.y / 150) * 40 // Scale to fit 0-150 range in 40px height
        return `${x},${y}`
      })
      return `M ${points.join(' L ')}`
    }
  }
}
</script>

<style scoped>
.home-view {
  max-width: 1200px;
  margin: 0 auto;
}

.hero-section {
  padding: 80px 0;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 12px;
  margin-bottom: 60px;
  color: white;
}

.hero-title {
  font-size: 3.5em;
  font-weight: bold;
  margin-bottom: 16px;
  color: white;
}

.hero-subtitle {
  font-size: 1.8em;
  margin-bottom: 24px;
  color: rgba(255, 255, 255, 0.9);
}

.hero-description {
  font-size: 1.2em;
  margin-bottom: 32px;
  color: rgba(255, 255, 255, 0.8);
  line-height: 1.6;
}

.hero-image {
  text-align: center;
}

.chart-placeholder {
  font-size: 8em;
  opacity: 0.8;
}

.features-section,
.stocks-section,
.quick-actions {
  margin-bottom: 60px;
}

.section-title {
  font-size: 2em;
  margin-bottom: 32px;
  text-align: center;
  color: #1f1f1f;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.feature-card {
  text-align: center;
  height: 200px;
}

.feature-icon {
  font-size: 3em;
  padding: 20px;
  text-align: center;
}

.stock-card {
  cursor: pointer;
  transition: transform 0.2s;
}

.stock-card:hover {
  transform: translateY(-4px);
}

.stock-trend {
  padding: 16px;
  background: #f8f9fa;
}

.stock-price {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #f0f0f0;
}

.price {
  font-size: 1.2em;
  font-weight: bold;
  color: #1f1f1f;
}

.change {
  font-weight: bold;
}

.change.positive {
  color: #52c41a;
}

.change.negative {
  color: #ff4d4f;
}

.action-card {
  text-align: center;
  cursor: pointer;
  transition: all 0.3s;
}

.action-card:hover {
  border-color: #1890ff;
  box-shadow: 0 4px 12px rgba(24, 144, 255, 0.2);
}

.action-content {
  padding: 24px;
}

.action-icon {
  font-size: 3em;
  margin-bottom: 16px;
}

.action-content h3 {
  margin-bottom: 8px;
  color: #1f1f1f;
}

.action-content p {
  color: #666;
  margin: 0;
}

.trend-chart {
  width: 100%;
  height: 40px;
}
</style>