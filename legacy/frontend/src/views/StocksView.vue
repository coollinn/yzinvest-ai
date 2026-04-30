<template>
  <div class="stocks-view">
    <div class="page-header">
      <h1>股票列表</h1>
      <p>浏览和分析A股市场股票</p>
    </div>

    <!-- Search and Filters -->
    <div class="filters-section">
      <a-row :gutter="16">
        <a-col :span="8">
          <a-input-search
            v-model:value="searchQuery"
            placeholder="搜索股票代码、名称或行业"
            enter-button
            @search="handleSearch"
          />
        </a-col>
        <a-col :span="6">
          <a-select
            v-model:value="industryFilter"
            placeholder="选择行业"
            style="width: 100%"
            allow-clear
            @change="handleFilterChange"
          >
            <a-select-option v-for="industry in industries" :key="industry">
              {{ industry }}
            </a-select-option>
          </a-select>
        </a-col>
        <a-col :span="6">
          <a-select
            v-model:value="marketFilter"
            placeholder="选择市场"
            style="width: 100%"
            allow-clear
            @change="handleFilterChange"
          >
            <a-select-option value="主板">主板</a-select-option>
            <a-select-option value="创业板">创业板</a-select-option>
            <a-select-option value="科创板">科创板</a-select-option>
          </a-select>
        </a-col>
        <a-col :span="4">
          <a-button type="primary" @click="refreshStocks" :loading="loading">
            刷新
          </a-button>
        </a-col>
      </a-row>
    </div>

    <!-- Stocks Table -->
    <a-spin :spinning="loading">
      <a-table
        :data-source="stocks"
        :columns="columns"
        :pagination="pagination"
        @change="handleTableChange"
        row-key="id"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'symbol'">
            <a @click="goToStockDetail(record)">{{ record.symbol }}</a>
          </template>
          <template v-else-if="column.key === 'name'">
            <strong>{{ record.name }}</strong>
          </template>
          <template v-else-if="column.key === 'industry'">
            <a-tag :color="getIndustryColor(record.industry)">
              {{ record.industry || '未知' }}
            </a-tag>
          </template>
          <template v-else-if="column.key === 'market'">
            <a-tag :color="getMarketColor(record.market)">
              {{ record.market }}
            </a-tag>
          </template>
          <template v-else-if="column.key === 'actions'">
            <a-space>
              <a-button size="small" @click="goToStockDetail(record)">
                详情
              </a-button>
              <a-button
                v-if="authStore.isAuthenticated"
                size="small"
                type="primary"
                :loading="favoriteLoading[record.id]"
                @click="toggleFavorite(record)"
              >
                <template #icon>
                  <StarOutlined />
                </template>
                {{ isFavorite(record.id) ? '取消收藏' : '收藏' }}
              </a-button>
            </a-space>
          </template>
        </template>
      </a-table>
    </a-spin>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { stockAPI, favoritesAPI } from '../services/api'
import { StarOutlined } from '@ant-design/icons-vue'

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
}

const router = useRouter()
const authStore = useAuthStore()

const loading = ref(false)
const stocks = ref<Stock[]>([])
const searchQuery = ref('')
const industryFilter = ref('')
const marketFilter = ref('')
const favoriteLoading = reactive<{ [key: number]: boolean }>({})
const userFavorites = ref<number[]>([])

// Mock industries for demonstration
const industries = computed(() => {
  const industriesSet = new Set<string>()
  stocks.value.forEach(stock => {
    if (stock.industry) {
      industriesSet.add(stock.industry)
    }
  })
  return Array.from(industriesSet).sort()
})

// Table columns
const columns = [
  {
    title: '股票代码',
    dataIndex: 'symbol',
    key: 'symbol',
    width: 120,
  },
  {
    title: '股票名称',
    dataIndex: 'name',
    key: 'name',
    width: 150,
  },
  {
    title: '行业',
    dataIndex: 'industry',
    key: 'industry',
    width: 150,
  },
  {
    title: '市场',
    dataIndex: 'market',
    key: 'market',
    width: 100,
  },
  {
    title: '交易所',
    dataIndex: 'exchange',
    key: 'exchange',
    width: 100,
  },
  {
    title: '地区',
    dataIndex: 'area',
    key: 'area',
    width: 100,
  },
  {
    title: '上市状态',
    dataIndex: 'list_status',
    key: 'list_status',
    width: 100,
    customRender: ({ text }: { text: string }) => {
      const statusMap: { [key: string]: { text: string, color: string } } = {
        'L': { text: '上市', color: 'green' },
        'D': { text: '退市', color: 'red' },
        'P': { text: '暂停', color: 'orange' },
      }
      const status = statusMap[text] || { text: '未知', color: 'default' }
      return <a-tag color={status.color}>{status.text}</a-tag>
    }
  },
  {
    title: '操作',
    key: 'actions',
    width: 200,
  },
]

// Pagination
const pagination = reactive({
  current: 1,
  pageSize: 20,
  total: 0,
  showSizeChanger: true,
  showQuickJumper: true,
  showTotal: (total: number, range: [number, number]) =>
    `第 ${range[0]}-${range[1]} 条，共 ${total} 条`,
})

const getIndustryColor = (industry: string | undefined) => {
  if (!industry) return 'default'
  const colors = [
    'blue', 'green', 'orange', 'red', 'purple', 'cyan', 'magenta', 'volcano', 'gold', 'lime'
  ]
  const index = industry.charCodeAt(0) % colors.length
  return colors[index]
}

const getMarketColor = (market: string | undefined) => {
  const colorMap: { [key: string]: string } = {
    '主板': 'blue',
    '创业板': 'green',
    '科创板': 'orange',
    '北交所': 'purple',
  }
  return colorMap[market || ''] || 'default'
}

const goToStockDetail = (stock: Stock) => {
  router.push({ name: 'stock-detail', params: { id: stock.id } })
}

const handleSearch = () => {
  if (searchQuery.value.trim()) {
    searchStocks()
  } else {
    pagination.current = 1
    fetchStocks()
  }
}

const handleFilterChange = () => {
  pagination.current = 1
  fetchStocks()
}

const handleTableChange = (pag: any) => {
  pagination.current = pag.current
  pagination.pageSize = pag.pageSize
  fetchStocks()
}

const fetchStocks = async () => {
  try {
    loading.value = true
    const response = await stockAPI.getStocks(pagination.current, pagination.pageSize)
    stocks.value = response.data.stocks
    pagination.total = response.data.pagination.total_items

    // Load user favorites if authenticated
    if (authStore.isAuthenticated) {
      await loadUserFavorites()
    }
  } catch (error) {
    console.error('Failed to fetch stocks:', error)
    // Fallback mock data
    stocks.value = generateMockStocks()
    pagination.total = stocks.value.length
  } finally {
    loading.value = false
  }
}

const searchStocks = async () => {
  try {
    loading.value = true
    const response = await stockAPI.searchStocks(searchQuery.value, 100)
    stocks.value = response.data.stocks
    pagination.total = response.data.count
    pagination.current = 1
  } catch (error) {
    console.error('Failed to search stocks:', error)
    stocks.value = generateMockStocks().filter(stock =>
      stock.name.includes(searchQuery.value) ||
      stock.symbol.includes(searchQuery.value) ||
      (stock.industry && stock.industry.includes(searchQuery.value))
    )
    pagination.total = stocks.value.length
  } finally {
    loading.value = false
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

const isFavorite = (stockId: number) => {
  return userFavorites.value.includes(stockId)
}

const toggleFavorite = async (stock: Stock) => {
  if (!authStore.isAuthenticated) {
    router.push({ name: 'login' })
    return
  }

  try {
    favoriteLoading[stock.id] = true

    if (isFavorite(stock.id)) {
      await favoritesAPI.removeFavorite(stock.id)
      userFavorites.value = userFavorites.value.filter(id => id !== stock.id)
    } else {
      await favoritesAPI.addFavorite(stock.id)
      userFavorites.value.push(stock.id)
    }
  } catch (error) {
    console.error('Failed to toggle favorite:', error)
  } finally {
    favoriteLoading[stock.id] = false
  }
}

const refreshStocks = () => {
  pagination.current = 1
  fetchStocks()
}

// Generate mock stocks for demonstration
const generateMockStocks = (): Stock[] => {
  const mockStocks = [
    { id: 1, ts_code: '000001.SZ', symbol: '000001', name: '平安银行', industry: '银行', market: '主板', exchange: 'SZSE', area: '广东', list_status: 'L' },
    { id: 2, ts_code: '000002.SZ', symbol: '000002', name: '万科A', industry: '房地产', market: '主板', exchange: 'SZSE', area: '广东', list_status: 'L' },
    { id: 3, ts_code: '600036.SH', symbol: '600036', name: '招商银行', industry: '银行', market: '主板', exchange: 'SSE', area: '广东', list_status: 'L' },
    { id: 4, ts_code: '601318.SH', symbol: '601318', name: '中国平安', industry: '保险', market: '主板', exchange: 'SSE', area: '广东', list_status: 'L' },
    { id: 5, ts_code: '600519.SH', symbol: '600519', name: '贵州茅台', industry: '食品饮料', market: '主板', exchange: 'SSE', area: '贵州', list_status: 'L' },
    { id: 6, ts_code: '000858.SZ', symbol: '000858', name: '五粮液', industry: '食品饮料', market: '主板', exchange: 'SZSE', area: '四川', list_status: 'L' },
    { id: 7, ts_code: '002415.SZ', symbol: '002415', name: '海康威视', industry: '电子', market: '中小板', exchange: 'SZSE', area: '浙江', list_status: 'L' },
    { id: 8, ts_code: '300750.SZ', symbol: '300750', name: '宁德时代', industry: '电力设备', market: '创业板', exchange: 'SZSE', area: '福建', list_status: 'L' },
    { id: 9, ts_code: '601888.SH', symbol: '601888', name: '中国中免', industry: '商贸零售', market: '主板', exchange: 'SSE', area: '北京', list_status: 'L' },
    { id: 10, ts_code: '600276.SH', symbol: '600276', name: '恒瑞医药', industry: '医药生物', market: '主板', exchange: 'SSE', area: '江苏', list_status: 'L' },
  ]
  return mockStocks
}

onMounted(() => {
  fetchStocks()
})
</script>

<style scoped>
.stocks-view {
  max-width: 1200px;
  margin: 0 auto;
}

.page-header {
  margin-bottom: 32px;
  text-align: center;
}

.page-header h1 {
  font-size: 2.5em;
  margin-bottom: 8px;
  color: #1f1f1f;
}

.page-header p {
  font-size: 1.1em;
  color: #666;
}

.filters-section {
  margin-bottom: 24px;
  padding: 24px;
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

:deep(.ant-table) {
  background: #fff;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

:deep(.ant-table-thead > tr > th) {
  background: #fafafa;
  font-weight: 600;
}
</style>