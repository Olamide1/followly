<template>
  <div class="min-h-screen bg-paper flex items-center justify-center px-4 py-12">
    <div class="max-w-md w-full">
      <!-- Logo/Branding -->
      <div class="text-center mb-8">
        <h1 class="text-2xl font-medium text-ink-900 mb-2">Email Preferences</h1>
        <p class="text-sm text-ink-600">Manage your email subscription preferences</p>
      </div>

      <!-- Loading State -->
      <div v-if="loading" class="bg-paper border border-grid-light p-8 text-center">
        <div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-ink-900 mb-4"></div>
        <p class="text-sm text-ink-600">Loading your preferences...</p>
      </div>

      <!-- Success State -->
      <div v-else-if="updateSuccess" class="bg-paper border border-grid-light p-8">
        <div class="text-center mb-6">
          <div class="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 mb-4">
            <svg class="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
            </svg>
          </div>
          <h2 class="text-lg font-medium text-ink-900 mb-2">Preferences Updated</h2>
          <p class="text-sm text-ink-600 mb-4">
            Your email preferences have been updated successfully.
          </p>
          <p v-if="email" class="text-xs text-ink-500">
            {{ email }}
          </p>
        </div>
        <div class="border-t border-grid-light pt-6">
          <button
            @click="resetAndReload"
            class="btn btn-primary w-full"
          >
            Continue
          </button>
        </div>
      </div>

      <!-- Error State -->
      <div v-else-if="error && !preferences" class="bg-paper border border-grid-light p-8">
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

      <!-- Preferences Form -->
      <div v-else-if="preferences" class="bg-paper border border-grid-light p-8">
        <div class="mb-6">
          <div v-if="email" class="bg-ink-50 border border-grid-light p-3 rounded mb-4">
            <p class="text-xs text-ink-500 uppercase tracking-wider mb-1">Email Address</p>
            <p class="text-sm text-ink-900 font-medium">{{ email }}</p>
            <p v-if="preferences.name" class="text-xs text-ink-600 mt-1">{{ preferences.name }}</p>
          </div>

          <div class="mb-6">
            <label class="block text-xs font-normal text-ink-500 uppercase tracking-wider mb-3">
              Subscription Status
            </label>
            <div class="space-y-3">
              <label class="flex items-center border border-grid-light p-4 rounded hover:border-ink-400 transition-colors cursor-pointer">
                <input
                  type="radio"
                  v-model="subscriptionStatus"
                  value="subscribed"
                  class="mr-3"
                />
                <div class="flex-1">
                  <p class="text-sm font-medium text-ink-900">Subscribed</p>
                  <p class="text-xs text-ink-600 mt-1">You'll receive all marketing emails from us</p>
                </div>
              </label>
              <label class="flex items-center border border-grid-light p-4 rounded hover:border-ink-400 transition-colors cursor-pointer">
                <input
                  type="radio"
                  v-model="subscriptionStatus"
                  value="unsubscribed"
                  class="mr-3"
                />
                <div class="flex-1">
                  <p class="text-sm font-medium text-ink-900">Unsubscribed</p>
                  <p class="text-xs text-ink-600 mt-1">You won't receive marketing emails. Transactional emails may still be sent.</p>
                </div>
              </label>
            </div>
          </div>

          <div v-if="error" class="mb-4 p-3 bg-red-50 border border-red-200 rounded">
            <p class="text-sm text-red-700">{{ errorMessage }}</p>
          </div>
        </div>

        <div class="space-y-3">
          <button
            @click="handleUpdate"
            :disabled="updating || subscriptionStatus === preferences.subscription_status"
            class="btn btn-primary w-full"
          >
            {{ updating ? 'Updating...' : 'Update Preferences' }}
          </button>
          <router-link
            to="/"
            class="block btn btn-secondary w-full text-center"
          >
            Cancel
          </router-link>
        </div>

        <div class="mt-6 pt-6 border-t border-grid-light">
          <p class="text-xs text-ink-500 text-center">
            Need to unsubscribe completely? <router-link to="/unsubscribe" class="text-ink-900 underline">Click here</router-link>
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
const preferences = ref<{
  email: string
  name?: string
  subscription_status: 'subscribed' | 'unsubscribed'
  found: boolean
} | null>(null)
const subscriptionStatus = ref<'subscribed' | 'unsubscribed'>('subscribed')
const loading = ref(false)
const updating = ref(false)
const updateSuccess = ref(false)
const error = ref(false)
const errorMessage = ref('')

function getEmailFromUrl(): string | null {
  const emailParam = route.query.email as string
  if (emailParam) {
    return decodeURIComponent(emailParam)
  }
  return null
}

async function loadPreferences() {
  if (!email.value) {
    error.value = true
    errorMessage.value = 'Email address is required. Please use the preferences link from your email.'
    return
  }

  loading.value = true
  error.value = false

  try {
    const response = await api.get('/compliance/preferences', {
      params: { email: email.value },
    })

    preferences.value = response.data
    subscriptionStatus.value = response.data.subscription_status || 'subscribed'
  } catch (err: any) {
    console.error('Failed to load preferences:', err)
    error.value = true
    errorMessage.value = err.response?.data?.error || 'Failed to load preferences. Please try again later.'
  } finally {
    loading.value = false
  }
}

async function handleUpdate() {
  if (!email.value) {
    error.value = true
    errorMessage.value = 'Email address is required.'
    return
  }

  updating.value = true
  error.value = false
  updateSuccess.value = false

  try {
    const response = await api.post('/compliance/preferences', {
      email: email.value,
      subscription_status: subscriptionStatus.value,
    })

    if (response.data.success) {
      updateSuccess.value = true
      // Update local preferences
      if (preferences.value) {
        preferences.value.subscription_status = subscriptionStatus.value
      }
    } else {
      error.value = true
      errorMessage.value = response.data.message || 'Failed to update preferences. Please try again.'
    }
  } catch (err: any) {
    console.error('Failed to update preferences:', err)
    error.value = true
    errorMessage.value = err.response?.data?.error || 'An error occurred while updating your preferences. Please try again later.'
  } finally {
    updating.value = false
  }
}

function retry() {
  error.value = false
  errorMessage.value = ''
  loadPreferences()
}

function resetAndReload() {
  updateSuccess.value = false
  loadPreferences()
}

onMounted(() => {
  const emailFromUrl = getEmailFromUrl()
  if (emailFromUrl) {
    email.value = emailFromUrl
    loadPreferences()
  } else {
    error.value = true
    errorMessage.value = 'No email address provided. Please use the preferences link from your email.'
  }
})
</script>
