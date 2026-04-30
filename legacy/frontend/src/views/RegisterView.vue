<template>
  <div class="register-view">
    <div class="register-container">
      <a-card class="register-card" :bordered="false">
        <template #cover>
          <div class="register-header">
            <h1>注册账户</h1>
            <p>加入YZInvest AI智能股票分析平台</p>
          </div>
        </template>

        <a-form
          :model="formState"
          name="register"
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
            name="email"
            :rules="[
              { required: true, message: '请输入邮箱!' },
              { type: 'email', message: '请输入有效的邮箱地址!' }
            ]"
          >
            <a-input
              v-model:value="formState.email"
              size="large"
              placeholder="邮箱"
              :prefix="h(MailOutlined)"
            />
          </a-form-item>

          <a-form-item
            name="full_name"
          >
            <a-input
              v-model:value="formState.full_name"
              size="large"
              placeholder="真实姓名 (可选)"
              :prefix="h(IdcardOutlined)"
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

          <a-form-item
            name="confirmPassword"
            :rules="[
              { required: true, message: '请确认密码!' },
              { validator: validateConfirmPassword }
            ]"
          >
            <a-input-password
              v-model:value="formState.confirmPassword"
              size="large"
              placeholder="确认密码"
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
              注册
            </a-button>
          </a-form-item>

          <div class="register-footer">
            <span>已有账户？</span>
            <a @click="goToLogin">立即登录</a>
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
import { UserOutlined, MailOutlined, IdcardOutlined, LockOutlined } from '@ant-design/icons-vue'
import { message } from 'ant-design-vue'

interface FormState {
  username: string
  email: string
  full_name: string
  password: string
  confirmPassword: string
}

const router = useRouter()
const authStore = useAuthStore()
const loading = ref(false)

const formState = reactive<FormState>({
  username: '',
  email: '',
  full_name: '',
  password: '',
  confirmPassword: '',
})

const validateConfirmPassword = (_rule: any, value: string) => {
  if (value && value !== formState.password) {
    return Promise.reject('两次输入的密码不一致!')
  }
  return Promise.resolve()
}

const onFinish = async (values: any) => {
  try {
    loading.value = true
    const result = await authStore.register({
      username: values.username,
      email: values.email,
      password: values.password,
      full_name: values.full_name
    })

    if (result.success) {
      message.success('注册成功！')
      router.push({ name: 'home' })
    } else {
      message.error(result.error || '注册失败')
    }
  } catch (error) {
    message.error('注册失败，请重试')
  } finally {
    loading.value = false
  }
}

const onFinishFailed = (errorInfo: any) => {
  console.log('Failed:', errorInfo)
}

const goToLogin = () => {
  router.push({ name: 'login' })
}
</script>

<style scoped>
.register-view {
  min-height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.register-container {
  width: 100%;
  max-width: 400px;
}

.register-card {
  border-radius: 12px;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
}

.register-header {
  text-align: center;
  padding: 40px 20px 20px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border-radius: 12px 12px 0 0;
}

.register-header h1 {
  margin: 0 0 8px 0;
  font-size: 2em;
  font-weight: bold;
}

.register-header p {
  margin: 0;
  opacity: 0.9;
}

.register-footer {
  text-align: center;
  margin-top: 16px;
  color: #666;
}

.register-footer a {
  margin-left: 8px;
}
</style>