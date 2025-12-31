<template>
  <div>
    <div class="page-header">
      <h1 class="page-title">{{ isEdit ? 'Edit Automation' : 'Create Automation' }}</h1>
    </div>

    <div class="card max-w-4xl">
      <form @submit.prevent="handleSubmit" class="space-y-6">
        <div>
          <label for="name" class="block text-sm font-medium text-structure-700 mb-2">
            Automation Name *
          </label>
          <input id="name" v-model="form.name" type="text" required class="input" />
        </div>

        <div>
          <label for="description" class="block text-sm font-medium text-structure-700 mb-2">
            Description
          </label>
          <textarea id="description" v-model="form.description" rows="2" class="input" />
        </div>

        <div class="p-4 bg-structure-50 rounded-lg">
          <p class="text-sm text-structure-600">
            Automation builder with triggers and steps coming soon. For now, use the API to create automations.
          </p>
        </div>

        <div v-if="error" class="text-red-600 text-sm">
          {{ error }}
        </div>

        <div class="flex justify-end space-x-3">
          <router-link to="/app/automations" class="btn btn-secondary">Cancel</router-link>
          <button type="submit" :disabled="loading" class="btn btn-primary">
            {{ loading ? 'Saving...' : 'Save' }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import api from '@/services/api'

const route = useRoute()
const router = useRouter()

const isEdit = computed(() => !!route.params.id)
const loading = ref(false)
const error = ref('')

const form = ref({
  name: '',
  description: '',
  trigger: {
    type: 'contact_created',
    config: {},
  },
  steps: [],
})

onMounted(async () => {
  if (isEdit.value) {
    try {
      const response = await api.get(`/automations/${route.params.id}`)
      Object.assign(form.value, response.data.automation)
    } catch (err) {
      console.error('Failed to load automation:', err)
    }
  }
})

async function handleSubmit() {
  loading.value = true
  error.value = ''

  try {
    if (isEdit.value) {
      await api.put(`/automations/${route.params.id}`, form.value)
    } else {
      await api.post('/automations', form.value)
    }
    router.push('/app/automations')
  } catch (err: any) {
    error.value = err.response?.data?.error || 'Failed to save automation'
  } finally {
    loading.value = false
  }
}
</script>

