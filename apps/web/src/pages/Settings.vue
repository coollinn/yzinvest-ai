<script setup lang="ts">
import { ref } from "vue";
import Button from "@/components/ui/Button.vue";
import Card from "@/components/ui/Card.vue";
import CardContent from "@/components/ui/CardContent.vue";
import CardHeader from "@/components/ui/CardHeader.vue";
import CardTitle from "@/components/ui/CardTitle.vue";
import Input from "@/components/ui/Input.vue";
import Label from "@/components/ui/Label.vue";
import { useAuthStore } from "@/stores/auth";
import { useThemeStore } from "@/stores/theme";
import { apiPost, apiPut } from "@/lib/api";
import type { User } from "@yzinvest/shared";

const auth = useAuthStore();
const theme = useThemeStore();

// 修改个人信息
const fullName = ref(auth.user?.full_name ?? "");
const email = ref(auth.user?.email ?? "");
const profileError = ref("");
const profileSuccess = ref("");
const profileLoading = ref(false);

// 修改密码
const oldPassword = ref("");
const newPassword = ref("");
const confirmPassword = ref("");
const passwordError = ref("");
const passwordSuccess = ref("");
const passwordLoading = ref(false);

async function updateProfile() {
  profileError.value = "";
  profileSuccess.value = "";

  if (!email.value) {
    profileError.value = "邮箱不能为空";
    return;
  }

  profileLoading.value = true;
  try {
    const updated = await apiPut<User>("/auth/me", {
      full_name: fullName.value || null,
      email: email.value,
    });
    profileSuccess.value = "个人信息已更新";
    // 更新本地用户信息
    auth.setUser(updated);
  } catch (e: any) {
    profileError.value = e.message || "更新失败";
  } finally {
    profileLoading.value = false;
  }
}

async function changePassword() {
  passwordError.value = "";
  passwordSuccess.value = "";

  if (!oldPassword.value || !newPassword.value) {
    passwordError.value = "请填写完整";
    return;
  }
  if (newPassword.value.length < 6) {
    passwordError.value = "新密码至少6位";
    return;
  }
  if (newPassword.value !== confirmPassword.value) {
    passwordError.value = "两次输入的新密码不一致";
    return;
  }

  passwordLoading.value = true;
  try {
    await apiPost("/auth/change-password", {
      old_password: oldPassword.value,
      new_password: newPassword.value,
    });
    passwordSuccess.value = "密码修改成功";
    oldPassword.value = "";
    newPassword.value = "";
    confirmPassword.value = "";
  } catch (e: any) {
    passwordError.value = e.message || "修改失败";
  } finally {
    passwordLoading.value = false;
  }
}
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
        <CardTitle>修改个人信息</CardTitle>
      </CardHeader>
      <CardContent class="space-y-4">
        <div class="space-y-2">
          <Label for="profile-name">昵称</Label>
          <Input id="profile-name" v-model="fullName" placeholder="输入昵称" />
        </div>
        <div class="space-y-2">
          <Label for="profile-email">邮箱</Label>
          <Input id="profile-email" v-model="email" type="email" placeholder="输入邮箱" />
        </div>
        <p v-if="profileError" class="text-sm text-destructive">{{ profileError }}</p>
        <p v-if="profileSuccess" class="text-sm text-green-600">{{ profileSuccess }}</p>
        <Button :disabled="profileLoading" @click="updateProfile">
          {{ profileLoading ? "保存中..." : "保存" }}
        </Button>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle>修改密码</CardTitle>
      </CardHeader>
      <CardContent class="space-y-4">
        <div class="space-y-2">
          <Label for="old-pw">当前密码</Label>
          <Input id="old-pw" v-model="oldPassword" type="password" />
        </div>
        <div class="space-y-2">
          <Label for="new-pw">新密码</Label>
          <Input id="new-pw" v-model="newPassword" type="password" />
        </div>
        <div class="space-y-2">
          <Label for="confirm-pw">确认新密码</Label>
          <Input id="confirm-pw" v-model="confirmPassword" type="password" />
        </div>
        <p v-if="passwordError" class="text-sm text-destructive">{{ passwordError }}</p>
        <p v-if="passwordSuccess" class="text-sm text-green-600">{{ passwordSuccess }}</p>
        <Button :disabled="passwordLoading" @click="changePassword">
          {{ passwordLoading ? "保存中..." : "保存" }}
        </Button>
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
