<template>
  <div class="min-h-screen bg-paper flex items-center justify-center px-4 py-12">
    <div class="max-w-md w-full">
      <!-- Logo/Branding (optional) -->
      <div class="text-center mb-8">
        <h1 class="text-2xl font-medium text-ink-900 mb-2">Unsubscribe</h1>
        <p class="text-sm text-ink-600">Manage your email preferences</p>
      </div>

      <!-- Loading State -->
      <div v-if="loading" class="bg-paper border border-grid-light p-8 text-center">
        <div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-ink-900 mb-4"></div>
        <p class="text-sm text-ink-600">Processing your request...</p>
      </div>

      <!-- Success State -->
      <div v-else-if="success" class="bg-paper border border-grid-light p-8">
        <div class="text-center mb-6">
          <div class="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 mb-4">
            <svg class="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
            </svg>
          </div>
          <h2 class="text-lg font-medium text-ink-900 mb-2">You've been unsubscribed</h2>
          <p class="text-sm text-ink-600 mb-4">
            We're sorry to see you go. You won't receive any more emails from us.
          </p>
          <p v-if="email" class="text-xs text-ink-500">
            {{ email }}
          </p>
        </div>
        <div class="border-t border-grid-light pt-6 text-center">
          <p class="text-xs text-ink-500 mb-4">
            Changed your mind? You can resubscribe at any time by contacting us or updating your preferences.
          </p>
        </div>
      </div>

      <!-- Already Unsubscribed State -->
      <div v-else-if="alreadyUnsubscribed" class="bg-paper border border-grid-light p-8">
        <div class="text-center mb-6">
          <div class="inline-flex items-center justify-center w-16 h-16 rounded-full bg-ink-100 mb-4">
            <svg class="w-8 h-8 text-ink-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
          </div>
          <h2 class="text-lg font-medium text-ink-900 mb-2">Already Unsubscribed</h2>
          <p class="text-sm text-ink-600 mb-4">
            This email address is already unsubscribed from our mailing list.
          </p>
          <p v-if="email" class="text-xs text-ink-500">
            {{ email }}
          </p>
        </div>
      </div>

      <!-- Error State -->
      <div v-else-if="error" class="bg-paper border border-grid-light p-8">
        <div class="text-center mb-6">
          <div class="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-100 mb-4">
            <svg class="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
            </svg>
          </div>
          <h2 class="text-lg font-medium text-ink-900 mb-2">Something went wrong</h2>
          <p class="text-sm text-ink-600 mb-4">
            {{ errorMessage }}
          </p>
        </div>
        <div class="border-t border-grid-light pt-6">
          <button
            @click="retry"
            class="btn btn-primary w-full"
          >
            Try Again
          </button>
        </div>
      </div>

      <!-- Confirmation Form -->
      <div v-else class="bg-paper border border-grid-light p-8">
        <div class="mb-6">
          <p class="text-sm text-ink-700 mb-4">
            We're sorry to see you go. Are you sure you want to unsubscribe from our emails?
          </p>
          <div v-if="email" class="bg-ink-50 border border-grid-light p-3 rounded mb-4">
            <p class="text-xs text-ink-500 uppercase tracking-wider mb-1">Email Address</p>
            <p class="text-sm text-ink-900 font-medium">{{ email }}</p>
          </div>
          <p class="text-xs text-ink-600">
            You'll stop receiving all marketing emails from us. Transactional emails (like order confirmations) may still be sent.
          </p>
        </div>

        <div class="space-y-3">
          <button
            @click="handleUnsubscribe"
            class="btn btn-primary w-full"
          >
            Yes, Unsubscribe Me
          </button>
          <button
            @click="cancel"
            class="btn btn-secondary w-full"
          >
            Cancel
          </button>
        </div>

        <div class="mt-6 pt-6 border-t border-grid-light">
          <p class="text-xs text-ink-500 text-center">
            Changed your mind? You can always resubscribe later or update your email preferences.
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import api from '@/services/api'

const route = useRoute()
const email = ref<string>('')
const loading = ref(false)
const success = ref(false)
const error = ref(false)
const alreadyUnsubscribed = ref(false)
const errorMessage = ref('')

function getEmailFromUrl(): string | null {
  // Get email from query parameter
  const emailParam = route.query.email as string
  if (emailParam) {
    return decodeURIComponent(emailParam)
  }
  return null
}

async function handleUnsubscribe() {
  if (!email.value) {
    error.value = true
    errorMessage.value = 'Email address is required. Please use the unsubscribe link from your email.'
    return
  }

  loading.value = true
  error.value = false
  alreadyUnsubscribed.value = false

  try {
    const response = await api.post('/compliance/unsubscribe', {
      email: email.value,
    })

    if (response.data.success) {
      success.value = true
    } else {
      error.value = true
      errorMessage.value = response.data.message || 'Failed to unsubscribe. Please try again.'
    }
  } catch (err: any) {
    console.error('Unsubscribe error:', err)
    
    // Check if already unsubscribed
    if (err.response?.status === 400 && 
        (err.response?.data?.message?.toLowerCase().includes('already') ||
         err.response?.data?.error?.toLowerCase().includes('already'))) {
      alreadyUnsubscribed.value = true
    } else {
      error.value = true
      errorMessage.value = err.response?.data?.message || 
                          err.response?.data?.error || 
                          'An error occurred while processing your request. Please try again later.'
    }
  } finally {
    loading.value = false
  }
}

function retry() {
  error.value = false
  errorMessage.value = ''
  // Reset to confirmation state
}

function cancel() {
  // Just show a message or redirect
  window.location.href = '/'
}

onMounted(() => {
  const emailFromUrl = getEmailFromUrl()
  if (emailFromUrl) {
    email.value = emailFromUrl
    // Optionally auto-process if you want one-click unsubscribe
    // For better UX, we'll show confirmation first
  } else {
    error.value = true
    errorMessage.value = 'No email address provided. Please use the unsubscribe link from your email.'
  }
})
</script>

