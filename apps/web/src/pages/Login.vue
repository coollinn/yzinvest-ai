<script setup lang="ts">
import { ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { LoginRequest } from "@yzinvest/shared";
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
const route = useRoute();
const auth = useAuthStore();

const username = ref("");
const password = ref("");
const error = ref("");
const loading = ref(false);

async function submit() {
  error.value = "";
  const parsed = LoginRequest.safeParse({
    username: username.value,
    password: password.value,
  });
  if (!parsed.success) {
    error.value = "请填写用户名和密码";
    return;
  }
  try {
    loading.value = true;
    await auth.login(parsed.data);
    const redirect = (route.query.redirect as string) || "/";
    router.push(redirect);
  } catch (e: unknown) {
    error.value = (e as Error).message ?? "登录失败";
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="mx-auto max-w-sm py-16">
    <Card>
      <CardHeader>
        <CardTitle>登录</CardTitle>
        <CardDescription>用账号密码登录 YZInvest AI</CardDescription>
      </CardHeader>
      <CardContent>
        <form class="space-y-4" @submit.prevent="submit">
          <div class="space-y-2">
            <Label for="username">用户名</Label>
            <Input id="username" v-model="username" autocomplete="username" required />
          </div>
          <div class="space-y-2">
            <Label for="password">密码</Label>
            <Input id="password" v-model="password" type="password" autocomplete="current-password" required />
          </div>
          <p v-if="error" class="text-sm text-destructive">{{ error }}</p>
          <Button type="submit" class="w-full" :loading="loading">登录</Button>
          <p class="text-center text-sm text-muted-foreground">
            还没有账号？
            <router-link to="/register" class="font-medium text-foreground underline-offset-4 hover:underline">
              立即注册
            </router-link>
          </p>
        </form>
      </CardContent>
    </Card>
  </div>
</template>
