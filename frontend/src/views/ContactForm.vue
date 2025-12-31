<template>
  <div>
    <div class="page-header">
      <h1 class="page-title">{{ isEdit ? 'Edit Contact' : 'New Contact' }}</h1>
    </div>

    <div class="card max-w-2xl">
      <form @submit.prevent="handleSubmit" class="space-y-6">
        <div>
          <label for="email" class="block text-sm font-medium text-structure-700 mb-2">
            Email *
          </label>
          <input
            id="email"
            v-model="form.email"
            type="email"
            required
            class="input"
            :disabled="isEdit"
          />
        </div>

        <div>
          <label for="name" class="block text-sm font-medium text-structure-700 mb-2">
            Name
          </label>
          <input id="name" v-model="form.name" type="text" class="input" />
        </div>

        <div>
          <label for="company" class="block text-sm font-medium text-structure-700 mb-2">
            Company
          </label>
          <input id="company" v-model="form.company" type="text" class="input" />
        </div>

        <div>
          <label for="role" class="block text-sm font-medium text-structure-700 mb-2">
            Role
          </label>
          <input id="role" v-model="form.role" type="text" class="input" />
        </div>

        <div>
          <label for="country" class="block text-sm font-medium text-structure-700 mb-2">
            Country
          </label>
          <input id="country" v-model="form.country" type="text" class="input" />
        </div>

        <div>
          <label for="subscription_status" class="block text-sm font-medium text-structure-700 mb-2">
            Subscription Status
          </label>
          <select id="subscription_status" v-model="form.subscription_status" class="input">
            <option value="subscribed">Subscribed</option>
            <option value="unsubscribed">Unsubscribed</option>
          </select>
        </div>

        <div v-if="error" class="text-red-600 text-sm">
          {{ error }}
        </div>

        <div class="flex justify-end space-x-3">
          <router-link to="/app/contacts" class="btn btn-secondary">Cancel</router-link>
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
  email: '',
  name: '',
  company: '',
  role: '',
  country: '',
  subscription_status: 'subscribed',
})

onMounted(async () => {
  if (isEdit.value) {
    try {
      const response = await api.get(`/contacts/${route.params.id}`)
      Object.assign(form.value, response.data.contact)
    } catch (err) {
      console.error('Failed to load contact:', err)
    }
  }
})

async function handleSubmit() {
  loading.value = true
  error.value = ''

  try {
    if (isEdit.value) {
      await api.put(`/contacts/${route.params.id}`, form.value)
    } else {
      await api.post('/contacts', form.value)
    }
    router.push('/app/contacts')
  } catch (err: any) {
    error.value = err.response?.data?.error || 'Failed to save contact'
  } finally {
    loading.value = false
  }
}
</script>

