<template>
  <div class="min-h-screen bg-canvas flex items-center justify-center py-24 px-8 relative z-10">
    <div class="max-w-md w-full">
      <div class="text-center mb-16">
        <h1 class="text-2xl font-light text-ink-900 mb-3 tracking-wider">FOLLOWLY</h1>
        <p class="text-ink-600 text-sm tracking-wide">Reset your password</p>
      </div>
      
      <div class="bg-paper border border-grid-light p-12">
        <form @submit.prevent="handleSubmit" class="space-y-8">
          <div>
            <label for="password" class="block text-xs font-normal text-ink-500 uppercase tracking-wider mb-3">
              New Password
            </label>
            <input
              id="password"
              v-model="password"
              type="password"
              required
              minlength="8"
              class="input"
              placeholder="••••••••"
            />
            <p class="text-xs text-ink-500 mt-2">Password must be at least 8 characters long</p>
          </div>
          
          <div>
            <label for="confirmPassword" class="block text-xs font-normal text-ink-500 uppercase tracking-wider mb-3">
              Confirm Password
            </label>
            <input
              id="confirmPassword"
              v-model="confirmPassword"
              type="password"
              required
              minlength="8"
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
            {{ loading ? 'RESETTING...' : 'RESET PASSWORD' }}
          </button>
        </form>
        
        <div class="mt-8 pt-8 border-t border-grid-light text-center">
          <p class="text-xs text-ink-600 tracking-wide">
            Remember your password?
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
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import api from '@/services/api'

const route = useRoute()
const router = useRouter()

const password = ref('')
const confirmPassword = ref('')
const loading = ref(false)
const error = ref('')
const token = ref<string>('')
const email = ref<string>('')

function getParamsFromUrl(): { token: string | null; email: string | null } {
  const tokenParam = route.query.token as string
  const emailParam = route.query.email as string
  return {
    token: tokenParam || null,
    email: emailParam ? decodeURIComponent(emailParam) : null,
  }
}

onMounted(() => {
  const params = getParamsFromUrl()
  if (!params.token || !params.email) {
    error.value = 'Invalid reset link. Please request a new password reset.'
  } else {
    token.value = params.token
    email.value = params.email
  }
})

async function handleSubmit() {
  if (password.value !== confirmPassword.value) {
    error.value = 'Passwords do not match'
    return
  }

  if (password.value.length < 8) {
    error.value = 'Password must be at least 8 characters long'
    return
  }

  loading.value = true
  error.value = ''
  
  try {
    await api.post('/auth/reset-password', {
      token: token.value,
      email: email.value,
      password: password.value,
    })
    
    // Redirect to login with success message
    router.push('/login?reset=success')
  } catch (err: any) {
    error.value = err.response?.data?.error || 'Failed to reset password'
  } finally {
    loading.value = false
  }
}
</script>
