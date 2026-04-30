<script setup lang="ts">
import { computed } from "vue";
import { RouterLink, useRoute, useRouter } from "vue-router";
import { LineChart, LogOut, Star, FileText, Settings, User } from "lucide-vue-next";
import { useAuthStore } from "@/stores/auth";
import CommandPalette from "./CommandPalette.vue";
import ThemeToggle from "./ThemeToggle.vue";

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();

const navItems = [
  { name: "home", label: "首页", path: "/" },
  { name: "stocks", label: "股票", path: "/stocks" },
] as const;

const userMenu = [
  { name: "favorites", label: "收藏夹", icon: Star },
  { name: "notes", label: "我的笔记", icon: FileText },
  { name: "settings", label: "设置", icon: Settings },
] as const;

const showUserMenu = computed(() => auth.isAuthenticated);

async function logout() {
  await auth.logout();
  router.push({ name: "home" });
}
</script>

<template>
  <header class="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-md">
    <div class="container flex h-14 items-center justify-between gap-4">
      <RouterLink to="/" class="flex items-center gap-2 font-semibold">
        <LineChart class="h-5 w-5 text-up" />
        <span>YZInvest AI</span>
      </RouterLink>

      <nav class="hidden items-center gap-1 md:flex">
        <RouterLink
          v-for="item in navItems"
          :key="item.name"
          :to="item.path"
          class="px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
          :class="{ 'text-foreground': route.path === item.path }"
        >
          {{ item.label }}
        </RouterLink>
        <RouterLink
          v-if="showUserMenu"
          v-for="item in userMenu"
          :key="item.name"
          :to="`/${item.name}`"
          class="px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
          :class="{ 'text-foreground': route.name === item.name }"
        >
          {{ item.label }}
        </RouterLink>
      </nav>

      <div class="flex items-center gap-2">
        <CommandPalette />
        <ThemeToggle />

        <template v-if="auth.isAuthenticated">
          <div class="hidden items-center gap-2 sm:flex">
            <span class="text-sm text-muted-foreground">{{ auth.user?.username }}</span>
            <button class="text-muted-foreground hover:text-foreground" @click="logout">
              <LogOut class="h-4 w-4" />
            </button>
          </div>
        </template>
        <template v-else>
          <RouterLink
            to="/login"
            class="inline-flex h-9 items-center rounded-md px-3 text-sm font-medium text-foreground hover:bg-secondary"
          >
            登录
          </RouterLink>
          <RouterLink
            to="/register"
            class="inline-flex h-9 items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            注册
          </RouterLink>
        </template>
      </div>
    </div>
  </header>
</template>
