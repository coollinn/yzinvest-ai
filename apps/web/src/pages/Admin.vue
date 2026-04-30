<script setup lang="ts">
import { useQuery } from "@tanstack/vue-query";
import Button from "@/components/ui/Button.vue";
import Card from "@/components/ui/Card.vue";
import CardContent from "@/components/ui/CardContent.vue";
import CardHeader from "@/components/ui/CardHeader.vue";
import CardTitle from "@/components/ui/CardTitle.vue";
import { apiGet, apiPost } from "@/lib/api";
import { ref } from "vue";

const { data, refetch } = useQuery({
  queryKey: ["admin-dashboard"],
  queryFn: () =>
    apiGet<{
      user_stats: { total_users: number; total_notes: number; total_favorites: number };
      system_stats: { total_stocks: number };
    }>("/admin/dashboard"),
});

const syncing = ref(false);
const message = ref("");

async function syncStocks() {
  syncing.value = true;
  message.value = "";
  try {
    const r = await apiPost<{ count: number }>("/admin/sync/stocks");
    message.value = `已同步 ${r.count} 支股票`;
    await refetch();
  } catch (e) {
    message.value = (e as Error).message;
  } finally {
    syncing.value = false;
  }
}
</script>

<template>
  <section class="space-y-6">
    <h1 class="text-2xl font-bold tracking-tight">管理后台</h1>

    <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader class="pb-2">
          <CardTitle class="text-sm font-medium text-muted-foreground">用户数</CardTitle>
        </CardHeader>
        <CardContent>
          <div class="font-mono text-2xl font-bold">{{ data?.user_stats.total_users ?? "—" }}</div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader class="pb-2">
          <CardTitle class="text-sm font-medium text-muted-foreground">股票数</CardTitle>
        </CardHeader>
        <CardContent>
          <div class="font-mono text-2xl font-bold">{{ data?.system_stats.total_stocks ?? "—" }}</div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader class="pb-2">
          <CardTitle class="text-sm font-medium text-muted-foreground">笔记数</CardTitle>
        </CardHeader>
        <CardContent>
          <div class="font-mono text-2xl font-bold">{{ data?.user_stats.total_notes ?? "—" }}</div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader class="pb-2">
          <CardTitle class="text-sm font-medium text-muted-foreground">收藏数</CardTitle>
        </CardHeader>
        <CardContent>
          <div class="font-mono text-2xl font-bold">{{ data?.user_stats.total_favorites ?? "—" }}</div>
        </CardContent>
      </Card>
    </div>

    <Card>
      <CardHeader>
        <CardTitle>数据同步</CardTitle>
      </CardHeader>
      <CardContent class="space-y-3">
        <p class="text-sm text-muted-foreground">
          手动触发 Tushare stock_basic 全量同步。后台 Cron 每天 16:30 自动跑一次。
        </p>
        <div class="flex items-center gap-3">
          <Button :loading="syncing" @click="syncStocks">同步股票池</Button>
          <p v-if="message" class="text-sm text-muted-foreground">{{ message }}</p>
        </div>
      </CardContent>
    </Card>
  </section>
</template>
