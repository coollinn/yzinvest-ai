<script setup lang="ts">
import { Moon, Sun } from "lucide-vue-next";
import { useThemeStore } from "@/stores/theme";

const theme = useThemeStore();
</script>

<template>
  <button
    class="inline-flex h-9 w-9 items-center justify-center rounded-md text-foreground/70 transition-colors hover:bg-secondary hover:text-foreground"
    aria-label="切换主题"
    @click="theme.toggle()"
  >
    <Sun v-if="theme.effective === 'dark'" class="h-4 w-4" />
    <Moon v-else class="h-4 w-4" />
  </button>
</template>
