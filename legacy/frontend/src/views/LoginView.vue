<template>
  <div class="login-view">
    <div class="login-container">
      <a-card class="login-card" :bordered="false">
        <template #cover>
          <div class="login-header">
            <h1>YZInvest AI</h1>
            <p>智能股票分析平台</p>
          </div>
        </template>

        <a-form
          :model="formState"
          name="login"
          autocomplete="off"
          @finish="onFinish"
          @finishFailed="onFinishFailed"
        >
          <a-form-item
            name="username"
            :rules="[{ required: true, message: '请输入用户名!' }]"
          >
            <a-input
              v-model:value="formState.username"
              size="large"
              placeholder="用户名"
              :prefix="h(UserOutlined)"
            />
          </a-form-item>

          <a-form-item
            name="password"
            :rules="[{ required: true, message: '请输入密码!' }]"
          >
            <a-input-password
              v-model:value="formState.password"
              size="large"
              placeholder="密码"
              :prefix="h(LockOutlined)"
            />
          </a-form-item>

          <a-form-item>
            <a-button
              type="primary"
              html-type="submit"
              size="large"
              :loading="loading"
              block
            >
              登录
            </a-button>
          </a-form-item>

          <div class="login-footer">
            <span>还没有账户？</span>
            <a @click="goToRegister">立即注册</a>
          </div>
        </a-form>
      </a-card>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref, h } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { UserOutlined, LockOutlined } from '@ant-design/icons-vue'
import { message } from 'ant-design-vue'

interface FormState {
  username: string
  password: string
}

const router = useRouter()
const authStore = useAuthStore()
const loading = ref(false)

const formState = reactive<FormState>({
  username: '',
  password: '',
})

const onFinish = async (values: any) => {
  try {
    loading.value = true
    const result = await authStore.login(values.username, values.password)

    if (result.success) {
      message.success('登录成功！')
      router.push({ name: 'home' })
    } else {
      message.error(result.error || '登录失败')
    }
  } catch (error) {
    message.error('登录失败，请重试')
  } finally {
    loading.value = false
  }
}

const onFinishFailed = (errorInfo: any) => {
  console.log('Failed:', errorInfo)
}

const goToRegister = () => {
  router.push({ name: 'register' })
}
</script>

<style scoped>
.login-view {
  min-height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.login-container {
  width: 100%;
  max-width: 400px;
}

.login-card {
  border-radius: 12px;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
}

.login-header {
  text-align: center;
  padding: 40px 20px 20px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border-radius: 12px 12px 0 0;
}

.login-header h1 {
  margin: 0 0 8px 0;
  font-size: 2em;
  font-weight: bold;
}

.login-header p {
  margin: 0;
  opacity: 0.9;
}

.login-footer {
  text-align: center;
  margin-top: 16px;
  color: #666;
}

.login-footer a {
  margin-left: 8px;
}
</style>