import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api } from '../services/api'

interface User {
  id: number
  username: string
  email: string
  full_name?: string
  created_at: string
  updated_at: string
}

interface AuthState {
  user: User | null
  sessionToken: string | null
  isAuthenticated: boolean
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  const sessionToken = ref<string | null>(localStorage.getItem('session_token'))
  const isAuthenticated = computed(() => !!sessionToken.value && !!user.value)

  // Initialize auth state
  const initializeAuth = async () => {
    if (sessionToken.value) {
      try {
        const response = await api.get('/auth/validate', {
          params: { session_token: sessionToken.value }
        })

        if (response.data.valid) {
          // Session is valid, fetch user data
          await fetchUserData()
        } else {
          // Session is invalid, clear stored token
          logout()
        }
      } catch (error) {
        console.error('Failed to validate session:', error)
        logout()
      }
    }
  }

  const fetchUserData = async () => {
    try {
      // In a real app, you'd have an endpoint to get current user data
      // For now, we'll just set a mock user
      user.value = {
        id: 1,
        username: 'demo_user',
        email: 'demo@example.com',
        full_name: 'Demo User',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    } catch (error) {
      console.error('Failed to fetch user data:', error)
      logout()
    }
  }

  const login = async (username: string, password: string) => {
    try {
      const response = await api.post('/auth/login', {
        username,
        password
      })

      const { session_token, user_id, username: responseUsername, expires_at } = response.data

      // Store session token
      sessionToken.value = session_token
      localStorage.setItem('session_token', session_token)

      // Set user data
      user.value = {
        id: user_id,
        username: responseUsername,
        email: '', // You might want to get this from a user profile endpoint
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }

      return { success: true }
    } catch (error: any) {
      console.error('Login failed:', error)
      return {
        success: false,
        error: error.response?.data?.detail || '登录失败'
      }
    }
  }

  const register = async (userData: {
    username: string
    email: string
    password: string
    full_name?: string
  }) => {
    try {
      const response = await api.post('/auth/register', userData)

      const { session_token, user_id, username: responseUsername, expires_at } = response.data

      // Store session token
      sessionToken.value = session_token
      localStorage.setItem('session_token', session_token)

      // Set user data
      user.value = {
        id: user_id,
        username: responseUsername,
        email: userData.email,
        full_name: userData.full_name,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }

      return { success: true }
    } catch (error: any) {
      console.error('Registration failed:', error)
      return {
        success: false,
        error: error.response?.data?.detail || '注册失败'
      }
    }
  }

  const logout = async () => {
    if (sessionToken.value) {
      try {
        await api.post('/auth/logout', null, {
          params: { session_token: sessionToken.value }
        })
      } catch (error) {
        console.error('Logout API call failed:', error)
      }
    }

    // Clear local state
    sessionToken.value = null
    user.value = null
    localStorage.removeItem('session_token')
  }

  // Check if user is admin (you might want to add an admin field to the user model)
  const isAdmin = computed(() => {
    // For demo purposes, check if username contains 'admin'
    return user.value?.username.includes('admin') || false
  })

  return {
    user,
    sessionToken,
    isAuthenticated,
    isAdmin,
    initializeAuth,
    login,
    register,
    logout,
    fetchUserData
  }
})