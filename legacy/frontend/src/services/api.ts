import axios from 'axios'

// Create axios instance with base configuration
export const api = axios.create({
  baseURL: '/api',
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Request interceptor to add session token
api.interceptors.request.use(
  (config) => {
    const sessionToken = localStorage.getItem('session_token')
    if (sessionToken) {
      config.params = {
        ...config.params,
        'X-Session-Token': sessionToken,
      }
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => {
    return response
  },
  (error) => {
    if (error.response?.status === 401) {
      // Unauthorized - clear session and redirect to login
      localStorage.removeItem('session_token')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

// Stock API methods
export const stockAPI = {
  // Get stocks list with pagination
  getStocks: (page: number = 1, limit: number = 20) => {
    return api.get('/stocks', { params: { page, limit } })
  },

  // Search stocks
  searchStocks: (query: string, limit: number = 50) => {
    return api.get('/stocks/search', { params: { q: query, limit } })
  },

  // Get random stocks
  getRandomStocks: (limit: number = 100) => {
    return api.get('/stocks/random', { params: { limit } })
  },

  // Get stock by ID or ts_code
  getStock: (identifier: string) => {
    return api.get(`/stocks/${identifier}`)
  },

  // Get stock detail with analysis data
  getStockDetail: (identifier: string) => {
    return api.get(`/stocks/${identifier}/detail`)
  },

  // Get user's note for a stock
  getStockNote: (identifier: string) => {
    return api.get(`/stocks/${identifier}/user-note`)
  },
}

// Auth API methods
export const authAPI = {
  login: (username: string, password: string) => {
    return api.post('/auth/login', { username, password })
  },

  register: (userData: {
    username: string
    email: string
    password: string
    full_name?: string
  }) => {
    return api.post('/auth/register', userData)
  },

  logout: () => {
    return api.post('/auth/logout')
  },

  validateSession: (sessionToken: string) => {
    return api.get('/auth/validate', { params: { session_token: sessionToken } })
  },
}

// Notes API methods
export const notesAPI = {
  getNotes: (page: number = 1, limit: number = 20) => {
    return api.get('/notes', { params: { page, limit } })
  },

  createNote: (noteData: {
    stock_id: number
    content: string
    analysis_type?: string
    rating?: number
  }) => {
    return api.post('/notes', noteData)
  },

  getNote: (noteId: number) => {
    return api.get(`/notes/${noteId}`)
  },

  updateNote: (noteId: number, noteData: {
    content: string
    analysis_type?: string
    rating?: number
  }) => {
    return api.put(`/notes/${noteId}`, noteData)
  },

  deleteNote: (noteId: number) => {
    return api.delete(`/notes/${noteId}`)
  },
}

// Favorites API methods
export const favoritesAPI = {
  getFavorites: () => {
    return api.get('/favorites')
  },

  addFavorite: (stockId: number) => {
    return api.post('/favorites', { stock_id: stockId })
  },

  removeFavorite: (stockId: number) => {
    return api.delete(`/favorites/${stockId}`)
  },

  checkFavorite: (stockId: number) => {
    return api.get(`/favorites/${stockId}/check`)
  },
}

// Daily data API methods
export const dailyAPI = {
  getDailyData: (tsCode: string, startDate?: string, endDate?: string, limit: number = 10) => {
    return api.get(`/daily/${tsCode}`, {
      params: { start_date: startDate, end_date: endDate, limit }
    })
  },

  getLatestDailyData: () => {
    return api.get('/daily/latest')
  },
}

// Admin API methods
export const adminAPI = {
  getDashboard: () => {
    return api.get('/admin/dashboard')
  },

  getUsers: () => {
    return api.get('/admin/users')
  },

  syncStocks: () => {
    return api.post('/admin/sync/stocks')
  },
}

// Financial Data API methods
export const financialAPI = {
  getFinancialOverview: (tsCode: string) => {
    return api.get(`/financial/${tsCode}/overview`)
  },

  syncFinancialData: (tsCode: string, dataType: string) => {
    return api.post(`/financial/${tsCode}/sync`, { financial_type: dataType })
  },

  getBalanceSheet: (tsCode: string) => {
    return api.get(`/financial/${tsCode}/balance-sheet`)
  },

  getIncomeStatement: (tsCode: string) => {
    return api.get(`/financial/${tsCode}/income-statement`)
  },

  getCashFlow: (tsCode: string) => {
    return api.get(`/financial/${tsCode}/cash-flow`)
  },

  getMainIndicators: (tsCode: string) => {
    return api.get(`/financial/${tsCode}/main-indicators`)
  },
}