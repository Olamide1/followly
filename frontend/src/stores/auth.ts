import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import api from '@/services/api'

interface User {
  id: number
  email: string
  name?: string
  company?: string
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  const isLoading = ref(false)
  
  // Helper function to get token from localStorage
  function getToken(): string | null {
    return localStorage.getItem('token')
  }
  
  // Token ref that syncs with localStorage
  const token = ref<string | null>(getToken())
  
  // Helper function to set token in localStorage
  function setToken(value: string | null) {
    if (value) {
      localStorage.setItem('token', value)
      token.value = value // Always sync the ref when setting
    } else {
      localStorage.removeItem('token')
      token.value = null // Always sync the ref when removing
    }
  }
  
  // Watch localStorage changes (in case token is updated elsewhere, e.g., another tab)
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', (e) => {
      if (e.key === 'token') {
        token.value = e.newValue
      }
    })
  }

  // Check authentication based on token presence
  // User will be loaded asynchronously, but token is enough to determine auth state
  const isAuthenticated = computed(() => {
    // Always check localStorage to ensure we have the latest value
    const stored = getToken()
    if (stored !== token.value) {
      token.value = stored
    }
    return !!token.value
  })

  async function login(email: string, password: string) {
    const response = await api.post('/auth/login', { email, password })
    if (response.data.token) {
      setToken(response.data.token)
      token.value = response.data.token
      user.value = response.data.user
    }
    return response.data
  }

  async function register(email: string, password: string, name?: string, company?: string) {
    const response = await api.post('/auth/register', { email, password, name, company })
    if (response.data.token) {
      setToken(response.data.token)
      token.value = response.data.token
      user.value = response.data.user
    }
    return response.data
  }

  async function fetchUser() {
    // Always get fresh token from localStorage
    const currentToken = getToken()
    if (!currentToken) {
      user.value = null
      token.value = null
      return null
    }
    
    // Update token ref to match localStorage
    token.value = currentToken

    isLoading.value = true
    try {
      const response = await api.get('/auth/me')
      user.value = response.data.user
      return response.data
    } catch (error: any) {
      // Only logout if it's actually an authentication error (401)
      // Don't logout on network errors or other issues
      if (error.response?.status === 401) {
        logout()
      }
      throw error
    } finally {
      isLoading.value = false
    }
  }

  function syncToken() {
    // Force sync token from localStorage to ref
    const currentToken = getToken()
    token.value = currentToken
    return currentToken
  }

  async function initializeAuth() {
    // Always check localStorage for latest token and sync
    const currentToken = syncToken()
    
    if (currentToken && !user.value && !isLoading.value) {
      try {
        await fetchUser()
      } catch (error) {
        // Silent fail - token might be invalid, will be cleared by fetchUser if 401
        // Don't clear on other errors (network, etc.)
      }
    }
  }

  function logout() {
    user.value = null
    setToken(null)
    token.value = null
  }

  return {
    user,
    token,
    isLoading,
    isAuthenticated,
    login,
    register,
    fetchUser,
    initializeAuth,
    logout,
    syncToken,
  }
})

