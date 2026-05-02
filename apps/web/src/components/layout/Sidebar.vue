<script setup lang="ts">
import {
  BarChart3,
  BookOpen,
  LayoutDashboard,
  LogIn,
  LogOut,
  Moon,
  Settings,
  Shield,
  Star,
  Sun,
  TrendingUp,
  User,
} from "lucide-vue-next";
import { computed, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useAuthStore } from "@/stores/auth";
import { useThemeStore } from "@/stores/theme";
import { cn } from "@/lib/utils";

const auth = useAuthStore();
const theme = useThemeStore();
const route = useRoute();
const router = useRouter();

const collapsed = ref(false);

interface NavItem {
  icon: typeof LayoutDashboard;
  label: string;
  to: string;
  adminOnly?: boolean;
  badge?: number;
}

const mainNav: NavItem[] = [
  { icon: LayoutDashboard, label: "首页", to: "/" },
  { icon: TrendingUp, label: "行情", to: "/stocks" },
  { icon: Star, label: "自选", to: "/favorites" },
  { icon: BookOpen, label: "笔记", to: "/notes" },
];

const bottomNav = computed((): NavItem[] => [
  ...(auth.isAuthenticated
    ? [{ icon: Settings, label: "设置", to: "/settings" }]
    : [{ icon: LogIn, label: "登录", to: "/login" }]),
  { icon: Shield, label: "管理", to: "/admin", adminOnly: true },
]);

function isActive(to: string) {
  if (to === "/") return route.path === "/";
  return route.path.startsWith(to);
}

async function handleLogout() {
  await auth.logout();
  router.push("/login");
}
</script>

<template>
  <aside
    :class="[
      'flex h-full flex-col border-r border-border bg-sidebar text-sidebar-foreground transition-all duration-200',
      collapsed ? 'w-16' : 'w-52'
    ]"
  >
    <!-- Logo -->
    <div class="flex h-12 shrink-0 items-center border-b border-border px-3">
      <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent">
        <BarChart3 class="h-4 w-4 text-accent-foreground" />
      </div>
      <span v-if="!collapsed" class="ml-2 text-sm font-semibold tracking-tight">YZInvest</span>
    </div>

    <!-- Main nav -->
    <nav class="flex-1 overflow-y-auto px-2 py-2">
      <ul class="space-y-0.5">
        <li v-for="item in mainNav" :key="item.to">
          <RouterLink
            :to="item.to"
            :class="[
              'group flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors',
              collapsed ? 'justify-center' : '',
              isActive(item.to)
                ? 'bg-accent/15 font-medium text-accent'
                : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/10 hover:text-sidebar-foreground',
            ]"
            :title="collapsed ? item.label : undefined"
          >
            <component :is="item.icon" class="h-4 w-4 shrink-0" />
            <span v-if="!collapsed">{{ item.label }}</span>
            <span
              v-if="item.badge && !collapsed"
              class="ml-auto flex h-4 min-w-4 items-center justify-center rounded-full bg-accent/20 px-1 text-[10px] font-semibold text-accent"
            >
              {{ item.badge }}
            </span>
          </RouterLink>
        </li>
      </ul>

      <!-- Divider -->
      <div class="my-3 border-t border-border/50" />

      <!-- Bottom nav -->
      <ul class="space-y-0.5">
        <li v-for="item in bottomNav" :key="item.to">
          <RouterLink
            v-if="!item.adminOnly || (item.adminOnly && auth.isAdmin)"
            :to="item.to"
            :class="[
              'group flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors',
              collapsed ? 'justify-center' : '',
              isActive(item.to)
                ? 'bg-accent/15 font-medium text-accent'
                : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/10 hover:text-sidebar-foreground',
            ]"
            :title="collapsed ? item.label : undefined"
          >
            <component :is="item.icon" class="h-4 w-4 shrink-0" />
            <span v-if="!collapsed">{{ item.label }}</span>
          </RouterLink>
        </li>
      </ul>
    </nav>

    <!-- Bottom section -->
    <div class="border-t border-border px-2 py-2">
      <!-- User info -->
      <div
        :class="[
          'flex items-center rounded-md px-2.5 py-2',
          collapsed ? 'justify-center' : 'gap-2'
        ]"
      >
        <div class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/20 text-accent">
          <User class="h-3.5 w-3.5" />
        </div>
        <div v-if="!collapsed" class="min-w-0 flex-1">
          <p class="truncate text-xs font-medium">
            {{ auth.user?.full_name || auth.user?.username || '未登录' }}
          </p>
          <p class="truncate text-[10px] text-sidebar-foreground/50">
            {{ auth.isAdmin ? '管理员' : auth.isAuthenticated ? '用户' : '访客模式' }}
          </p>
        </div>
        <button
          v-if="!collapsed && auth.isAuthenticated"
          class="ml-auto shrink-0 rounded p-1 text-sidebar-foreground/50 transition-colors hover:bg-sidebar-accent/10 hover:text-sidebar-foreground"
          title="退出登录"
          @click="handleLogout"
        >
          <LogOut class="h-3 w-3" />
        </button>
        <RouterLink
          v-if="!collapsed && !auth.isAuthenticated"
          to="/login"
          class="ml-auto shrink-0 rounded p-1 text-sidebar-foreground/50 transition-colors hover:bg-sidebar-accent/10 hover:text-sidebar-foreground"
          title="登录"
        >
          <LogIn class="h-3 w-3" />
        </RouterLink>
      </div>

      <!-- Theme toggle -->
      <button
        :class="[
          'mt-1 flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent/10 hover:text-sidebar-foreground',
          collapsed ? 'justify-center w-full' : 'w-full'
        ]"
        :title="collapsed ? (theme.effective === 'dark' ? '浅色模式' : '深色模式') : undefined"
        @click="theme.toggle()"
      >
        <component :is="theme.effective === 'dark' ? Sun : Moon" class="h-4 w-4 shrink-0" />
        <span v-if="!collapsed" class="text-xs">{{ theme.effective === 'dark' ? '浅色' : '深色' }}</span>
      </button>
    </div>
  </aside>
</template>
