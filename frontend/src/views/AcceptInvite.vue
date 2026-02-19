<template>
  <div class="min-h-screen bg-canvas flex items-center justify-center py-24 px-8 relative z-10">
    <div class="max-w-md w-full">
      <div class="text-center mb-16">
        <h1 class="text-2xl font-light text-ink-900 mb-3 tracking-wider">FOLLOWLY</h1>
        <p class="text-ink-600 text-sm tracking-wide">Join your team</p>
      </div>

      <div class="bg-paper border border-grid-light p-12">
        <!-- Loading state -->
        <div v-if="loadingInfo" class="text-center py-8">
          <p class="text-ink-500 text-sm">Loading invitation details...</p>
        </div>

        <!-- Invalid/expired invite -->
        <div v-else-if="!inviteValid" class="text-center py-8">
          <p class="text-ink-700 text-sm mb-4">{{ inviteError || 'This invitation is invalid or has expired.' }}</p>
          <router-link to="/login" class="text-ink-900 text-sm hover:underline">Go to login</router-link>
        </div>

        <!-- Valid invite - show form -->
        <div v-else>
          <div class="mb-8 pb-8 border-b border-grid-light">
            <p class="text-ink-600 text-sm">
              You've been invited to join <strong class="text-ink-900">{{ teamName }}</strong>
              <span v-if="inviterName"> by {{ inviterName }}</span>.
            </p>
          </div>

          <form @submit.prevent="handleSubmit" class="space-y-8">
            <div>
              <label class="block text-xs font-normal text-ink-500 uppercase tracking-wider mb-3">
                Email
              </label>
              <input
                :value="inviteEmail"
                type="email"
                disabled
                class="input bg-canvas"
              />
            </div>

            <div>
              <label for="name" class="block text-xs font-normal text-ink-500 uppercase tracking-wider mb-3">
                Your Name
              </label>
              <input
                id="name"
                v-model="name"
                type="text"
                required
                class="input"
                placeholder="Enter your name"
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
                minlength="8"
                class="input"
                placeholder="At least 8 characters"
              />
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
                placeholder="Confirm your password"
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
              {{ loading ? 'JOINING...' : 'JOIN TEAM' }}
            </button>
          </form>
        </div>

        <div class="mt-8 pt-8 border-t border-grid-light text-center">
          <p class="text-xs text-ink-600 tracking-wide">
            Already have an account?
            <router-link to="/login" class="text-ink-900 hover:underline">Sign in</router-link>
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import api from '@/services/api'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()

const loadingInfo = ref(true)
const loading = ref(false)
const inviteValid = ref(false)
const inviteError = ref('')
const inviteEmail = ref('')
const teamName = ref('')
const inviterName = ref('')
const name = ref('')
const password = ref('')
const confirmPassword = ref('')
const error = ref('')
const token = ref('')

onMounted(async () => {
  token.value = route.query.token as string || ''
  if (!token.value) {
    inviteError.value = 'No invitation token provided.'
    loadingInfo.value = false
    return
  }

  try {
    const response = await api.get(`/auth/invite-info?token=${token.value}`)
    if (response.data.valid) {
      inviteValid.value = true
      inviteEmail.value = response.data.email
      teamName.value = response.data.teamName
      inviterName.value = response.data.inviterName
    } else {
      inviteError.value = 'This invitation has expired or already been used.'
    }
  } catch (err: any) {
    inviteError.value = err.response?.data?.error || 'Failed to load invitation.'
  } finally {
    loadingInfo.value = false
  }
})

async function handleSubmit() {
  if (password.value !== confirmPassword.value) {
    error.value = 'Passwords do not match'
    return
  }
  if (password.value.length < 8) {
    error.value = 'Password must be at least 8 characters'
    return
  }

  loading.value = true
  error.value = ''

  try {
    const response = await api.post('/auth/accept-invite', {
      token: token.value,
      name: name.value,
      password: password.value,
    })

    if (response.data.token) {
      localStorage.setItem('token', response.data.token)
      authStore.syncToken()
      await authStore.fetchUser()
      router.push('/app')
    }
  } catch (err: any) {
    error.value = err.response?.data?.error || 'Failed to accept invitation'
  } finally {
    loading.value = false
  }
}
</script>
