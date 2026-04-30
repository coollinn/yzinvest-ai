<template>
  <div class="stock-detail-view" v-if="stock">
    <!-- Stock Header -->
    <div class="stock-header">
      <a-row type="flex" align="middle" :gutter="16">
        <a-col :span="16">
          <h1 class="stock-name">{{ stock.name }}</h1>
          <p class="stock-info">
            <span class="stock-symbol">{{ stock.symbol }}</span>
            <a-tag :color="getMarketColor(stock.market)">{{ stock.market }}</a-tag>
            <a-tag :color="getIndustryColor(stock.industry)">{{ stock.industry }}</a-tag>
            <span class="stock-exchange">{{ stock.exchange }}</span>
          </p>
        </a-col>
        <a-col :span="8" class="text-right">
          <a-space>
            <a-button
              v-if="authStore.isAuthenticated"
              type="primary"
              :loading="favoriteLoading"
              @click="toggleFavorite"
            >
              <template #icon>
                <StarOutlined />
              </template>
              {{ isFavorite ? '取消收藏' : '收藏' }}
            </a-button>
            <a-button @click="refreshData">
              <template #icon>
                <ReloadOutlined />
              </template>
              刷新
            </a-button>
          </a-space>
        </a-col>
      </a-row>
    </div>

    <!-- Basic Info and Price -->
    <a-row :gutter="16" class="mb-24">
      <a-col :span="8">
        <a-card title="基本信息" class="info-card">
          <div class="info-item">
            <span class="label">股票代码:</span>
            <span class="value">{{ stock.ts_code }}</span>
          </div>
          <div class="info-item">
            <span class="label">上市状态:</span>
            <a-tag :color="getStatusColor(stock.list_status)">
              {{ getStatusText(stock.list_status) }}
            </a-tag>
          </div>
          <div class="info-item">
            <span class="label">上市日期:</span>
            <span class="value">{{ formatDate(stock.list_date) }}</span>
          </div>
          <div class="info-item">
            <span class="label">所属地区:</span>
            <span class="value">{{ stock.area || '未知' }}</span>
          </div>
          <div class="info-item">
            <span class="label">公司全称:</span>
            <span class="value">{{ stock.fullname || stock.name }}</span>
          </div>
        </a-card>
      </a-col>

      <a-col :span="8">
        <a-card title="价格信息" class="price-card">
          <div class="price-display">
            <div class="current-price">¥{{ currentPrice }}</div>
            <div class="price-change" :class="priceChangeClass">
              {{ priceChange }} ({{ priceChangePercent }}%)
            </div>
          </div>
          <div class="price-details">
            <div class="price-item">
              <span>开盘:</span>
              <span>¥{{ dailyData.open || '--' }}</span>
            </div>
            <div class="price-item">
              <span>最高:</span>
              <span>¥{{ dailyData.high || '--' }}</span>
            </div>
            <div class="price-item">
              <span>最低:</span>
              <span>¥{{ dailyData.low || '--' }}</span>
            </div>
            <div class="price-item">
              <span>成交量:</span>
              <span>{{ formatVolume(dailyData.vol) }}</span>
            </div>
          </div>
        </a-card>
      </a-col>

      <a-col :span="8">
        <a-card title="财务概览" class="financial-card">
          <a-spin :spinning="financialLoading">
            <div v-if="financialOverview.key_metrics">
              <div class="metric-item" v-for="(metric, key) in financialOverview.key_metrics" :key="key">
                <span class="metric-label">{{ getMetricLabel(key) }}:</span>
                <span class="metric-value" :class="getMetricValueClass(key, metric.value)">
                  {{ formatMetricValue(key, metric.value) }}
                </span>
              </div>
            </div>
            <div v-else class="no-data">
              <a-button type="link" @click="syncFinancialData">
                同步财务数据
              </a-button>
            </div>
          </a-spin>
        </a-card>
      </a-col>
    </a-row>

    <!-- Tabs -->
    <a-tabs v-model:activeKey="activeTab" class="detail-tabs">
      <a-tab-pane key="analysis" tab="分析工具">
        <AnalysisTools :stock="stock" />
      </a-tab-pane>

      <a-tab-pane key="financial" tab="财务数据">
        <FinancialData
          :stock="stock"
          :loading="financialLoading"
          @sync="syncFinancialData"
        />
      </a-tab-pane>

      <a-tab-pane key="daily" tab="日线数据">
        <DailyData :stock="stock" />
      </a-tab-pane>

      <a-tab-pane key="notes" tab="投资笔记">
        <StockNotes :stock="stock" />
      </a-tab-pane>
    </a-tabs>
  </div>

  <div v-else class="loading-container">
    <a-spin size="large" />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, computed } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { stockAPI, favoritesAPI, financialAPI } from '../services/api'
import { StarOutlined, ReloadOutlined } from '@ant-design/icons-vue'
import AnalysisTools from '../components/stock/AnalysisTools.vue'
import FinancialData from '../components/stock/FinancialData.vue'
import DailyData from '../components/stock/DailyData.vue'
import StockNotes from '../components/stock/StockNotes.vue'

interface Stock {
  id: number
  ts_code: string
  symbol: string
  name: string
  area?: string
  industry?: string
  market?: string
  exchange?: string
  list_status?: string
  list_date?: string
  fullname?: string
}

interface DailyData {
  open?: number
  high?: number
  low?: number
  close?: number
  pre_close?: number
  change?: number
  pct_chg?: number
  vol?: number
  amount?: number
}

interface FinancialOverview {
  key_metrics?: {
    [key: string]: {
      value: number
      unit: string
      report_date: string
    }
  }
}

const route = useRoute()
const authStore = useAuthStore()

const stock = ref<Stock | null>(null)
const dailyData = reactive<DailyData>({})
const financialOverview = reactive<FinancialOverview>({})
const activeTab = ref('analysis')
const loading = ref(false)
const financialLoading = ref(false)
const favoriteLoading = ref(false)
const userFavorites = ref<number[]>([])

// Computed properties
const currentPrice = computed(() => dailyData.close || 0)
const priceChange = computed(() => dailyData.change || 0)
const priceChangePercent = computed(() => dailyData.pct_chg ? (dailyData.pct_chg * 100).toFixed(2) : '0.00')
const priceChangeClass = computed(() => priceChange.value >= 0 ? 'positive' : 'negative')
const isFavorite = computed(() => stock.value ? userFavorites.value.includes(stock.value.id) : false)

// Methods
const getMarketColor = (market: string | undefined) => {
  const colorMap: { [key: string]: string } = {
    '主板': 'blue',
    '创业板': 'green',
    '科创板': 'orange',
    '北交所': 'purple',
  }
  return colorMap[market || ''] || 'default'
}

const getIndustryColor = (industry: string | undefined) => {
  if (!industry) return 'default'
  const colors = ['blue', 'green', 'orange', 'red', 'purple', 'cyan', 'magenta', 'volcano', 'gold', 'lime']
  const index = industry.charCodeAt(0) % colors.length
  return colors[index]
}

const getStatusColor = (status: string | undefined) => {
  const statusMap: { [key: string]: string } = {
    'L': 'green',
    'D': 'red',
    'P': 'orange',
  }
  return statusMap[status || ''] || 'default'
}

const getStatusText = (status: string | undefined) => {
  const statusMap: { [key: string]: string } = {
    'L': '上市',
    'D': '退市',
    'P': '暂停',
  }
  return statusMap[status || ''] || '未知'
}

const formatDate = (dateStr: string | undefined) => {
  if (!dateStr) return '--'
  return `${dateStr.slice(0,4)}-${dateStr.slice(4,6)}-${dateStr.slice(6,8)}`
}

const formatVolume = (vol: number | undefined) => {
  if (!vol) return '--'
  if (vol >= 100000000) return (vol / 100000000).toFixed(2) + '亿'
  if (vol >= 10000) return (vol / 10000).toFixed(2) + '万'
  return vol.toString()
}

const getMetricLabel = (key: string) => {
  const labelMap: { [key: string]: string } = {
    '基本每股收益': '每股收益',
    '每股净资产': '每股净资产',
    '净利润增长率': '净利润增长',
    '营业总收入增长率': '营收增长',
    '加权净资产收益率': 'ROE'
  }
  return labelMap[key] || key
}

const getMetricValueClass = (key: string, value: number) => {
  if (key.includes('增长') || key.includes('收益率')) {
    return value >= 0 ? 'positive' : 'negative'
  }
  return ''
}

const formatMetricValue = (key: string, value: number) => {
  if (key.includes('增长') || key.includes('收益率')) {
    return (value * 100).toFixed(2) + '%'
  }
  return value?.toFixed(2) || '--'
}

// API calls
const fetchStockData = async () => {
  try {
    loading.value = true
    const stockId = route.params.id as string
    const response = await stockAPI.getStockDetail(stockId)
    stock.value = response.data.stock

    // Mock daily data for demonstration
    Object.assign(dailyData, {
      open: 15.5,
      high: 16.2,
      low: 15.3,
      close: response.data.analysis_data.current_price || 15.8,
      pre_close: 15.6,
      change: 0.2,
      pct_chg: 0.0128,
      vol: 45000000,
      amount: 710000000
    })

    // Load financial overview
    await fetchFinancialOverview()

    // Load user favorites if authenticated
    if (authStore.isAuthenticated) {
      await loadUserFavorites()
    }
  } catch (error) {
    console.error('Failed to fetch stock data:', error)
  } finally {
    loading.value = false
  }
}

const fetchFinancialOverview = async () => {
  try {
    financialLoading.value = true
    const response = await financialAPI.getFinancialOverview(stock.value!.ts_code)
    Object.assign(financialOverview, response.data)
  } catch (error) {
    console.error('Failed to fetch financial overview:', error)
    // Initialize empty overview
    Object.assign(financialOverview, { key_metrics: {} })
  } finally {
    financialLoading.value = false
  }
}

const syncFinancialData = async () => {
  try {
    financialLoading.value = true
    await financialAPI.syncFinancialData(stock.value!.ts_code, 'main_indicators')
    await fetchFinancialOverview()
  } catch (error) {
    console.error('Failed to sync financial data:', error)
  } finally {
    financialLoading.value = false
  }
}

const loadUserFavorites = async () => {
  try {
    const response = await favoritesAPI.getFavorites()
    userFavorites.value = response.data.favorites.map((fav: any) => fav.stock_id)
  } catch (error) {
    console.error('Failed to load favorites:', error)
  }
}

const toggleFavorite = async () => {
  if (!authStore.isAuthenticated || !stock.value) return

  try {
    favoriteLoading.value = true
    if (isFavorite.value) {
      await favoritesAPI.removeFavorite(stock.value.id)
      userFavorites.value = userFavorites.value.filter(id => id !== stock.value!.id)
    } else {
      await favoritesAPI.addFavorite(stock.value.id)
      userFavorites.value.push(stock.value.id)
    }
  } catch (error) {
    console.error('Failed to toggle favorite:', error)
  } finally {
    favoriteLoading.value = false
  }
}

const refreshData = () => {
  fetchStockData()
}

onMounted(() => {
  fetchStockData()
})
</script>

<style scoped>
.stock-detail-view {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 16px;
}

.stock-header {
  background: #fff;
  padding: 24px;
  border-radius: 8px;
  margin-bottom: 24px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.stock-name {
  font-size: 2em;
  margin-bottom: 8px;
  color: #1f1f1f;
}

.stock-info {
  margin: 0;
  color: #666;
}

.stock-symbol {
  font-weight: bold;
  margin-right: 12px;
}

.stock-exchange {
  margin-left: 12px;
  color: #999;
}

.text-right {
  text-align: right;
}

.mb-24 {
  margin-bottom: 24px;
}

.info-card,
.price-card,
.financial-card {
  height: 100%;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.info-item {
  display: flex;
  justify-content: space-between;
  margin-bottom: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid #f0f0f0;
}

.info-item:last-child {
  border-bottom: none;
  margin-bottom: 0;
}

.label {
  color: #666;
  font-weight: 500;
}

.value {
  color: #1f1f1f;
  font-weight: 500;
}

.price-display {
  text-align: center;
  margin-bottom: 20px;
  padding: 16px;
  background: #f8f9fa;
  border-radius: 8px;
}

.current-price {
  font-size: 2.5em;
  font-weight: bold;
  color: #1f1f1f;
  margin-bottom: 8px;
}

.price-change {
  font-size: 1.2em;
  font-weight: bold;
}

.price-change.positive {
  color: #52c41a;
}

.price-change.negative {
  color: #ff4d4f;
}

.price-details {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.price-item {
  display: flex;
  justify-content: space-between;
  padding: 8px 0;
  border-bottom: 1px solid #f0f0f0;
}

.price-item:last-child {
  border-bottom: none;
}

.metric-item {
  display: flex;
  justify-content: space-between;
  margin-bottom: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid #f0f0f0;
}

.metric-item:last-child {
  border-bottom: none;
  margin-bottom: 0;
}

.metric-label {
  color: #666;
  font-weight: 500;
}

.metric-value {
  font-weight: bold;
}

.metric-value.positive {
  color: #52c41a;
}

.metric-value.negative {
  color: #ff4d4f;
}

.no-data {
  text-align: center;
  padding: 40px 0;
  color: #999;
}

.detail-tabs {
  background: #fff;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.loading-container {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 400px;
}
</style>