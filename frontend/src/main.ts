import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { useAuthStore } from './stores/auth'
import './style.css'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(router)

// Initialize auth on app startup
// Check localStorage directly to ensure we get the token even if store isn't initialized yet
const authStore = useAuthStore()
const token = localStorage.getItem('token')
if (token) {
  // Sync token to store first
  authStore.token = token
  authStore.initializeAuth().catch(() => {
    // Silent fail - token might be invalid
  })
}

app.mount('#app')

