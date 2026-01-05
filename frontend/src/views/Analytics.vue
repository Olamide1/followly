<template>
  <div>
    <div class="page-header">
      <div class="flex justify-between items-center">
        <div>
          <h1 class="page-title">Analytics</h1>
          <p class="page-description">Track your email performance</p>
        </div>
        <button 
          @click="refreshAnalytics" 
          :disabled="loading"
          class="btn btn-secondary flex items-center gap-2"
        >
          <svg v-if="!loading" xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          <svg v-else class="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          {{ loading ? 'Refreshing...' : 'Refresh' }}
        </button>
      </div>
    </div>

    <div v-if="loading" class="text-center py-24">
      <p class="text-ink-500 text-sm tracking-wider">LOADING...</p>
    </div>

    <div v-else-if="stats && (stats.emails?.sent > 0 || stats.emails?.delivered > 0)" class="space-y-6">
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 sm:gap-8">
        <div class="stat-card">
          <div class="stat-label">Total Sent</div>
          <div class="stat-value">{{ stats?.emails?.sent || 0 }}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Open Rate</div>
          <div class="stat-value">{{ stats?.emails?.openRate || '0.00' }}%</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Click Rate</div>
          <div class="stat-value">{{ stats?.emails?.clickRate || '0.00' }}%</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Delivery Rate</div>
          <div class="stat-value">{{ stats?.emails?.deliveryRate || '0.00' }}%</div>
        </div>
      </div>

      <div class="bg-paper border border-grid-light p-8">
        <h3 class="text-sm font-normal text-ink-500 uppercase tracking-wider mb-8">Performance Overview</h3>
        <div class="space-y-6">
          <div class="flex justify-between items-center border-b border-grid-light pb-4">
            <span class="text-ink-600 text-sm">Emails Delivered</span>
            <span class="text-ink-900 text-lg font-light">{{ stats?.emails?.delivered || 0 }}</span>
          </div>
          <div class="flex justify-between items-center border-b border-grid-light pb-4">
            <span class="text-ink-600 text-sm">Emails Opened</span>
            <span class="text-ink-900 text-lg font-light">{{ stats?.emails?.opened || 0 }}</span>
          </div>
          <div class="flex justify-between items-center border-b border-grid-light pb-4">
            <span class="text-ink-600 text-sm">Emails Clicked</span>
            <span class="text-ink-900 text-lg font-light">{{ stats?.emails?.clicked || 0 }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Empty state -->
    <div v-else class="text-center py-24">
      <div class="max-w-md mx-auto">
        <div class="border-l-2 border-ink-900 pl-6 mb-8 text-left">
          <h3 class="text-sm font-normal text-ink-500 uppercase tracking-wider mb-4">No Analytics Yet</h3>
          <p class="text-ink-700 leading-relaxed mb-6">
            Send your first campaign to start tracking email performance metrics like open rates, click rates, and delivery rates.
          </p>
          <router-link to="/app/campaigns/new" class="block btn btn-primary w-full text-center">
            Create Your First Campaign
          </router-link>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import api from '@/services/api'

const stats = ref<any>(null)
const loading = ref(true)

const loadAnalytics = async () => {
  try {
    loading.value = true
    const response = await api.get('/analytics/dashboard')
    stats.value = response.data
  } catch (error) {
    console.error('Failed to load analytics:', error)
  } finally {
    loading.value = false
  }
}

const refreshAnalytics = async () => {
  await loadAnalytics()
}

onMounted(() => {
  loadAnalytics()
})
</script>

