<script setup lang="ts">
import Card from "@/components/ui/Card.vue";
import CardContent from "@/components/ui/CardContent.vue";
import CardHeader from "@/components/ui/CardHeader.vue";
import CardTitle from "@/components/ui/CardTitle.vue";
import Button from "@/components/ui/Button.vue";
import { useAuthStore } from "@/stores/auth";
import { useThemeStore } from "@/stores/theme";

const auth = useAuthStore();
const theme = useThemeStore();
</script>

<template>
  <section class="space-y-6">
    <header>
      <h1 class="text-2xl font-bold tracking-tight">设置</h1>
    </header>

    <Card>
      <CardHeader>
        <CardTitle>账户</CardTitle>
      </CardHeader>
      <CardContent class="space-y-3 text-sm">
        <div class="flex justify-between">
          <span class="text-muted-foreground">用户名</span>
          <span class="font-mono">{{ auth.user?.username }}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-muted-foreground">邮箱</span>
          <span>{{ auth.user?.email }}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-muted-foreground">昵称</span>
          <span>{{ auth.user?.full_name ?? "未设置" }}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-muted-foreground">角色</span>
          <span>{{ auth.user?.role === "admin" ? "管理员" : "用户" }}</span>
        </div>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle>外观</CardTitle>
      </CardHeader>
      <CardContent>
        <div class="flex gap-2">
          <Button
            v-for="m in (['light', 'dark', 'system'] as const)"
            :key="m"
            :variant="theme.mode === m ? 'default' : 'outline'"
            size="sm"
            @click="theme.set(m)"
          >
            {{ { light: "亮色", dark: "暗色", system: "跟随系统" }[m] }}
          </Button>
        </div>
      </CardContent>
    </Card>
  </section>
</template>
