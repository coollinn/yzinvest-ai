<template>
  <div class="daily-data">
    <a-card title="日线数据" class="daily-card">
      <a-spin :spinning="loading">
        <div v-if="dailyData.length > 0">
          <a-table
            :dataSource="dailyData"
            :columns="columns"
            :pagination="false"
            size="small"
          />
        </div>
        <div v-else class="no-data">
          <p>暂无日线数据</p>
        </div>
      </a-spin>
    </a-card>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'

interface Props {
  stock: any
}

defineProps<Props>()

const loading = ref(false)
const dailyData = ref<any[]>([])

const columns = [
  {
    title: '日期',
    dataIndex: 'trade_date',
    key: 'trade_date',
  },
  {
    title: '开盘',
    dataIndex: 'open',
    key: 'open',
  },
  {
    title: '最高',
    dataIndex: 'high',
    key: 'high',
  },
  {
    title: '最低',
    dataIndex: 'low',
    key: 'low',
  },
  {
    title: '收盘',
    dataIndex: 'close',
    key: 'close',
  },
  {
    title: '涨跌幅',
    dataIndex: 'pct_chg',
    key: 'pct_chg',
    render: (value: number) => `${(value * 100).toFixed(2)}%`
  },
  {
    title: '成交量',
    dataIndex: 'vol',
    key: 'vol',
    render: (value: number) => value ? (value / 10000).toFixed(2) + '万' : '-'
  }
]

onMounted(() => {
  // Mock data for demonstration
  dailyData.value = [
    {
      trade_date: '2024-01-15',
      open: 15.5,
      high: 16.2,
      low: 15.3,
      close: 15.8,
      pct_chg: 0.0128,
      vol: 45000000
    },
    {
      trade_date: '2024-01-14',
      open: 15.6,
      high: 15.9,
      low: 15.4,
      close: 15.6,
      pct_chg: -0.0064,
      vol: 38000000
    },
    {
      trade_date: '2024-01-13',
      open: 15.7,
      high: 15.8,
      low: 15.5,
      close: 15.7,
      pct_chg: 0.0064,
      vol: 42000000
    }
  ]
})
</script>

<style scoped>
.daily-data {
  padding: 16px 0;
}

.daily-card {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.no-data {
  text-align: center;
  padding: 40px 0;
  color: #999;
}
</style>