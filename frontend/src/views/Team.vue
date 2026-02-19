<template>
  <div>
    <div class="mb-12">
      <h1 class="text-xl font-light text-ink-900 tracking-wider">TEAM</h1>
      <p class="text-sm text-ink-500 mt-2">Manage your team members and invitations</p>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="text-center py-16">
      <p class="text-ink-500 text-sm">Loading...</p>
    </div>

    <!-- No team - Create team -->
    <div v-else-if="!team" class="bg-paper border border-grid-light p-12 max-w-lg">
      <h2 class="text-sm font-normal text-ink-900 uppercase tracking-wider mb-6">Create a Team</h2>
      <p class="text-sm text-ink-600 mb-8">
        Create a team to invite members who can access your shared contacts, lists, and campaigns.
      </p>
      <form @submit.prevent="createTeam" class="space-y-6">
        <div>
          <label for="teamName" class="block text-xs font-normal text-ink-500 uppercase tracking-wider mb-3">
            Team Name
          </label>
          <input
            id="teamName"
            v-model="newTeamName"
            type="text"
            required
            class="input"
            placeholder="e.g., Marketing Team"
          />
        </div>
        <div v-if="error" class="text-ink-700 text-sm border-l-2 border-ink-900 pl-4">
          {{ error }}
        </div>
        <button type="submit" :disabled="creating" class="btn btn-primary">
          {{ creating ? 'CREATING...' : 'CREATE TEAM' }}
        </button>
      </form>
    </div>

    <!-- Has team -->
    <div v-else class="space-y-12">
      <!-- Team info -->
      <div class="bg-paper border border-grid-light p-8">
        <div class="flex items-center justify-between mb-6">
          <h2 class="text-sm font-normal text-ink-900 uppercase tracking-wider">{{ team.name }}</h2>
          <span class="text-xs text-ink-500 uppercase tracking-wider">
            {{ authStore.isTeamOwner ? 'Owner' : 'Member' }}
          </span>
        </div>

        <!-- Members list -->
        <div class="space-y-3">
          <div
            v-for="member in team.members"
            :key="member.id"
            class="flex items-center justify-between py-3 border-b border-grid-light last:border-0"
          >
            <div>
              <p class="text-sm text-ink-900">{{ member.name || member.email }}</p>
              <p class="text-xs text-ink-500">{{ member.email }}</p>
            </div>
            <div class="flex items-center space-x-4">
              <span class="text-xs text-ink-500 uppercase tracking-wider">{{ member.team_role }}</span>
              <button
                v-if="authStore.isTeamOwner && member.id !== authStore.user?.id"
                @click="removeMember(member.id, member.name || member.email)"
                class="text-xs text-ink-500 hover:text-ink-900 uppercase tracking-wider"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Invite member (owner only) -->
      <div v-if="authStore.isTeamOwner" class="bg-paper border border-grid-light p-8">
        <h2 class="text-sm font-normal text-ink-900 uppercase tracking-wider mb-6">Invite Member</h2>
        <form @submit.prevent="inviteMember" class="flex items-end space-x-4">
          <div class="flex-1">
            <label for="inviteEmail" class="block text-xs font-normal text-ink-500 uppercase tracking-wider mb-3">
              Email Address
            </label>
            <input
              id="inviteEmail"
              v-model="inviteEmail"
              type="email"
              required
              class="input"
              placeholder="colleague@example.com"
            />
          </div>
          <button type="submit" :disabled="inviting" class="btn btn-primary whitespace-nowrap">
            {{ inviting ? 'SENDING...' : 'SEND INVITE' }}
          </button>
        </form>
        <div v-if="inviteSuccess" class="mt-4 text-sm text-ink-600 border-l-2 border-ink-400 pl-4">
          {{ inviteSuccess }}
        </div>
        <div v-if="inviteError" class="mt-4 text-ink-700 text-sm border-l-2 border-ink-900 pl-4">
          {{ inviteError }}
        </div>
      </div>

      <!-- Pending invitations (owner only) -->
      <div v-if="authStore.isTeamOwner && team.invitations && team.invitations.length > 0" class="bg-paper border border-grid-light p-8">
        <h2 class="text-sm font-normal text-ink-900 uppercase tracking-wider mb-6">Pending Invitations</h2>
        <div class="space-y-3">
          <div
            v-for="invite in team.invitations"
            :key="invite.id"
            class="flex items-center justify-between py-3 border-b border-grid-light last:border-0"
          >
            <div>
              <p class="text-sm text-ink-900">{{ invite.email }}</p>
              <p class="text-xs text-ink-500">Expires {{ formatDate(invite.expires_at) }}</p>
            </div>
            <button
              @click="cancelInvite(invite.id)"
              class="text-xs text-ink-500 hover:text-ink-900 uppercase tracking-wider"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>

      <!-- Leave team (members only) -->
      <div v-if="!authStore.isTeamOwner" class="bg-paper border border-grid-light p-8">
        <h2 class="text-sm font-normal text-ink-900 uppercase tracking-wider mb-6">Leave Team</h2>
        <p class="text-sm text-ink-600 mb-6">
          Leaving the team will transfer your created data to the team owner.
        </p>
        <button
          @click="leaveTeam"
          :disabled="leaving"
          class="btn btn-ghost text-ink-700 hover:text-ink-900"
        >
          {{ leaving ? 'LEAVING...' : 'LEAVE TEAM' }}
        </button>
      </div>

      <div v-if="error" class="text-ink-700 text-sm border-l-2 border-ink-900 pl-4">
        {{ error }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useAuthStore } from '@/stores/auth'
import api from '@/services/api'

const authStore = useAuthStore()

const loading = ref(true)
const creating = ref(false)
const inviting = ref(false)
const leaving = ref(false)
const team = ref<any>(null)
const newTeamName = ref('')
const inviteEmail = ref('')
const error = ref('')
const inviteSuccess = ref('')
const inviteError = ref('')

async function fetchTeam() {
  loading.value = true
  error.value = ''
  try {
    const response = await api.get('/team')
    team.value = response.data.team
  } catch (err: any) {
    error.value = err.response?.data?.error || 'Failed to load team'
  } finally {
    loading.value = false
  }
}

async function createTeam() {
  creating.value = true
  error.value = ''
  try {
    await api.post('/team', { name: newTeamName.value })
    await authStore.fetchUser()
    await fetchTeam()
    newTeamName.value = ''
  } catch (err: any) {
    error.value = err.response?.data?.error || 'Failed to create team'
  } finally {
    creating.value = false
  }
}

async function inviteMember() {
  inviting.value = true
  inviteError.value = ''
  inviteSuccess.value = ''
  try {
    await api.post('/team/invite', { email: inviteEmail.value })
    inviteSuccess.value = `Invitation sent to ${inviteEmail.value}`
    inviteEmail.value = ''
    await fetchTeam()
  } catch (err: any) {
    inviteError.value = err.response?.data?.error || 'Failed to send invitation'
  } finally {
    inviting.value = false
  }
}

async function cancelInvite(inviteId: number) {
  try {
    await api.post(`/team/invite/${inviteId}/cancel`)
    await fetchTeam()
  } catch (err: any) {
    error.value = err.response?.data?.error || 'Failed to cancel invitation'
  }
}

async function removeMember(memberId: number, memberName: string) {
  if (!confirm(`Remove ${memberName} from the team? Their data will be transferred to you.`)) return
  try {
    await api.delete(`/team/members/${memberId}`)
    await fetchTeam()
  } catch (err: any) {
    error.value = err.response?.data?.error || 'Failed to remove member'
  }
}

async function leaveTeam() {
  if (!confirm('Are you sure you want to leave this team? Your data will be transferred to the team owner.')) return
  leaving.value = true
  try {
    await api.post('/team/leave')
    await authStore.fetchUser()
    team.value = null
  } catch (err: any) {
    error.value = err.response?.data?.error || 'Failed to leave team'
  } finally {
    leaving.value = false
  }
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString()
}

onMounted(fetchTeam)
</script>
