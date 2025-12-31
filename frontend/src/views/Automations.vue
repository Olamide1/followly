<template>
  <div>
    <div class="page-header flex justify-between items-center">
      <div>
        <h1 class="page-title">Automations</h1>
        <p class="page-description">Manage your email automations</p>
      </div>
      <router-link to="/app/automations/new" class="btn btn-primary">
        Create Automation
      </router-link>
    </div>

    <div v-if="loading" class="text-center py-24">
      <p class="text-ink-500 text-sm tracking-wider">LOADING...</p>
    </div>

    <div v-else-if="automations.length > 0" class="space-y-4">
      <div
        v-for="automation in automations"
        :key="automation.id"
        class="bg-paper border border-grid-light p-6 hover:border-ink-400 transition-colors"
      >
        <div class="flex justify-between items-start">
          <div class="flex-1">
            <div class="flex items-center space-x-3 mb-2">
              <h3 class="text-lg font-light text-ink-900">{{ automation.name }}</h3>
              <span
                class="text-xs uppercase tracking-wider"
                :class="
                  automation.status === 'active'
                    ? 'text-ink-900'
                    : 'text-ink-500'
                "
              >
                {{ automation.status }}
              </span>
            </div>
            <p class="text-sm text-ink-600 mb-2">{{ automation.description || 'No description' }}</p>
            <p class="text-xs text-ink-500 uppercase tracking-wider">
              Trigger: {{ automation.trigger_type }}
            </p>
          </div>
          <div class="flex space-x-2 ml-4">
            <button
              @click="$router.push(`/app/automations/${automation.id}`)"
              class="btn btn-ghost text-xs"
            >
              Edit
            </button>
            <button
              v-if="automation.status === 'active'"
              @click="pauseAutomation(automation.id)"
              class="btn text-xs"
            >
              Pause
            </button>
            <button
              v-else
              @click="activateAutomation(automation.id)"
              class="btn btn-primary text-xs"
            >
              Activate
            </button>
            <button
              @click="deleteAutomation(automation.id)"
              class="btn btn-ghost text-xs text-ink-500"
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Empty state -->
    <div v-else class="text-center py-24">
      <div class="max-w-md mx-auto">
        <div class="border-l-2 border-ink-900 pl-6 mb-8 text-left">
          <h3 class="text-sm font-normal text-ink-500 uppercase tracking-wider mb-4">No Automations Yet</h3>
          <p class="text-ink-700 leading-relaxed mb-6">
            Create automated email sequences that trigger based on contact actions or properties.
          </p>
          <router-link to="/app/automations/new" class="block btn btn-primary w-full text-center">
            Create Your First Automation
          </router-link>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import api from '@/services/api'

const automations = ref<any[]>([])
const loading = ref(true)

async function loadAutomations() {
  loading.value = true
  try {
    const response = await api.get('/automations')
    automations.value = response.data.automations
  } catch (error) {
    console.error('Failed to load automations:', error)
  } finally {
    loading.value = false
  }
}

async function pauseAutomation(id: number) {
  try {
    await api.post(`/automations/${id}/pause`)
    loadAutomations()
  } catch (error) {
    console.error('Failed to pause automation:', error)
  }
}

async function activateAutomation(id: number) {
  try {
    await api.post(`/automations/${id}/activate`)
    loadAutomations()
  } catch (error) {
    console.error('Failed to activate automation:', error)
  }
}

async function deleteAutomation(id: number) {
  if (!confirm('Are you sure you want to delete this automation?')) return
  
  try {
    await api.delete(`/automations/${id}`)
    loadAutomations()
  } catch (error: any) {
    console.error('Failed to delete automation:', error)
    const errorMessage = error.response?.data?.error || error.message || 'Failed to delete automation'
    alert(errorMessage)
    // Don't reload or redirect - just show error and keep user on page
  }
}

onMounted(() => {
  loadAutomations()
})
</script>

