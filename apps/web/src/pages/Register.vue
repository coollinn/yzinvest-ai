<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import { RegisterRequest } from "@yzinvest/shared";
import Button from "@/components/ui/Button.vue";
import Card from "@/components/ui/Card.vue";
import CardContent from "@/components/ui/CardContent.vue";
import CardDescription from "@/components/ui/CardDescription.vue";
import CardHeader from "@/components/ui/CardHeader.vue";
import CardTitle from "@/components/ui/CardTitle.vue";
import Input from "@/components/ui/Input.vue";
import Label from "@/components/ui/Label.vue";
import { useAuthStore } from "@/stores/auth";

const router = useRouter();
const auth = useAuthStore();

const username = ref("");
const email = ref("");
const password = ref("");
const fullName = ref("");
const error = ref("");
const loading = ref(false);

async function submit() {
  error.value = "";
  const parsed = RegisterRequest.safeParse({
    username: username.value,
    email: email.value,
    password: password.value,
    full_name: fullName.value || undefined,
  });
  if (!parsed.success) {
    error.value = parsed.error.issues[0]?.message ?? "请检查输入";
    return;
  }
  try {
    loading.value = true;
    await auth.register(parsed.data);
    router.push("/");
  } catch (e: unknown) {
    error.value = (e as Error).message ?? "注册失败";
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="mx-auto max-w-sm py-16">
    <Card>
      <CardHeader>
        <CardTitle>创建账号</CardTitle>
        <CardDescription>30 秒注册，立即开始分析</CardDescription>
      </CardHeader>
      <CardContent>
        <form class="space-y-4" @submit.prevent="submit">
          <div class="space-y-2">
            <Label for="username">用户名</Label>
            <Input id="username" v-model="username" autocomplete="username" required />
          </div>
          <div class="space-y-2">
            <Label for="email">邮箱</Label>
            <Input id="email" v-model="email" type="email" autocomplete="email" required />
          </div>
          <div class="space-y-2">
            <Label for="password">密码</Label>
            <Input id="password" v-model="password" type="password" autocomplete="new-password" required />
            <p class="text-xs text-muted-foreground">至少 8 位</p>
          </div>
          <div class="space-y-2">
            <Label for="fullName">昵称（可选）</Label>
            <Input id="fullName" v-model="fullName" autocomplete="name" />
          </div>
          <p v-if="error" class="text-sm text-destructive">{{ error }}</p>
          <Button type="submit" class="w-full" :loading="loading">注册</Button>
          <p class="text-center text-sm text-muted-foreground">
            已有账号？
            <router-link to="/login" class="font-medium text-foreground underline-offset-4 hover:underline">
              直接登录
            </router-link>
          </p>
        </form>
      </CardContent>
    </Card>
  </div>
</template>
