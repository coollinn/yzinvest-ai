<template>
  <div class="income-statement">
    <a-card title="利润表" class="financial-card">
      <a-spin :spinning="loading">
        <div class="no-data">
          <p>利润表数据暂未同步</p>
          <p class="hint">请点击上方"同步全部财务数据"按钮获取最新数据</p>
        </div>
      </a-spin>
    </a-card>
  </div>
</template>

<script setup lang="ts">
interface Props {
  stock: any
  loading?: boolean
}

defineProps<Props>()
</script>

<style scoped>
.income-statement {
  padding: 16px 0;
}

.financial-card {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.no-data {
  text-align: center;
  padding: 60px 0;
  color: #999;
}

.hint {
  font-size: 0.9em;
  margin-top: 8px;
  color: #666;
}
</style>