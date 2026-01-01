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
  // Always read token directly from localStorage to ensure we have the latest value
  // This prevents stale token issues when the store ref hasn't updated yet
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Response interceptor to handle errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Handle 429 Rate Limit errors gracefully - never logout on rate limits
    if (error.response?.status === 429) {
      console.warn('Rate limit exceeded - request throttled:', error.config?.url)
      // Don't break session, just reject the request
      // The UI should handle this gracefully
      return Promise.reject(error)
    }
    
    // CRITICAL: Only logout on EXACT backend authentication error messages
    // The backend only returns these two specific messages for auth failures:
    // 1. "Authentication token required" - when no token is sent
    // 2. "Invalid or expired token" - when token is invalid/expired
    
    // NEVER logout on:
    // - Network errors (no response)
    // - Timeouts
    // - Other status codes
    // - Any 401 that doesn't match the exact backend messages
    // - Search operations
    // - Permission errors
    // - Rate limit errors (429)
    // - Requests that were made without a token (skipAuthCheck flag)
    
    if (error.response?.status === 401) {
      const errorMessage = (error.response?.data?.error || error.message || '').trim()
      const token = localStorage.getItem('token')
      const requestUrl = error.config?.url || ''
      const requestMethod = (error.config?.method || '').toLowerCase()
      
      // CRITICAL: NEVER logout on search/GET operations to contacts
      // These are read operations and should never break the session
      // This is the PRIMARY protection against search breaking sessions
      if (requestMethod === 'get' && (requestUrl.includes('/contacts') || requestUrl.includes('/api/contacts'))) {
        console.warn('401 on contacts GET request (search) - SUPPRESSING logout to prevent session break:', errorMessage, 'URL:', requestUrl)
        return Promise.reject(error)
      }
      
      // If no token exists, don't logout (might be public route or initial load)
      if (!token) {
        return Promise.reject(error)
      }
      
      // ONLY logout on EXACT backend auth error messages (case-insensitive match)
      // These are the ONLY two messages the backend sends for auth failures
      const exactAuthErrors = [
        'authentication token required',
        'invalid or expired token'
      ]
      
      // Check for exact match (case-insensitive)
      const isExactAuthError = exactAuthErrors.some(exactMsg => 
        errorMessage.toLowerCase() === exactMsg.toLowerCase()
      )
      
      // If it's NOT an exact auth error, NEVER logout
      // This includes:
      // - Permission errors
      // - Not found errors
      // - Any other 401 errors
      // - Search-related errors
      // - Any ambiguous errors
      if (!isExactAuthError) {
        // Not an auth error - just reject without logging out
        console.warn('401 error but not an auth failure, not logging out:', errorMessage, 'URL:', requestUrl)
        return Promise.reject(error)
      }
      
      // Only logout if it's an EXACT auth error match
      // AND it's NOT a search operation (double-check)
      // AND we're not on login/register pages
      if (window.location.pathname !== '/login' && 
          window.location.pathname !== '/register' &&
          !(requestMethod === 'get' && (requestUrl.includes('/contacts') || requestUrl.includes('/api/contacts')))) {
        console.warn('Logging out due to auth error:', errorMessage, 'URL:', requestUrl)
        const authStore = useAuthStore()
        authStore.logout()
        if (window.location.pathname.startsWith('/app')) {
          window.location.href = '/login'
        }
      } else {
        // Even if it's an auth error, don't logout on search operations
        console.warn('Suppressing logout for search/contacts GET operation despite auth error')
        return Promise.reject(error)
      }
    }
    
    // For all other errors (non-401, network errors, etc.), just reject
    return Promise.reject(error)
  }
)

export default api

