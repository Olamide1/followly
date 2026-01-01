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
            <p class="text-sm text-ink-600 mb-2">{{ campaign.subject }}</p>
            <div v-if="campaign.scheduled_at && campaign.status === 'scheduled'" class="mb-4">
              <p class="text-xs text-ink-600">
                Scheduled for: <span class="font-medium text-ink-900">{{ formatScheduledTime(campaign.scheduled_at) }}</span>
              </p>
              <p class="text-xs text-ink-500 mt-1">Timezone: {{ userTimezone }}</p>
            </div>
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
              @click="showScheduleModal(campaign)"
              class="btn btn-ghost text-xs text-ink-700"
            >
              Schedule
            </button>
            <button
              v-if="campaign.status === 'draft'"
              @click="sendCampaign(campaign.id)"
              class="btn btn-primary text-xs"
            >
              Send Now
            </button>
            <button
              v-if="campaign.status === 'scheduled'"
              @click="cancelSchedule(campaign.id)"
              class="btn btn-ghost text-xs text-ink-600"
            >
              Cancel Schedule
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

    <!-- Schedule Modal -->
    <div
      v-if="showScheduleDialog"
      class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      @click.self="showScheduleDialog = false"
    >
      <div class="bg-paper border border-grid-light p-8 max-w-md w-full mx-4">
        <h2 class="text-lg font-light text-ink-900 mb-6">Schedule Campaign</h2>
        
        <div class="space-y-4 mb-6">
          <div>
            <label for="schedule_date" class="block text-xs font-normal text-ink-500 uppercase tracking-wider mb-3">
              Date *
            </label>
            <input
              id="schedule_date"
              v-model="scheduleDate"
              type="date"
              required
              :min="minDate"
              class="input w-full"
            />
          </div>
          <div>
            <label for="schedule_time" class="block text-xs font-normal text-ink-500 uppercase tracking-wider mb-3">
              Time *
            </label>
            <input
              id="schedule_time"
              v-model="scheduleTime"
              type="time"
              required
              class="input w-full"
            />
          </div>
            <div v-if="scheduleDateTime" class="p-3 bg-ink-50 border border-grid-medium">
              <p class="text-xs text-ink-600 mb-1">Scheduled for:</p>
              <p class="text-sm font-medium text-ink-900">{{ formatScheduledTime(scheduleDateTime) }}</p>
              <p class="text-xs text-ink-500 mt-1">Timezone: {{ userTimezone }}</p>
            </div>
        </div>

        <div v-if="scheduleError" class="text-sm text-ink-700 border-l-2 border-ink-900 pl-4 mb-4">
          {{ scheduleError }}
        </div>

        <div class="flex justify-end space-x-3">
          <button
            @click="showScheduleDialog = false"
            class="btn btn-ghost text-xs"
          >
            Cancel
          </button>
          <button
            @click="confirmSchedule"
            :disabled="!scheduleDateTime || scheduling"
            class="btn btn-primary text-xs"
          >
            {{ scheduling ? 'SCHEDULING...' : 'SCHEDULE' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import api from '@/services/api'

const campaigns = ref<any[]>([])
const loading = ref(true)
const showScheduleDialog = ref(false)
const scheduleDate = ref('')
const scheduleTime = ref('')
const scheduleError = ref('')
const scheduling = ref(false)
const selectedCampaign = ref<any>(null)

// Get user's timezone
const userTimezone = computed(() => {
  return Intl.DateTimeFormat().resolvedOptions().timeZone
})

// Get minimum date (today)
const minDate = computed(() => {
  const today = new Date()
  return today.toISOString().split('T')[0]
})

// Computed scheduled datetime
const scheduleDateTime = computed(() => {
  if (!scheduleDate.value || !scheduleTime.value) {
    return null
  }
  // Combine date and time, convert to ISO string
  const dateTime = new Date(`${scheduleDate.value}T${scheduleTime.value}`)
  return dateTime.toISOString()
})

function getStatusClass(status: string) {
  const classes: Record<string, string> = {
    draft: 'text-ink-500',
    scheduled: 'text-ink-600',
    sending: 'text-ink-700',
    sent: 'text-ink-900',
  }
  return classes[status] || 'text-ink-500'
}

function formatScheduledTime(isoString: string): string {
  const date = new Date(isoString)
  return date.toLocaleString('en-US', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZoneName: 'short',
  })
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

async function cancelSchedule(id: number) {
  if (!confirm('Are you sure you want to cancel the scheduled send? The campaign will be saved as a draft.')) return
  
  try {
    await api.put(`/campaigns/${id}`, { scheduled_at: null })
    alert('Schedule cancelled. Campaign saved as draft.')
    loadCampaigns()
  } catch (error: any) {
    console.error('Failed to cancel schedule:', error)
    const errorMessage = error.response?.data?.error || error.message || 'Failed to cancel schedule'
    alert(errorMessage)
  }
}

function showScheduleModal(campaign: any) {
  selectedCampaign.value = campaign
  scheduleDate.value = ''
  scheduleTime.value = ''
  scheduleError.value = ''
  showScheduleDialog.value = true
}

async function confirmSchedule() {
  scheduleError.value = ''
  
  if (!scheduleDateTime.value) {
    scheduleError.value = 'Please select a date and time'
    return
  }

  // Check if scheduled time is in the past
  const now = new Date()
  const scheduled = new Date(scheduleDateTime.value)
  if (scheduled <= now) {
    scheduleError.value = 'Scheduled time must be in the future'
    return
  }

  if (!selectedCampaign.value) return

  scheduling.value = true
  try {
    await api.put(`/campaigns/${selectedCampaign.value.id}`, {
      scheduled_at: scheduleDateTime.value
    })
    alert('Campaign scheduled successfully!')
    showScheduleDialog.value = false
    loadCampaigns()
  } catch (error: any) {
    console.error('Failed to schedule campaign:', error)
    scheduleError.value = error.response?.data?.error || error.message || 'Failed to schedule campaign'
  } finally {
    scheduling.value = false
  }
}

onMounted(() => {
  loadCampaigns()
})
</script>

