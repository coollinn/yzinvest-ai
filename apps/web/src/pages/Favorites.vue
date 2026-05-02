<script setup lang="ts">
import { useQuery, useQueryClient } from "@tanstack/vue-query";
import { computed } from "vue";
import { Star, Trash2 } from "lucide-vue-next";
import { RouterLink } from "vue-router";
import Button from "@/components/ui/Button.vue";
import Card from "@/components/ui/Card.vue";
import CardContent from "@/components/ui/CardContent.vue";
import Skeleton from "@/components/ui/Skeleton.vue";
import { apiDelete, apiGet } from "@/lib/api";
import { useAuthStore } from "@/stores/auth";
import {
  getLocalFavoriteTsCodes,
  removeLocalFavorite,
} from "@/composables/useLocalStorage";
import type { Favorite, Stock } from "@yzinvest/shared";

interface FavoriteWithStock extends Favorite {
  stock: Stock | null;
}

const auth = useAuthStore();
const qc = useQueryClient();

const { data, isLoading, refetch } = useQuery({
  queryKey: ["favorites"],
  queryFn: () => apiGet<{ items: FavoriteWithStock[] }>("/favorites"),
  enabled: () => auth.isAuthenticated,
});

const localTsCodes = computed(() => getLocalFavoriteTsCodes());

const { data: localQuotes } = useQuery({
  queryKey: ["local-fav-stocks", localTsCodes],
  queryFn: () =>
    apiGet<{ items: Array<{ ts_code: string; name: string; symbol?: string; industry?: string }> }>(
      `/stocks/quotes?ts_codes=${localTsCodes.value.join(",")}`
    ),
  enabled: () => !auth.isAuthenticated && localTsCodes.value.length > 0,
});

const localFavorites = computed(() => {
  return localTsCodes.value.map((ts_code) => ({
    ts_code,
    stock:
      localQuotes.value?.items?.find((s) => s.ts_code === ts_code) ?? null,
  }));
});

const displayItems = computed(() => {
  if (auth.isAuthenticated) return data.value?.items ?? [];
  return localFavorites.value;
});

const displayLoading = computed(() => auth.isAuthenticated && isLoading.value);

async function remove(ts_code: string) {
  if (!auth.isAuthenticated) {
    removeLocalFavorite(ts_code);
    qc.invalidateQueries({ queryKey: ["local-fav-stocks"] });
    return;
  }
  await apiDelete(`/favorites/${ts_code}`);
  await refetch();
  qc.invalidateQueries({ queryKey: ["fav-check"] });
}
</script>

<template>
  <section class="space-y-4">
    <header>
      <h1 class="text-2xl font-bold tracking-tight">收藏夹</h1>
      <p class="text-sm text-muted-foreground">
        <template v-if="auth.isAuthenticated">在股票详情页点击"加入收藏"添加</template>
        <template v-else>未登录状态下收藏仅保存在本地，登录后可同步</template>
      </p>
    </header>

    <div v-if="displayLoading" class="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
      <Skeleton v-for="i in 6" :key="i" class="h-24" />
    </div>
    <Card v-else-if="!displayItems.length">
      <CardContent class="py-16 text-center">
        <Star class="mx-auto h-8 w-8 text-muted-foreground" />
        <p class="mt-3 text-sm text-muted-foreground">还没有收藏的股票</p>
        <RouterLink
          to="/stocks"
          class="mt-4 inline-flex items-center rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-secondary"
        >
          去浏览股票库
        </RouterLink>
      </CardContent>
    </Card>
    <div v-else class="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
      <Card v-for="f in displayItems" :key="f.ts_code">
        <CardContent class="flex items-center justify-between p-4">
          <RouterLink :to="`/stocks/${f.ts_code}`" class="block flex-1 hover:underline">
            <div class="flex items-center gap-2">
              <span class="font-mono text-xs text-muted-foreground">{{ f.stock?.symbol ?? f.ts_code }}</span>
              <span class="font-medium">{{ f.stock?.name ?? "—" }}</span>
            </div>
            <div class="mt-1 truncate text-xs text-muted-foreground">{{ f.stock?.industry ?? "" }}</div>
          </RouterLink>
          <Button variant="ghost" size="icon" @click="remove(f.ts_code)">
            <Trash2 class="h-4 w-4 text-destructive" />
          </Button>
        </CardContent>
      </Card>
    </div>
  </section>
</template>
