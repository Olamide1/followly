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
const authStore = useAuthStore()
if (authStore.token) {
  authStore.initializeAuth().catch(() => {
    // Silent fail - token might be invalid
  })
}

app.mount('#app')

