<template>
  <a-config-provider :theme="theme">
    <div id="app">
      <a-layout style="min-height: 100vh">
        <!-- Header -->
        <a-layout-header class="header">
          <div class="header-content">
            <div class="logo">
              <h1 style="color: white; margin: 0">YZInvest AI</h1>
            </div>
            <a-menu
              v-model:selectedKeys="currentMenu"
              mode="horizontal"
              theme="dark"
              :items="menuItems"
              @click="handleMenuClick"
            />
            <div class="user-actions">
              <template v-if="authStore.isAuthenticated">
                <a-dropdown>
                  <a-button type="text" style="color: white">
                    {{ authStore.user?.username }}
                    <UserOutlined />
                  </a-button>
                  <template #overlay>
                    <a-menu>
                      <a-menu-item key="profile">
                        <UserOutlined />
                        个人资料
                      </a-menu-item>
                      <a-menu-item key="notes">
                        <FileTextOutlined />
                        我的笔记
                      </a-menu-item>
                      <a-menu-item key="favorites">
                        <StarOutlined />
                        收藏夹
                      </a-menu-item>
                      <a-menu-divider />
                      <a-menu-item key="logout" @click="handleLogout">
                        <LogoutOutlined />
                        退出登录
                      </a-menu-item>
                    </a-menu>
                  </template>
                </a-dropdown>
              </template>
              <template v-else>
                <a-button type="primary" @click="handleLogin">
                  登录
                </a-button>
                <a-button style="margin-left: 8px" @click="handleRegister">
                  注册
                </a-button>
              </template>
            </div>
          </div>
        </a-layout-header>

        <!-- Content -->
        <a-layout-content class="content">
          <router-view />
        </a-layout-content>

        <!-- Footer -->
        <a-layout-footer class="footer">
          YZInvest AI - 智能股票分析平台 ©2024
        </a-layout-footer>
      </a-layout>
    </div>
  </a-config-provider>
</template>

<script setup lang="ts">
import { ref, computed, h, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from './stores/auth'
import {
  UserOutlined,
  FileTextOutlined,
  StarOutlined,
  LogoutOutlined,
  HomeOutlined,
  StockChartOutlined,
  HeartOutlined,
  SettingOutlined
} from '@ant-design/icons-vue'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()

const theme = {
  token: {
    colorPrimary: '#1890ff',
  },
}

const currentMenu = ref<string[]>([route.name as string])

const menuItems = computed(() => [
  {
    key: 'home',
    icon: () => h(HomeOutlined),
    label: '首页',
  },
  {
    key: 'stocks',
    icon: () => h(StockChartOutlined),
    label: '股票列表',
  },
  ...(authStore.isAuthenticated ? [
    {
      key: 'favorites',
      icon: () => h(HeartOutlined),
      label: '收藏夹',
    },
    {
      key: 'notes',
      icon: () => h(FileTextOutlined),
      label: '我的笔记',
    },
  ] : []),
])

const handleMenuClick = ({ key }: { key: string }) => {
  router.push({ name: key })
}

const handleLogin = () => {
  router.push({ name: 'login' })
}

const handleRegister = () => {
  router.push({ name: 'register' })
}

const handleLogout = async () => {
  await authStore.logout()
  router.push({ name: 'home' })
}

// Watch route changes to update active menu
watch(
  () => route.name,
  (newRouteName) => {
    currentMenu.value = [newRouteName as string]
  }
)
</script>

<style scoped>
.header {
  padding: 0 20px;
}

.header-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
  max-width: 1200px;
  margin: 0 auto;
}

.logo {
  display: flex;
  align-items: center;
}

.user-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.content {
  padding: 24px;
  background: #f0f2f5;
  max-width: 1200px;
  margin: 0 auto;
  width: 100%;
}

.footer {
  text-align: center;
  background: #001529;
  color: white;
}
</style>