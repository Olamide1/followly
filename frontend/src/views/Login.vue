<template>
  <div class="min-h-screen bg-canvas flex items-center justify-center py-24 px-8 relative z-10">
    <div class="max-w-md w-full">
      <div class="text-center mb-16">
        <h1 class="text-2xl font-light text-ink-900 mb-3 tracking-wider">FOLLOWLY</h1>
        <p class="text-ink-600 text-sm tracking-wide">Sign in to your account</p>
      </div>
      
      <div class="bg-paper border border-grid-light p-12">
        <form @submit.prevent="handleLogin" class="space-y-8">
          <div>
            <label for="email" class="block text-xs font-normal text-ink-500 uppercase tracking-wider mb-3">
              Email
            </label>
            <input
              id="email"
              v-model="email"
              type="email"
              required
              class="input"
              placeholder="you@example.com"
            />
          </div>
          
          <div>
            <label for="password" class="block text-xs font-normal text-ink-500 uppercase tracking-wider mb-3">
              Password
            </label>
            <input
              id="password"
              v-model="password"
              type="password"
              required
              class="input"
              placeholder="••••••••"
            />
          </div>
          
          <div v-if="error" class="text-ink-700 text-sm border-l-2 border-ink-900 pl-4">
            {{ error }}
          </div>
          
          <button
            type="submit"
            :disabled="loading"
            class="w-full btn btn-primary"
          >
            {{ loading ? 'SIGNING IN...' : 'SIGN IN' }}
          </button>
        </form>
        
        <div class="mt-8 pt-8 border-t border-grid-light text-center">
          <p class="text-xs text-ink-600 tracking-wide">
            Don't have an account?
            <router-link to="/register" class="text-ink-900 hover:underline">
              Sign up
            </router-link>
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const authStore = useAuthStore()

const email = ref('')
const password = ref('')
const loading = ref(false)
const error = ref('')

async function handleLogin() {
  loading.value = true
  error.value = ''
  
  try {
    await authStore.login(email.value, password.value)
    router.push('/app')
  } catch (err: any) {
    error.value = err.response?.data?.error || 'Login failed'
  } finally {
    loading.value = false
  }
}
</script>

