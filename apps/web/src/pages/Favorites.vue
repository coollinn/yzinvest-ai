<script setup lang="ts">
import { useQuery, useQueryClient } from "@tanstack/vue-query";
import { Star, Trash2 } from "lucide-vue-next";
import { RouterLink } from "vue-router";
import Button from "@/components/ui/Button.vue";
import Card from "@/components/ui/Card.vue";
import CardContent from "@/components/ui/CardContent.vue";
import Skeleton from "@/components/ui/Skeleton.vue";
import { apiDelete, apiGet } from "@/lib/api";
import type { Favorite, Stock } from "@yzinvest/shared";

interface FavoriteWithStock extends Favorite {
  stock: Stock | null;
}

const qc = useQueryClient();
const { data, isLoading, refetch } = useQuery({
  queryKey: ["favorites"],
  queryFn: () => apiGet<{ items: FavoriteWithStock[] }>("/favorites"),
});

async function remove(ts_code: string) {
  await apiDelete(`/favorites/${ts_code}`);
  await refetch();
  qc.invalidateQueries({ queryKey: ["fav-check"] });
}
</script>

<template>
  <section class="space-y-4">
    <header>
      <h1 class="text-2xl font-bold tracking-tight">收藏夹</h1>
      <p class="text-sm text-muted-foreground">在股票详情页点击"加入收藏"添加</p>
    </header>

    <div v-if="isLoading" class="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
      <Skeleton v-for="i in 6" :key="i" class="h-24" />
    </div>
    <Card v-else-if="!data?.items?.length">
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
      <Card v-for="f in data.items" :key="f.ts_code">
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
