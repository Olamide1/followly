<template>
  <div>
    <div class="page-header">
      <h1 class="page-title">{{ isEdit ? 'Edit List' : 'Create List' }}</h1>
    </div>

    <div class="card max-w-2xl">
      <form @submit.prevent="handleSubmit" class="space-y-6">
        <div>
          <label for="name" class="block text-xs font-normal text-ink-500 uppercase tracking-wider mb-3">
            Name *
          </label>
          <input id="name" v-model="form.name" type="text" required class="input" />
        </div>

        <div>
          <label for="type" class="block text-xs font-normal text-ink-500 uppercase tracking-wider mb-3">
            Type *
          </label>
          <select id="type" v-model="form.type" required class="input" @change="onTypeChange">
            <option value="static">Static List</option>
            <option value="smart">Smart List</option>
          </select>
        </div>

        <div>
          <label for="description" class="block text-xs font-normal text-ink-500 uppercase tracking-wider mb-3">
            Description
          </label>
          <textarea id="description" v-model="form.description" rows="3" class="input" />
        </div>

        <div v-if="form.type === 'smart'" class="border-l-2 border-ink-900 pl-4 py-3">
          <p class="text-sm text-ink-600">
            Smart lists are automatically updated based on rules. Rules configuration coming soon.
          </p>
        </div>

        <div v-if="error" class="text-red-600 text-sm">
          {{ error }}
        </div>

        <div class="flex justify-end space-x-3">
          <router-link to="/app/lists" class="btn">Cancel</router-link>
          <button type="submit" :disabled="loading" class="btn btn-primary">
            {{ loading ? 'Saving...' : 'Save' }}
          </button>
        </div>
      </form>
    </div>

    <!-- Contact Management Section (only for static lists when editing) -->
    <div v-if="isEdit && form.type === 'static'" class="card max-w-2xl mt-8">
      <div class="flex justify-between items-center mb-6">
        <div>
          <h2 class="text-sm font-normal text-ink-500 uppercase tracking-wider mb-2">Contacts in List</h2>
          <p class="text-xs text-ink-600">{{ listContacts.length }} contacts</p>
        </div>
        <button @click="showAddContactModal = true" class="btn btn-primary text-xs">
          Add Contacts
        </button>
      </div>

      <div v-if="loadingContacts" class="text-center py-12">
        <p class="text-ink-500 text-sm tracking-wider">LOADING...</p>
      </div>

      <div v-else-if="listContacts.length > 0" class="space-y-3">
        <div
          v-for="contact in listContacts"
          :key="contact.id"
          class="flex justify-between items-center border-l-2 border-grid-medium pl-4 py-3 bg-paper"
        >
          <div class="flex-1">
            <p class="text-sm text-ink-900">{{ contact.email }}</p>
            <p v-if="contact.name" class="text-xs text-ink-600">{{ contact.name }}</p>
          </div>
          <button
            @click="removeContact(contact.id)"
            class="text-xs text-ink-500 hover:text-ink-700 uppercase tracking-wider transition-colors"
          >
            Remove
          </button>
        </div>
      </div>

      <div v-else class="text-center py-12">
        <div class="border-l-2 border-ink-900 pl-6 text-left max-w-md mx-auto">
          <h3 class="text-sm font-normal text-ink-500 uppercase tracking-wider mb-4">No Contacts Yet</h3>
          <p class="text-ink-700 leading-relaxed mb-6 text-sm">
            Add contacts to this list to start organizing your audience.
          </p>
          <button @click="showAddContactModal = true" class="btn btn-primary text-xs">
            Add Contacts
          </button>
        </div>
      </div>
    </div>

    <!-- Add Contact Modal -->
    <div
      v-if="showAddContactModal"
      class="fixed inset-0 bg-ink-900 bg-opacity-40 flex items-center justify-center z-50"
      @click="showAddContactModal = false"
    >
      <div class="bg-paper border border-grid-medium p-8 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto" @click.stop>
        <h2 class="text-lg font-light text-ink-900 mb-6 tracking-wide">Add Contacts to List</h2>
        
        <div class="mb-6">
          <input
            v-model="contactSearch"
            type="text"
            placeholder="Search contacts... (leave empty to show all)"
            class="input"
            @input="searchContacts"
          />
        </div>

        <div v-if="loadingAvailableContacts" class="text-center py-12">
          <p class="text-ink-500 text-sm tracking-wider">LOADING...</p>
        </div>

        <div v-else-if="availableContacts.length > 0" class="space-y-2 max-h-96 overflow-y-auto mb-6">
          <div
            v-for="contact in availableContacts"
            :key="contact.id"
            class="flex items-center justify-between border-l-2 border-grid-light pl-4 py-2 hover:border-ink-900 transition-colors"
          >
            <div class="flex-1">
              <p class="text-sm text-ink-900">{{ contact.email }}</p>
              <p v-if="contact.name" class="text-xs text-ink-600">{{ contact.name }}</p>
            </div>
            <button
              @click="addContact(contact.id)"
              :disabled="addingContactId === contact.id"
              class="text-xs text-ink-600 hover:text-ink-900 uppercase tracking-wider transition-colors"
            >
              {{ addingContactId === contact.id ? 'Adding...' : 'Add' }}
            </button>
          </div>
        </div>

        <div v-else class="text-center py-12 mb-6">
          <p class="text-sm text-ink-600">No contacts found</p>
        </div>

        <div class="flex justify-end space-x-4">
          <button @click="showAddContactModal = false" class="btn">Close</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import api from '@/services/api'

const route = useRoute()
const router = useRouter()

const isEdit = computed(() => !!route.params.id)
const loading = ref(false)
const error = ref('')

const form = ref({
  name: '',
  type: 'static',
  description: '',
  rules: null,
})

const listContacts = ref<any[]>([])
const loadingContacts = ref(false)
const showAddContactModal = ref(false)
const availableContacts = ref<any[]>([])
const loadingAvailableContacts = ref(false)
const contactSearch = ref('')
const addingContactId = ref<number | null>(null)

onMounted(async () => {
  if (isEdit.value) {
    try {
      const response = await api.get(`/lists/${route.params.id}`)
      Object.assign(form.value, response.data.list)
      if (form.value.type === 'static') {
        loadListContacts()
      }
    } catch (err) {
      console.error('Failed to load list:', err)
    }
  }
})

watch(() => form.value.type, (newType) => {
  if (isEdit.value && newType === 'static') {
    loadListContacts()
  } else {
    listContacts.value = []
  }
})

async function loadListContacts() {
  if (!isEdit.value) return
  
  loadingContacts.value = true
  try {
    const response = await api.get(`/lists/${route.params.id}/contacts`)
    listContacts.value = response.data.contacts
  } catch (err) {
    console.error('Failed to load list contacts:', err)
  } finally {
    loadingContacts.value = false
  }
}

async function searchContacts() {
  loadingAvailableContacts.value = true
  try {
    const response = await api.get('/contacts', {
      params: {
        search: contactSearch.value.trim() || undefined,
        limit: 100,
      },
    })
    // Filter out contacts already in the list
    const listContactIds = new Set(listContacts.value.map(c => c.id))
    availableContacts.value = response.data.contacts.filter((c: any) => !listContactIds.has(c.id))
  } catch (err) {
    console.error('Failed to search contacts:', err)
    availableContacts.value = []
  } finally {
    loadingAvailableContacts.value = false
  }
}

watch(showAddContactModal, (isOpen) => {
  if (isOpen) {
    contactSearch.value = ''
    availableContacts.value = []
    // Load all contacts when modal opens
    searchContacts()
  }
})

async function addContact(contactId: number) {
  if (!isEdit.value) return

  addingContactId.value = contactId
  try {
    await api.post(`/lists/${route.params.id}/contacts/${contactId}`)
    await loadListContacts()
    // Remove from available contacts
    availableContacts.value = availableContacts.value.filter(c => c.id !== contactId)
    contactSearch.value = ''
  } catch (err: any) {
    console.error('Failed to add contact:', err)
    alert(err.response?.data?.error || 'Failed to add contact to list')
  } finally {
    addingContactId.value = null
  }
}

async function removeContact(contactId: number) {
  if (!isEdit.value) return
  if (!confirm('Remove this contact from the list?')) return

  try {
    await api.delete(`/lists/${route.params.id}/contacts/${contactId}`)
    await loadListContacts()
  } catch (err) {
    console.error('Failed to remove contact:', err)
    alert('Failed to remove contact from list')
  }
}

function onTypeChange() {
  if (form.value.type === 'static') {
    form.value.rules = null
    if (isEdit.value) {
      loadListContacts()
    }
  }
}

async function handleSubmit() {
  loading.value = true
  error.value = ''

  try {
    if (isEdit.value) {
      await api.put(`/lists/${route.params.id}`, form.value)
      router.push('/app/lists')
    } else {
      const response = await api.post('/lists', form.value)
      // After creating, navigate to edit page so user can add contacts
      router.push(`/app/lists/${response.data.list.id}`)
    }
  } catch (err: any) {
    error.value = err.response?.data?.error || 'Failed to save list'
  } finally {
    loading.value = false
  }
}
</script>

