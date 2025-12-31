<template>
  <div>
    <div class="page-header">
      <h1 class="page-title">Analytics</h1>
      <p class="page-description">Track your email performance</p>
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

onMounted(async () => {
  try {
    const response = await api.get('/analytics/dashboard')
    stats.value = response.data
  } catch (error) {
    console.error('Failed to load analytics:', error)
  } finally {
    loading.value = false
  }
})
</script>

