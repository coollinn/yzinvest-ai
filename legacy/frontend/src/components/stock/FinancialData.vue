<template>
  <div class="financial-data">
    <a-row :gutter="16" class="mb-16">
      <a-col :span="24">
        <a-space>
          <a-button type="primary" @click="syncAllData" :loading="syncing">
            <template #icon>
              <SyncOutlined />
            </template>
            同步全部财务数据
          </a-button>
          <a-button @click="loadFinancialData">
            <template #icon>
              <ReloadOutlined />
            </template>
            刷新数据
          </a-button>
        </a-space>
      </a-col>
    </a-row>

    <a-tabs v-model:activeKey="activeTab">
      <a-tab-pane key="balance" tab="资产负债表">
        <BalanceSheet :stock="stock" :loading="loading" />
      </a-tab-pane>

      <a-tab-pane key="income" tab="利润表">
        <IncomeStatement :stock="stock" :loading="loading" />
      </a-tab-pane>

      <a-tab-pane key="cashflow" tab="现金流量表">
        <CashFlowStatement :stock="stock" :loading="loading" />
      </a-tab-pane>

      <a-tab-pane key="indicators" tab="主要指标">
        <MainIndicators :stock="stock" :loading="loading" />
      </a-tab-pane>
    </a-tabs>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { SyncOutlined, ReloadOutlined } from '@ant-design/icons-vue'
import BalanceSheet from './BalanceSheet.vue'
import IncomeStatement from './IncomeStatement.vue'
import CashFlowStatement from './CashFlowStatement.vue'
import MainIndicators from './MainIndicators.vue'

interface Props {
  stock: any
  loading?: boolean
}

defineProps<Props>()

const emit = defineEmits<{
  sync: []
}>()

const activeTab = ref('balance')
const syncing = ref(false)

const syncAllData = async () => {
  syncing.value = true
  try {
    // Trigger sync in parent component
    emit('sync')
  } catch (error) {
    console.error('Failed to sync financial data:', error)
  } finally {
    syncing.value = false
  }
}

const loadFinancialData = () => {
  // This would reload all financial data
  emit('sync')
}
</script>

<style scoped>
.financial-data {
  padding: 16px 0;
}

.mb-16 {
  margin-bottom: 16px;
}
</style>