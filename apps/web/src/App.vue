<script setup lang="ts">
import { computed } from "vue";
import { RouterView, useRoute } from "vue-router";
import { onMounted } from "vue";
import { useAuthStore } from "@/stores/auth";
import Sidebar from "@/components/layout/Sidebar.vue";

const auth = useAuthStore();
const route = useRoute();

// 登录/注册页不需要侧边栏
const showSidebar = computed(
  () => auth.isAuthenticated && !["/login", "/register"].includes(route.path)
);

onMounted(async () => {
  await auth.init();
});
</script>

<template>
  <div class="flex h-screen overflow-hidden bg-background">
    <!-- 侧边导航 -->
    <Sidebar v-if="showSidebar" class="shrink-0" />

    <!-- 主内容区 -->
    <main class="flex flex-1 flex-col overflow-hidden">
      <RouterView v-slot="{ Component }">
        <Transition name="fade" mode="out-in">
          <component :is="Component" />
        </Transition>
      </RouterView>
    </main>
  </div>
</template>

<style>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
