<script setup lang="ts">
import { computed } from "vue";
import { FileText } from "lucide-vue-next";
import { RouterLink } from "vue-router";
import Badge from "@/components/ui/Badge.vue";
import Card from "@/components/ui/Card.vue";
import CardContent from "@/components/ui/CardContent.vue";
import Skeleton from "@/components/ui/Skeleton.vue";
import { useAuthStore } from "@/stores/auth";
import { getAllLocalNotes } from "@/composables/useLocalStorage";
import { apiGet } from "@/lib/api";
import { useQuery } from "@tanstack/vue-query";
import type { Note, ListResponse } from "@yzinvest/shared";

const auth = useAuthStore();

const { data, isLoading } = useQuery({
  queryKey: ["my-notes"],
  queryFn: () => apiGet<ListResponse<Note>>("/notes?limit=50"),
  enabled: () => auth.isAuthenticated,
});

const localNotes = computed(() => {
  if (auth.isAuthenticated) return [];
  return getAllLocalNotes().sort(
    (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
  );
});

const displayItems = computed(() => {
  if (auth.isAuthenticated) return data.value?.items ?? [];
  return localNotes.value;
});

const displayLoading = computed(() => auth.isAuthenticated && isLoading.value);

const STAR = "★";
function ratingDisplay(r: number | null | undefined) {
  if (!r) return null;
  return STAR.repeat(r);
}
</script>

<template>
  <section class="space-y-4">
    <header>
      <h1 class="text-2xl font-bold tracking-tight">我的笔记</h1>
      <p class="text-sm text-muted-foreground">
        <template v-if="auth.isAuthenticated">所有股票的投研笔记</template>
        <template v-else>未登录状态下笔记仅保存在本地，登录后可同步</template>
      </p>
    </header>

    <div v-if="displayLoading" class="space-y-3">
      <Skeleton v-for="i in 4" :key="i" class="h-28" />
    </div>
    <Card v-else-if="!displayItems.length">
      <CardContent class="py-16 text-center">
        <FileText class="mx-auto h-8 w-8 text-muted-foreground" />
        <p class="mt-3 text-sm text-muted-foreground">还没有笔记。在股票详情页 → 笔记 标签页可以添加。</p>
      </CardContent>
    </Card>
    <div v-else class="space-y-3">
      <RouterLink
        v-for="n in displayItems"
        :key="n.ts_code"
        :to="`/stocks/${n.ts_code}`"
        class="block rounded-lg border border-border bg-card p-4 transition-colors hover:border-foreground/20"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="flex-1">
            <div class="flex items-center gap-2">
              <span class="font-mono text-xs text-muted-foreground">{{ n.ts_code }}</span>
              <Badge v-if="n.analysis_type" variant="outline">{{ n.analysis_type }}</Badge>
              <span v-if="n.rating" class="text-xs text-warning">{{ ratingDisplay(n.rating) }}</span>
            </div>
            <p class="mt-2 line-clamp-3 whitespace-pre-wrap text-sm">{{ n.content }}</p>
            <div v-if="n.tags?.length" class="mt-2 flex flex-wrap gap-1">
              <Badge v-for="t in n.tags" :key="t" variant="secondary" class="text-xs">{{ t }}</Badge>
            </div>
          </div>
          <span class="whitespace-nowrap text-xs text-muted-foreground">
            {{ new Date((n as any).updated_at).toLocaleDateString("zh-CN") }}
          </span>
        </div>
      </RouterLink>
    </div>
  </section>
</template>
