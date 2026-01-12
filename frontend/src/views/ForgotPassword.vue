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
          
          <div v-if="success" class="text-green-700 text-sm border-l-2 border-green-600 pl-4">
            {{ successMessage }}
          </div>
          
          <div v-if="error" class="text-ink-700 text-sm border-l-2 border-ink-900 pl-4">
            {{ error }}
          </div>
          
          <button
            type="submit"
            :disabled="loading"
            class="w-full btn btn-primary"
          >
            {{ loading ? 'SENDING...' : 'SEND RESET LINK' }}
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
import { ref } from 'vue'
import api from '@/services/api'

const email = ref('')
const loading = ref(false)
const error = ref('')
const success = ref(false)
const successMessage = ref('')

async function handleSubmit() {
  loading.value = true
  error.value = ''
  success.value = false
  
  try {
    const response = await api.post('/auth/forgot-password', { email: email.value })
    success.value = true
    successMessage.value = response.data.message || 'If the email exists, a password reset link has been sent.'
  } catch (err: any) {
    error.value = err.response?.data?.error || 'Failed to send reset link'
  } finally {
    loading.value = false
  }
}
</script>
