<template>
  <div>
    <div class="page-header flex justify-between items-center">
      <div>
        <h1 class="page-title">Lists</h1>
        <p class="page-description">Manage your contact lists and segments</p>
      </div>
      <router-link to="/app/lists/new" class="btn btn-primary">
        Create List
      </router-link>
    </div>

    <div v-if="loading" class="text-center py-24">
      <p class="text-ink-500 text-sm tracking-wider">LOADING...</p>
    </div>

    <div v-else-if="lists.length > 0" class="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
      <div
        v-for="list in lists"
        :key="list.id"
        class="bg-paper border border-grid-light p-6 hover:border-ink-400 transition-colors cursor-pointer"
        @click="$router.push(`/app/lists/${list.id}`)"
      >
        <div class="flex justify-between items-start mb-4">
          <h3 class="text-lg font-light text-ink-900">{{ list.name }}</h3>
          <span
            class="text-xs uppercase tracking-wider"
            :class="
              list.type === 'smart'
                ? 'text-ink-700'
                : 'text-ink-500'
            "
          >
            {{ list.type }}
          </span>
        </div>
        <p class="text-sm text-ink-600 mb-4">{{ list.description || 'No description' }}</p>
        <div class="flex justify-between items-center">
          <span class="text-sm text-ink-500">{{ list.contact_count || 0 }} contacts</span>
          <div class="flex space-x-2">
            <button
              @click.stop="$router.push(`/app/lists/${list.id}`)"
              class="text-ink-600 hover:text-ink-900 text-xs"
            >
              Edit
            </button>
            <button
              @click.stop="deleteList(list.id)"
              class="text-ink-500 hover:text-ink-900 text-xs"
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
          <h3 class="text-sm font-normal text-ink-500 uppercase tracking-wider mb-4">No Lists Yet</h3>
          <p class="text-ink-700 leading-relaxed mb-6">
            Organize your contacts into lists or create smart segments based on contact properties.
          </p>
          <router-link to="/app/lists/new" class="block btn btn-primary w-full text-center">
            Create Your First List
          </router-link>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import api from '@/services/api'

const lists = ref<any[]>([])
const loading = ref(true)

async function loadLists() {
  loading.value = true
  try {
    const response = await api.get('/lists')
    lists.value = response.data.lists
  } catch (error) {
    console.error('Failed to load lists:', error)
  } finally {
    loading.value = false
  }
}

async function deleteList(id: number) {
  if (!confirm('Are you sure you want to delete this list?')) return
  
  try {
    await api.delete(`/lists/${id}`)
    loadLists()
  } catch (error: any) {
    console.error('Failed to delete list:', error)
    const errorMessage = error.response?.data?.error || error.message || 'Failed to delete list'
    alert(errorMessage)
    // Don't reload or redirect - just show error and keep user on page
  }
}

onMounted(() => {
  loadLists()
})
</script>

