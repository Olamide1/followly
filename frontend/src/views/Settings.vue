<template>
  <div>
    <div class="page-header">
      <h1 class="page-title">Settings</h1>
      <p class="page-description">Manage your account and email providers</p>
    </div>

    <div class="space-y-8 sm:space-y-12">
      <div class="bg-paper border border-grid-light p-8">
        <h2 class="text-sm font-normal text-ink-500 uppercase tracking-wider mb-6">Email Providers</h2>
        <p class="text-sm text-ink-600 mb-8 leading-relaxed">
          Connect your own email providers or use Followly's infrastructure.
        </p>
        
        <div v-if="providers.length === 0" class="border-l-2 border-ink-900 pl-6 mb-8">
          <h3 class="text-sm font-normal text-ink-500 uppercase tracking-wider mb-4">No Providers Configured</h3>
          <p class="text-ink-700 leading-relaxed mb-6">
            Add an email provider to start sending campaigns. You can configure Brevo, Mailjet, or Resend.
          </p>
        </div>
        
        <div v-else class="space-y-4">
          <div
            v-for="provider in providers"
            :key="provider.id"
            class="flex justify-between items-center border-b border-grid-light pb-4"
          >
            <div>
              <span class="text-ink-900 uppercase tracking-wider text-sm">{{ provider.provider }}</span>
              <span v-if="provider.is_default" class="ml-3 text-xs text-ink-500 uppercase tracking-wider">(Default)</span>
            </div>
            <button
              @click="deleteProvider(provider.id)"
              class="text-ink-500 hover:text-ink-900 text-xs"
            >
              Remove
            </button>
          </div>
        </div>
      </div>

      <div class="bg-paper border border-grid-light p-8">
        <h2 class="text-sm font-normal text-ink-500 uppercase tracking-wider mb-8">Add Provider</h2>
        <form @submit.prevent="addProvider" class="space-y-6 sm:space-y-8">
          <div>
            <label for="provider" class="block text-xs font-normal text-ink-500 uppercase tracking-wider mb-3">
              Provider
            </label>
            <select id="provider" v-model="providerForm.provider" required class="input">
              <option value="">Select provider</option>
              <option value="brevo">Brevo</option>
              <option value="mailjet">Mailjet</option>
              <option value="resend">Resend</option>
            </select>
          </div>

          <div>
            <label for="api_key" class="block text-xs font-normal text-ink-500 uppercase tracking-wider mb-3">
              API Key
            </label>
            <input id="api_key" v-model="providerForm.api_key" type="text" required class="input" />
          </div>

          <div v-if="providerForm.provider === 'mailjet'">
            <label for="api_secret" class="block text-xs font-normal text-ink-500 uppercase tracking-wider mb-3">
              API Secret
            </label>
            <input id="api_secret" v-model="providerForm.api_secret" type="text" class="input" />
          </div>

          <div>
            <label for="from_email" class="block text-xs font-normal text-ink-500 uppercase tracking-wider mb-3">
              From Email
            </label>
            <input id="from_email" v-model="providerForm.from_email" type="email" class="input" />
          </div>

          <div>
            <label for="daily_limit" class="block text-xs font-normal text-ink-500 uppercase tracking-wider mb-3">
              Daily Limit
            </label>
            <input
              id="daily_limit"
              v-model.number="providerForm.daily_limit"
              type="number"
              class="input"
            />
          </div>

          <div>
            <label class="flex items-center">
              <input
                v-model="providerForm.is_default"
                type="checkbox"
                class="mr-3"
              />
              <span class="text-xs text-ink-600 uppercase tracking-wider">Set as default provider</span>
            </label>
          </div>

          <button type="submit" class="btn btn-primary w-full sm:w-auto">Add Provider</button>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import api from '@/services/api'

const providers = ref<any[]>([])
const providerForm = ref({
  provider: '',
  api_key: '',
  api_secret: '',
  from_email: '',
  daily_limit: 0,
  is_default: false,
})

async function loadProviders() {
  try {
    const response = await api.get('/providers')
    providers.value = response.data.configs
  } catch (error) {
    console.error('Failed to load providers:', error)
  }
}

async function addProvider() {
  try {
    await api.post('/providers', providerForm.value)
    providerForm.value = {
      provider: '',
      api_key: '',
      api_secret: '',
      from_email: '',
      daily_limit: 0,
      is_default: false,
    }
    loadProviders()
  } catch (error) {
    console.error('Failed to add provider:', error)
  }
}

async function deleteProvider(id: number) {
  if (!confirm('Are you sure you want to remove this provider?')) return
  
  try {
    await api.delete(`/providers/${id}`)
    loadProviders()
  } catch (error) {
    console.error('Failed to delete provider:', error)
  }
}

onMounted(() => {
  loadProviders()
})
</script>

