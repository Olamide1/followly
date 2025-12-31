import axios from 'axios'
import { useAuthStore } from '@/stores/auth'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3000/api',
  headers: {
    'Content-Type': 'application/json',
  },
})

// Request interceptor to add auth token
api.interceptors.request.use((config) => {
  const authStore = useAuthStore()
  if (authStore.token) {
    config.headers.Authorization = `Bearer ${authStore.token}`
  }
  return config
})

// Response interceptor to handle errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Only handle 401 Unauthorized errors that are actual authentication failures
    // Don't logout on:
    // - Network errors (no response)
    // - Timeouts
    // - Other status codes
    // - 401s that might be permission-related (check error message)
    if (error.response?.status === 401) {
      const errorMessage = error.response?.data?.error || error.message || ''
      
      // Only logout on actual authentication failures, not permission errors
      // Permission errors usually have specific messages like "not found" or "does not belong to you"
      const isAuthFailure = !errorMessage.toLowerCase().includes('not found') && 
                            !errorMessage.toLowerCase().includes('does not belong') &&
                            !errorMessage.toLowerCase().includes('permission') &&
                            !errorMessage.toLowerCase().includes('unauthorized access')
      
      if (isAuthFailure) {
        const authStore = useAuthStore()
        // Only logout if we're not already on the login page
        if (window.location.pathname !== '/login' && window.location.pathname !== '/register') {
          authStore.logout()
          // Use router if available, otherwise use window.location
          if (window.location.pathname.startsWith('/app')) {
            window.location.href = '/login'
          }
        }
      }
      // If it's a permission error (not auth failure), just reject without logging out
    }
    return Promise.reject(error)
  }
)

export default api

