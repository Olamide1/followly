<template>
  <div>
    <div class="page-header flex justify-between items-center">
      <div>
        <h1 class="page-title">Campaigns</h1>
        <p class="page-description">Manage your email campaigns</p>
      </div>
      <router-link to="/app/campaigns/new" class="btn btn-primary">
        Create Campaign
      </router-link>
    </div>

    <div v-if="loading" class="text-center py-24">
      <p class="text-ink-500 text-sm tracking-wider">LOADING...</p>
    </div>

    <div v-else-if="campaigns.length > 0" class="space-y-4">
      <div
        v-for="campaign in campaigns"
        :key="campaign.id"
        class="bg-paper border border-grid-light p-6 hover:border-ink-400 transition-colors"
      >
        <div class="flex justify-between items-start">
          <div class="flex-1">
            <div class="flex items-center space-x-3 mb-2">
              <h3 class="text-lg font-light text-ink-900">{{ campaign.name }}</h3>
              <span
                class="text-xs uppercase tracking-wider"
                :class="getStatusClass(campaign.status)"
              >
                {{ campaign.status }}
              </span>
              <span
                class="text-xs uppercase tracking-wider text-ink-500"
              >
                {{ campaign.type }}
              </span>
            </div>
            <p class="text-sm text-ink-600 mb-4">{{ campaign.subject }}</p>
            <div v-if="campaign.stats" class="flex space-x-6 text-sm text-ink-600">
              <span>Sent: {{ campaign.stats.sent }}</span>
              <span>Opens: {{ campaign.stats.openRate }}%</span>
              <span>Clicks: {{ campaign.stats.clickRate }}%</span>
            </div>
          </div>
          <div class="flex space-x-2 ml-4">
            <button
              @click="$router.push(`/app/campaigns/${campaign.id}`)"
              class="btn btn-ghost text-xs"
            >
              Edit
            </button>
            <button
              v-if="campaign.status === 'draft'"
              @click="sendCampaign(campaign.id)"
              class="btn btn-primary text-xs"
            >
              Send
            </button>
            <button
              @click="deleteCampaign(campaign.id)"
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
          <h3 class="text-sm font-normal text-ink-500 uppercase tracking-wider mb-4">No Campaigns Yet</h3>
          <p class="text-ink-700 leading-relaxed mb-6">
            Create your first email campaign to start sending messages to your contacts.
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

const campaigns = ref<any[]>([])
const loading = ref(true)

function getStatusClass(status: string) {
  const classes: Record<string, string> = {
    draft: 'text-ink-500',
    scheduled: 'text-ink-600',
    sending: 'text-ink-700',
    sent: 'text-ink-900',
  }
  return classes[status] || 'text-ink-500'
}

async function loadCampaigns() {
  loading.value = true
  try {
    const response = await api.get('/campaigns')
    campaigns.value = response.data.campaigns
  } catch (error) {
    console.error('Failed to load campaigns:', error)
  } finally {
    loading.value = false
  }
}

async function sendCampaign(id: number) {
  if (!confirm('Are you sure you want to send this campaign?')) return
  
  try {
    const response = await api.post(`/campaigns/${id}/send`)
    alert(`Campaign queued successfully! ${response.data.queued || 0} emails will be sent.`)
    loadCampaigns()
  } catch (error: any) {
    console.error('Failed to send campaign:', error)
    const errorMessage = error.response?.data?.error || 'Failed to send campaign. Please check that the campaign has a list assigned and the list contains contacts.'
    alert(errorMessage)
  }
}

async function deleteCampaign(id: number) {
  if (!confirm('Are you sure you want to delete this campaign?')) return
  
  try {
    await api.delete(`/campaigns/${id}`)
    loadCampaigns()
  } catch (error: any) {
    console.error('Failed to delete campaign:', error)
    const errorMessage = error.response?.data?.error || error.message || 'Failed to delete campaign'
    alert(errorMessage)
    // Don't reload or redirect - just show error and keep user on page
  }
}

onMounted(() => {
  loadCampaigns()
})
</script>

