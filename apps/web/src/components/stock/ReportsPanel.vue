<script setup lang="ts">
import { useQuery } from "@tanstack/vue-query";
import { ref, computed } from "vue";
import Button from "@/components/ui/Button.vue";
import Card from "@/components/ui/Card.vue";
import CardContent from "@/components/ui/CardContent.vue";
import CardHeader from "@/components/ui/CardHeader.vue";
import CardTitle from "@/components/ui/CardTitle.vue";
import Skeleton from "@/components/ui/Skeleton.vue";
import Badge from "@/components/ui/Badge.vue";
import { apiGet, apiPost } from "@/lib/api";
import { FileText, Download, ExternalLink } from "lucide-vue-next";

const props = defineProps<{ tsCode: string }>();

const { data, isLoading, error, refetch } = useQuery({
  queryKey: ["reports", () => props.tsCode],
  queryFn: () =>
    apiGet<{
      items: Array<{
        id: number;
        title: string;
        report_type: string;
        report_period: string;
        announcement_date: string;
        pdf_url: string;
        file_size: number;
      }>;
      count: number;
      has_synced: boolean;
    }>(`/financial/${props.tsCode}/reports`),
});

const syncing = ref(false);

async function syncReports() {
  syncing.value = true;
  try {
    await apiPost(`/financial/${props.tsCode}/reports/sync`);
    await refetch();
  } catch (e) {
    console.error(e);
  } finally {
    syncing.value = false;
  }
}

const grouped = computed(() => {
  const groups: Record<string, Array<NonNullable<typeof data.value>["items"][number]>> = {};
  for (const item of data.value?.items ?? []) {
    const type = item.report_type || "其他";
    if (!groups[type]) groups[type] = [];
    groups[type].push(item);
  }
  // 每组按公告日期降序
  for (const k in groups) groups[k].sort((a, b) => b.announcement_date.localeCompare(a.announcement_date));
  return groups;
});

const typeOrder: Record<string, number> = { 年报: 0, 半年报: 1, 一季报: 2, 三季报: 3, 摘要: 4, 审计报告: 5, 其他: 99 };

function formatSize(kb: number): string {
  if (kb >= 1024) return `${(kb / 1024).toFixed(1)} MB`;
  return `${kb} KB`;
}

function typeBadgeColor(type: string): string {
  switch (type) {
    case "年报": return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300";
    case "半年报": return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300";
    case "一季报": return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300";
    case "三季报": return "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300";
    case "摘要": return "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300";
    default: return "bg-secondary text-secondary-foreground";
  }
}
</script>

<template>
  <Card>
    <CardHeader class="flex flex-row items-center justify-between gap-2">
      <CardTitle class="text-base">财务报表 PDF</CardTitle>
      <Button :loading="syncing" size="sm" variant="outline" @click="syncReports">
        {{ data?.has_synced ? "同步最新" : "首次同步" }}
      </Button>
    </CardHeader>
    <CardContent>
      <Skeleton v-if="isLoading" class="h-64 w-full" />
      <div v-else-if="error" class="space-y-2">
        <p class="text-sm text-destructive">{{ (error as Error).message }}</p>
      </div>
      <div v-else-if="!data?.items?.length" class="space-y-3">
        <p class="text-sm text-muted-foreground">暂无报表数据，点击"首次同步"从巨潮资讯网拉取。</p>
      </div>
      <div v-else class="space-y-6">
        <div
          v-for="type in Object.keys(grouped).sort((a, b) => (typeOrder[a] ?? 99) - (typeOrder[b] ?? 99))"
          :key="type"
        >
          <h3 class="mb-2 text-sm font-medium text-muted-foreground">{{ type }}</h3>
          <div class="space-y-2">
            <div
              v-for="item in grouped[type]"
              :key="item.id"
              class="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2.5"
            >
              <div class="flex items-center gap-2.5 min-w-0">
                <FileText class="h-4 w-4 shrink-0 text-muted-foreground" />
                <div class="min-w-0">
                  <div class="truncate text-sm font-medium">{{ item.title }}</div>
                  <div class="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{{ item.announcement_date }}</span>
                    <span v-if="item.file_size">· {{ formatSize(item.file_size) }}</span>
                  </div>
                </div>
              </div>
              <div class="flex shrink-0 items-center gap-2">
                <a
                  :href="item.pdf_url"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-1 text-xs font-medium text-secondary-foreground hover:bg-secondary/80 transition-colors"
                >
                  <ExternalLink class="h-3 w-3" />
                  预览
                </a>
                <a
                  :href="item.pdf_url"
                  download
                  class="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  <Download class="h-3 w-3" />
                  下载
                </a>
              </div>
            </div>
          </div>
        </div>
        <p class="text-xs text-muted-foreground">
          共 {{ data.count }} 份报表 · 数据来源：巨潮资讯网
        </p>
      </div>
    </CardContent>
  </Card>
</template>
