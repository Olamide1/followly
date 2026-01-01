<template>
  <div>
    <div class="page-header">
      <h1 class="page-title">Dashboard</h1>
      <p class="page-description">Overview of your email automation</p>
    </div>

    <div v-if="loading" class="text-center py-24">
      <p class="text-ink-500 text-sm tracking-wider">LOADING...</p>
    </div>

    <div v-else-if="stats && (stats.contacts?.total > 0 || stats.campaigns?.total > 0 || stats.emails?.sent > 0)">
      <!-- Stats grid - Agnes Martin style, mobile responsive -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 sm:gap-8 mb-12 sm:mb-16">
        <div class="stat-card">
          <div class="stat-label">Total Contacts</div>
          <div class="stat-value">{{ stats?.contacts?.total || 0 }}</div>
        </div>
        
        <div class="stat-card">
          <div class="stat-label">Campaigns</div>
          <div class="stat-value">{{ stats?.campaigns?.total || 0 }}</div>
        </div>
        
        <!-- DISABLED: Temporarily commented out -->
        <!-- <div class="stat-card">
          <div class="stat-label">Automations</div>
          <div class="stat-value">{{ stats?.automations?.total || 0 }}</div>
        </div> -->
        
        <div class="stat-card">
          <div class="stat-label">Emails Sent (30d)</div>
          <div class="stat-value">{{ stats?.emails?.sent || 0 }}</div>
        </div>
      </div>

      <!-- Grid line separator -->
      <div class="grid-line my-12 sm:my-16"></div>

      <!-- Performance and Actions - two column grid, mobile responsive -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-8 sm:gap-12 lg:gap-16">
        <div>
          <h3 class="text-sm font-normal text-ink-500 uppercase tracking-wider mb-8">Email Performance</h3>
          <div class="space-y-6">
            <div class="flex justify-between items-center border-b border-grid-light pb-4">
              <span class="text-ink-600 text-sm">Open Rate</span>
              <span class="text-ink-900 text-lg font-light">{{ stats?.emails?.openRate || '0.00' }}%</span>
            </div>
            <div class="flex justify-between items-center border-b border-grid-light pb-4">
              <span class="text-ink-600 text-sm">Click Rate</span>
              <span class="text-ink-900 text-lg font-light">{{ stats?.emails?.clickRate || '0.00' }}%</span>
            </div>
            <div class="flex justify-between items-center border-b border-grid-light pb-4">
              <span class="text-ink-600 text-sm">Delivery Rate</span>
              <span class="text-ink-900 text-lg font-light">{{ stats?.emails?.deliveryRate || '0.00' }}%</span>
            </div>
          </div>
        </div>

        <div>
          <h3 class="text-sm font-normal text-ink-500 uppercase tracking-wider mb-8">Quick Actions</h3>
          <div class="space-y-3">
            <router-link to="/app/contacts/new" class="block btn btn-primary w-full text-center">
              Add Contact
            </router-link>
            <router-link to="/app/campaigns/new" class="block btn w-full text-center">
              Create Campaign
            </router-link>
            <!-- DISABLED: Temporarily commented out -->
            <!-- <router-link to="/app/automations/new" class="block btn w-full text-center">
              Create Automation
            </router-link> -->
          </div>
        </div>
      </div>
    </div>

    <!-- Empty state -->
    <div v-else class="text-center py-24">
      <div class="max-w-md mx-auto">
        <div class="border-l-2 border-ink-900 pl-6 mb-8 text-left">
          <h3 class="text-sm font-normal text-ink-500 uppercase tracking-wider mb-4">Welcome to Followly</h3>
          <p class="text-ink-700 leading-relaxed mb-6">
            Get started by adding your first contact or creating a campaign.
          </p>
          <div class="space-y-3">
            <router-link to="/app/contacts/new" class="block btn btn-primary w-full text-center">
              Add Your First Contact
            </router-link>
            <router-link to="/app/campaigns/new" class="block btn w-full text-center">
              Create Your First Campaign
            </router-link>
          </div>
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

const error = ref<string | null>(null)

onMounted(async () => {
  try {
    const response = await api.get('/analytics/dashboard')
    stats.value = response.data
    error.value = null
  } catch (err: any) {
    console.error('Failed to load dashboard stats:', err)
    error.value = err.response?.data?.error || 'Failed to load dashboard'
    stats.value = null
  } finally {
    loading.value = false
  }
})
</script>

