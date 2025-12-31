<template>
  <div class="min-h-screen bg-canvas flex items-center justify-center py-24 px-8 relative z-10">
    <div class="max-w-md w-full">
      <div class="text-center mb-16">
        <h1 class="text-2xl font-light text-ink-900 mb-3 tracking-wider">FOLLOWLY</h1>
        <p class="text-ink-600 text-sm tracking-wide">Create your account</p>
      </div>
      
      <div class="bg-paper border border-grid-light p-12">
        <form @submit.prevent="handleRegister" class="space-y-8">
          <div>
            <label for="name" class="block text-xs font-normal text-ink-500 uppercase tracking-wider mb-3">
              Name
            </label>
            <input
              id="name"
              v-model="name"
              type="text"
              class="input"
              placeholder="Your name"
            />
          </div>
          
          <div>
            <label for="company" class="block text-xs font-normal text-ink-500 uppercase tracking-wider mb-3">
              Company (optional)
            </label>
            <input
              id="company"
              v-model="company"
              type="text"
              class="input"
              placeholder="Your company"
            />
          </div>
          
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
            {{ loading ? 'CREATING ACCOUNT...' : 'CREATE ACCOUNT' }}
          </button>
        </form>
        
        <div class="mt-8 pt-8 border-t border-grid-light text-center">
          <p class="text-xs text-ink-600 tracking-wide">
            Already have an account?
            <router-link to="/login" class="text-ink-900 hover:underline">
              Sign in
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

const name = ref('')
const company = ref('')
const email = ref('')
const password = ref('')
const loading = ref(false)
const error = ref('')

async function handleRegister() {
  loading.value = true
  error.value = ''
  
  try {
    await authStore.register(email.value, password.value, name.value || undefined, company.value || undefined)
    router.push('/app')
  } catch (err: any) {
    error.value = err.response?.data?.error || 'Registration failed'
  } finally {
    loading.value = false
  }
}
</script>

