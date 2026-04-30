<script setup lang="ts">
import { ref } from "vue";
import { onClickOutside, onKeyStroke } from "@vueuse/core";
import { useRouter } from "vue-router";
import { Search, X } from "lucide-vue-next";
import { apiGet } from "@/lib/api";
import type { ListResponse, Stock } from "@yzinvest/shared";

const router = useRouter();
const open = ref(false);
const query = ref("");
const results = ref<Stock[]>([]);
const loading = ref(false);
const dialogRef = ref<HTMLElement>();

onClickOutside(dialogRef, () => {
  open.value = false;
});

onKeyStroke("k", (e) => {
  if (e.metaKey || e.ctrlKey) {
    e.preventDefault();
    open.value = true;
  }
});

onKeyStroke("Escape", () => {
  if (open.value) open.value = false;
});

let timer: ReturnType<typeof setTimeout> | null = null;
function onInput(e: Event) {
  query.value = (e.target as HTMLInputElement).value;
  if (timer) clearTimeout(timer);
  timer = setTimeout(async () => {
    if (!query.value.trim()) {
      results.value = [];
      return;
    }
    try {
      loading.value = true;
      const r = await apiGet<{ items: Stock[] }>(
        `/stocks/search?q=${encodeURIComponent(query.value)}&limit=15`
      );
      results.value = r.items;
    } finally {
      loading.value = false;
    }
  }, 200);
}

function go(s: Stock) {
  open.value = false;
  query.value = "";
  results.value = [];
  router.push({ name: "stock-detail", params: { tsCode: s.ts_code } });
}
</script>

<template>
  <button
    class="inline-flex items-center gap-2 rounded-md border border-border bg-secondary/40 px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-secondary"
    @click="open = true"
  >
    <Search class="h-3.5 w-3.5" />
    <span class="hidden sm:inline">搜索股票…</span>
    <kbd class="ml-2 hidden items-center gap-1 rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:inline-flex">
      <span class="text-xs">⌘</span>K
    </kbd>
  </button>

  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm flex items-start justify-center pt-24"
    >
      <div ref="dialogRef" class="w-full max-w-xl rounded-lg border border-border bg-card shadow-2xl">
        <div class="flex items-center gap-2 border-b border-border px-4 py-3">
          <Search class="h-4 w-4 text-muted-foreground" />
          <input
            :value="query"
            placeholder="按股票代码、名称、行业搜索"
            autofocus
            class="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            @input="onInput"
          />
          <button class="text-muted-foreground hover:text-foreground" @click="open = false">
            <X class="h-4 w-4" />
          </button>
        </div>
        <div class="max-h-80 overflow-auto">
          <div v-if="loading" class="p-4 text-sm text-muted-foreground">搜索中…</div>
          <div v-else-if="results.length === 0 && query" class="p-4 text-sm text-muted-foreground">
            没有找到匹配的股票
          </div>
          <ul v-else>
            <li
              v-for="s in results"
              :key="s.ts_code"
              class="flex cursor-pointer items-center justify-between px-4 py-2 text-sm hover:bg-secondary"
              @click="go(s)"
            >
              <div class="flex items-center gap-2">
                <span class="font-mono text-xs text-muted-foreground">{{ s.symbol }}</span>
                <span class="font-medium">{{ s.name }}</span>
              </div>
              <span class="text-xs text-muted-foreground">{{ s.industry || s.market }}</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  </Teleport>
</template>
