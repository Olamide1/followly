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

        <!-- Smart List Rules Builder -->
        <div v-if="form.type === 'smart'" class="space-y-4">
          <div>
            <label class="block text-xs font-normal text-ink-500 uppercase tracking-wider mb-3">
              Rules *
            </label>
            <p class="text-xs text-ink-600 mb-4">
              Define rules to automatically include contacts in this list. Contacts matching all rules (AND) or any rule (OR) will be included.
            </p>
            
            <!-- Logic Operator -->
            <div v-if="smartListRules.rules.length > 1" class="mb-4">
              <label class="block text-xs font-normal text-ink-500 uppercase tracking-wider mb-2">
                Match Logic
              </label>
              <div class="flex space-x-4">
                <label class="flex items-center">
                  <input
                    type="radio"
                    v-model="smartListRules.operator"
                    value="AND"
                    class="mr-2"
                  />
                  <span class="text-sm text-ink-700">Match ALL rules (AND)</span>
                </label>
                <label class="flex items-center">
                  <input
                    type="radio"
                    v-model="smartListRules.operator"
                    value="OR"
                    class="mr-2"
                  />
                  <span class="text-sm text-ink-700">Match ANY rule (OR)</span>
                </label>
              </div>
            </div>

            <!-- Rules List -->
            <div class="space-y-3">
              <div
                v-for="(rule, index) in smartListRules.rules"
                :key="index"
                class="border-l-2 border-grid-medium pl-4 py-3 bg-paper"
              >
                <div class="flex items-start justify-between mb-3">
                  <span class="text-xs text-ink-500 uppercase tracking-wider">Rule {{ index + 1 }}</span>
                  <button
                    type="button"
                    @click="removeRule(index)"
                    class="text-xs text-ink-500 hover:text-ink-700 uppercase tracking-wider transition-colors"
                  >
                    Remove
                  </button>
                </div>
                
                <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <!-- Field -->
                  <div>
                    <label class="block text-xs text-ink-600 mb-1">Field</label>
                    <select
                      v-model="rule.field"
                      class="input text-sm"
                      @change="updateRuleValueType(index)"
                    >
                      <option value="email">Email</option>
                      <option value="name">Name</option>
                      <option value="company">Company</option>
                      <option value="role">Role</option>
                      <option value="country">Country</option>
                      <option value="subscription_status">Subscription Status</option>
                      <option value="tag">Tag</option>
                      <option value="signup_date">Signup Date</option>
                    </select>
                  </div>
                  
                  <!-- Operator -->
                  <div>
                    <label class="block text-xs text-ink-600 mb-1">Operator</label>
                    <select
                      v-model="rule.operator"
                      class="input text-sm"
                    >
                      <option
                        v-for="op in getOperatorsForField(rule.field)"
                        :key="op.value"
                        :value="op.value"
                      >
                        {{ op.label }}
                      </option>
                    </select>
                  </div>
                  
                  <!-- Value -->
                  <div>
                    <label class="block text-xs text-ink-600 mb-1">Value</label>
                    <input
                      v-if="rule.field !== 'subscription_status' && rule.field !== 'signup_date'"
                      v-model="rule.value"
                      type="text"
                      :placeholder="getValuePlaceholder(rule.field)"
                      class="input text-sm"
                    />
                    <select
                      v-else-if="rule.field === 'subscription_status'"
                      v-model="rule.value"
                      class="input text-sm"
                    >
                      <option value="subscribed">Subscribed</option>
                      <option value="unsubscribed">Unsubscribed</option>
                    </select>
                    <input
                      v-else-if="rule.field === 'signup_date'"
                      v-model="rule.value"
                      type="date"
                      class="input text-sm"
                    />
                  </div>
                </div>
              </div>
            </div>

            <!-- Add Rule Button -->
            <button
              type="button"
              @click="addRule"
              class="btn text-xs mt-4"
            >
              + Add Rule
            </button>

            <!-- Preview Section -->
            <div v-if="smartListRules.rules.length > 0" class="mt-6 border-t border-grid-medium pt-4">
              <div class="flex items-center justify-between mb-3">
                <label class="block text-xs font-normal text-ink-500 uppercase tracking-wider">
                  Preview
                </label>
                <button
                  type="button"
                  @click="previewContacts"
                  :disabled="loadingPreview"
                  class="text-xs text-ink-600 hover:text-ink-900 uppercase tracking-wider transition-colors"
                >
                  {{ loadingPreview ? 'Loading...' : 'Refresh Preview' }}
                </button>
              </div>
              <div v-if="previewContactsList.length > 0" class="max-h-48 overflow-y-auto space-y-2">
                <div
                  v-for="contact in previewContactsList"
                  :key="contact.id"
                  class="border-l-2 border-grid-light pl-3 py-2 text-sm"
                >
                  <p class="text-ink-900">{{ contact.email }}</p>
                  <p v-if="contact.name" class="text-xs text-ink-600">{{ contact.name }}</p>
                </div>
              </div>
              <div v-else-if="!loadingPreview" class="text-sm text-ink-600">
                No contacts match these rules yet.
              </div>
              <div v-if="previewContactsList.length > 0" class="mt-2 text-xs text-ink-600">
                Showing {{ previewContactsList.length }} matching contact{{ previewContactsList.length !== 1 ? 's' : '' }}
              </div>
            </div>
          </div>
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
        <div class="flex space-x-2">
          <button @click="showCsvImportModal = true" class="btn btn-secondary text-xs">
            Import CSV
          </button>
          <button @click="showAddContactModal = true" class="btn btn-primary text-xs">
            Add Contacts
          </button>
        </div>
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
          <div class="flex space-x-2">
            <button @click="showCsvImportModal = true" class="btn btn-secondary text-xs">
              Import CSV
            </button>
            <button @click="showAddContactModal = true" class="btn btn-primary text-xs">
              Add Contacts
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- CSV Import Modal -->
    <div
      v-if="showCsvImportModal"
      class="fixed inset-0 bg-ink-900 bg-opacity-40 flex items-center justify-center z-50"
      @click="showCsvImportModal = false"
    >
      <div class="bg-paper border border-grid-medium p-8 max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto" @click.stop>
        <h2 class="text-lg font-light text-ink-900 mb-6 tracking-wide">Import Contacts from CSV</h2>
        
        <!-- Step 1: Upload -->
        <div v-if="csvImportStep === 'upload'" class="space-y-6">
          <div>
            <label class="block text-xs font-normal text-ink-500 uppercase tracking-wider mb-3">
              Select CSV File
            </label>
            <input
              ref="csvFileInput"
              type="file"
              accept=".csv"
              @change="handleCsvFileSelect"
              class="input"
            />
            <p class="text-xs text-ink-600 mt-2">
              Select a CSV file with contact information. The file should contain email addresses and optionally name, company, role, and country.
            </p>
          </div>

          <div v-if="csvImportError" class="p-4 bg-red-50 border border-red-200 rounded">
            <p class="text-sm text-red-700">{{ csvImportError }}</p>
          </div>

          <div class="flex justify-end space-x-4">
            <button @click="showCsvImportModal = false" class="btn">Cancel</button>
            <button 
              @click="parseCsvForMapping" 
              :disabled="!csvData"
              class="btn btn-primary"
            >
              Next: Map Columns
            </button>
          </div>
        </div>

        <!-- Step 2: Column Mapping -->
        <div v-if="csvImportStep === 'mapping'" class="space-y-6">
          <div>
            <h3 class="text-sm font-normal text-ink-700 mb-4">Map CSV Columns</h3>
            <p class="text-xs text-ink-600 mb-4">
              Select which columns in your CSV file correspond to each field. Email is required.
            </p>

            <div class="space-y-4">
              <div>
                <label class="block text-xs font-normal text-ink-500 uppercase tracking-wider mb-2">
                  Email <span class="text-red-500">*</span>
                </label>
                <select v-model="csvColumnMapping.email" class="input" required>
                  <option value="">Select column...</option>
                  <option v-for="col in csvColumns" :key="col" :value="col">{{ col }}</option>
                </select>
              </div>

              <div>
                <label class="block text-xs font-normal text-ink-500 uppercase tracking-wider mb-2">
                  Name (optional)
                </label>
                <select v-model="csvColumnMapping.name" class="input">
                  <option value="">Select column...</option>
                  <option v-for="col in csvColumns" :key="col" :value="col">{{ col }}</option>
                </select>
              </div>

              <div>
                <label class="block text-xs font-normal text-ink-500 uppercase tracking-wider mb-2">
                  Company (optional)
                </label>
                <select v-model="csvColumnMapping.company" class="input">
                  <option value="">Select column...</option>
                  <option v-for="col in csvColumns" :key="col" :value="col">{{ col }}</option>
                </select>
              </div>

              <div>
                <label class="block text-xs font-normal text-ink-500 uppercase tracking-wider mb-2">
                  Role (optional)
                </label>
                <select v-model="csvColumnMapping.role" class="input">
                  <option value="">Select column...</option>
                  <option v-for="col in csvColumns" :key="col" :value="col">{{ col }}</option>
                </select>
              </div>

              <div>
                <label class="block text-xs font-normal text-ink-500 uppercase tracking-wider mb-2">
                  Country (optional)
                </label>
                <select v-model="csvColumnMapping.country" class="input">
                  <option value="">Select column...</option>
                  <option v-for="col in csvColumns" :key="col" :value="col">{{ col }}</option>
                </select>
              </div>
            </div>

            <div class="mt-6 p-4 bg-ink-50 border border-grid-light rounded">
              <p class="text-xs font-medium text-ink-700 mb-2">Preview (first 3 rows):</p>
              <div class="overflow-x-auto">
                <table class="text-xs w-full">
                  <thead>
                    <tr class="border-b border-grid-medium">
                      <th v-for="col in csvColumns" :key="col" class="text-left p-2">{{ col }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(row, idx) in csvRows" :key="idx" class="border-b border-grid-light">
                      <td v-for="col in csvColumns" :key="col" class="p-2">{{ row[col] || '' }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div v-if="csvImportError" class="p-4 bg-red-50 border border-red-200 rounded">
            <p class="text-sm text-red-700">{{ csvImportError }}</p>
          </div>

          <div class="flex justify-end space-x-4">
            <button @click="csvImportStep = 'upload'" class="btn">Back</button>
            <button 
              @click="handleCsvImport" 
              :disabled="!csvColumnMapping.email || importingCsv"
              class="btn btn-primary"
            >
              {{ importingCsv ? 'Importing...' : 'Import Contacts' }}
            </button>
          </div>
        </div>

        <!-- Step 3: Results -->
        <div v-if="csvImportStep === 'results'" class="space-y-6">
          <div class="p-6 bg-ink-50 border border-grid-light rounded">
            <h3 class="text-sm font-medium text-ink-900 mb-4">Import Complete</h3>
            <div class="space-y-2 text-sm">
              <p class="text-base font-medium text-ink-900 mb-3">
                <span class="font-medium">Total processed:</span> {{ csvImportResult?.imported || 0 }} contacts
              </p>
              
              <div class="space-y-2 text-sm border-t border-grid-medium pt-3">
                <p v-if="(csvImportResult?.added || 0) > 0" class="text-green-700">
                  <span class="font-medium">✓ New contacts added:</span> {{ csvImportResult?.added || 0 }}
                </p>
                <p v-if="(csvImportResult?.updated || 0) > 0" class="text-blue-700">
                  <span class="font-medium">✓ Existing contacts updated:</span> {{ csvImportResult?.updated || 0 }}
                </p>
                <p v-if="(csvImportResult?.alreadyInList || 0) > 0" class="text-ink-600">
                  <span class="font-medium">⊘ Already in list:</span> {{ csvImportResult?.alreadyInList || 0 }} (skipped)
                </p>
                <p v-if="(csvImportResult?.skipped || 0) > 0" class="text-ink-600">
                  <span class="font-medium">⊘ Duplicates in CSV:</span> {{ csvImportResult?.skipped || 0 }} (kept first occurrence)
                </p>
                <p v-if="(csvImportResult?.failed || 0) > 0" class="text-red-700">
                  <span class="font-medium">✗ Failed:</span> {{ csvImportResult?.failed || 0 }}
                </p>
              </div>
            </div>

            <div v-if="csvImportResult?.errors && csvImportResult.errors.length > 0" class="mt-4">
              <p class="text-xs font-medium text-ink-700 mb-2">Errors:</p>
              <ul class="text-xs text-red-700 space-y-1 max-h-32 overflow-y-auto">
                <li v-for="(error, idx) in csvImportResult.errors.slice(0, 10)" :key="idx">{{ error }}</li>
                <li v-if="csvImportResult.errors.length > 10" class="text-ink-600">
                  ... and {{ csvImportResult.errors.length - 10 }} more errors
                </li>
              </ul>
            </div>
          </div>

          <div class="flex justify-end">
            <button @click="closeCsvImportModal" class="btn btn-primary">Done</button>
          </div>
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
import { ref, onMounted, onBeforeUnmount, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import api from '@/services/api'

const route = useRoute()
const router = useRouter()

const isEdit = computed(() => !!route.params.id)
const loading = ref(false)
const error = ref('')

const form = ref<{
  name: string
  type: 'static' | 'smart'
  description: string
  rules: {
    operator: 'AND' | 'OR'
    rules: Array<{
      field: string
      operator: string
      value: any
    }>
  } | null | string
}>({
  name: '',
  type: 'static',
  description: '',
  rules: null,
})

// Smart list rules state
const smartListRules = ref({
  operator: 'AND' as 'AND' | 'OR',
  rules: [] as Array<{
    field: string
    operator: string
    value: any
  }>,
})

const previewContactsList = ref<any[]>([])
const loadingPreview = ref(false)
const previewTimeoutId = ref<ReturnType<typeof setTimeout> | null>(null)
// Store original smart list rules when switching to static, so we can restore them
const savedSmartListRules = ref<{
  operator: 'AND' | 'OR'
  rules: Array<{
    field: string
    operator: string
    value: any
  }>
} | null>(null)

const listContacts = ref<any[]>([])
const loadingContacts = ref(false)
const showAddContactModal = ref(false)
const availableContacts = ref<any[]>([])
const loadingAvailableContacts = ref(false)
const contactSearch = ref('')
const addingContactId = ref<number | null>(null)

// CSV Import state
const showCsvImportModal = ref(false)
const csvFileInput = ref<HTMLInputElement | null>(null)
const csvData = ref<string>('')
const csvImportStep = ref<'upload' | 'mapping' | 'results'>('upload')
const csvColumns = ref<string[]>([])
const csvRows = ref<any[]>([])
const csvColumnMapping = ref<{
  email: string
  name: string
  company: string
  role: string
  country: string
}>({
  email: '',
  name: '',
  company: '',
  role: '',
  country: '',
})
const csvImportError = ref('')
const importingCsv = ref(false)
const csvImportResult = ref<{
  imported: number
  added: number
  updated: number
  alreadyInList: number
  failed: number
  skipped: number
  errors: string[]
} | null>(null)

onMounted(async () => {
  if (isEdit.value) {
    try {
      const response = await api.get(`/lists/${route.params.id}`)
      Object.assign(form.value, response.data.list)
      
      // Initialize smart list rules if they exist
      if (form.value.type === 'smart' && form.value.rules) {
        // Parse rules if they come as a JSON string
        let parsedRules: any = form.value.rules
        if (typeof form.value.rules === 'string') {
          try {
            parsedRules = JSON.parse(form.value.rules)
          } catch (e) {
            console.error('Failed to parse rules:', e)
            parsedRules = null
          }
        }
        
        if (parsedRules && parsedRules.rules) {
          smartListRules.value = {
            operator: parsedRules.operator || 'AND',
            rules: parsedRules.rules || [],
          }
          // Save original rules for restoration if user switches away and back
          savedSmartListRules.value = {
            operator: parsedRules.operator || 'AND',
            rules: JSON.parse(JSON.stringify(parsedRules.rules)), // Deep copy
          }
          // Load preview after a short delay
          previewTimeoutId.value = setTimeout(() => {
            if (smartListRules.value.rules.length > 0) {
              previewContacts()
            }
            previewTimeoutId.value = null
          }, 500)
        } else {
          // Initialize empty rules if parsing failed or no rules
          smartListRules.value = {
            operator: 'AND',
            rules: [],
          }
        }
      } else if (form.value.type === 'smart') {
        // Initialize empty rules for new smart lists
        smartListRules.value = {
          operator: 'AND',
          rules: [],
        }
      }
      
      if (form.value.type === 'static') {
        loadListContacts()
      }
    } catch (err) {
      console.error('Failed to load list:', err)
    }
  } else {
    // Initialize empty rules for new smart lists
    smartListRules.value = {
      operator: 'AND',
      rules: [],
    }
  }
})

onBeforeUnmount(() => {
  // Clean up preview timeout if component is unmounted before it fires
  if (previewTimeoutId.value !== null) {
    clearTimeout(previewTimeoutId.value)
    previewTimeoutId.value = null
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

function handleCsvFileSelect(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  
  if (!file) return
  
  if (!file.name.endsWith('.csv')) {
    csvImportError.value = 'Please select a CSV file'
    return
  }
  
  csvImportError.value = ''
  csvImportResult.value = null
  csvImportStep.value = 'upload'
  
  const reader = new FileReader()
  reader.onload = (e) => {
    const content = e.target?.result as string
    csvData.value = content
  }
  reader.onerror = () => {
    csvImportError.value = 'Failed to read file'
  }
  reader.readAsText(file)
}

function parseCsvForMapping() {
  if (!csvData.value) {
    csvImportError.value = 'No CSV data to parse'
    return
  }

  try {
    // Simple CSV parsing for preview
    const lines = csvData.value.split('\n').filter(line => line.trim())
    if (lines.length === 0) {
      csvImportError.value = 'CSV file appears to be empty'
      return
    }

    // Parse header
    const headerLine = lines[0]
    csvColumns.value = headerLine.split(',').map(col => col.trim().replace(/^"|"$/g, ''))
    
    // Parse first few rows for preview
    const rows: any[] = []
    for (let i = 1; i < Math.min(4, lines.length); i++) {
      const values = lines[i].split(',').map(val => val.trim().replace(/^"|"$/g, ''))
      const row: any = {}
      csvColumns.value.forEach((col, idx) => {
        row[col] = values[idx] || ''
      })
      rows.push(row)
    }
    csvRows.value = rows

    // Try to auto-detect email column
    const emailCol = csvColumns.value.find(col => 
      /email|e-mail|mail/i.test(col)
    )
    if (emailCol) {
      csvColumnMapping.value.email = emailCol
    }

    // Try to auto-detect other common fields
    const nameCol = csvColumns.value.find(col => 
      /name|full.?name|contact.?name/i.test(col)
    )
    if (nameCol) {
      csvColumnMapping.value.name = nameCol
    }

    const companyCol = csvColumns.value.find(col => 
      /company|organization|org|employer/i.test(col)
    )
    if (companyCol) {
      csvColumnMapping.value.company = companyCol
    }

    const roleCol = csvColumns.value.find(col => 
      /role|title|job.?title|position/i.test(col)
    )
    if (roleCol) {
      csvColumnMapping.value.role = roleCol
    }

    const countryCol = csvColumns.value.find(col => 
      /country|nation|location/i.test(col)
    )
    if (countryCol) {
      csvColumnMapping.value.country = countryCol
    }

    csvImportStep.value = 'mapping'
    csvImportError.value = ''
    
    // Validate email format in preview
    if (emailCol) {
      const emails = rows.map(row => row[emailCol]).filter(email => email)
      const invalidEmails = emails.filter(email => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        return !emailRegex.test(email.trim())
      })
      if (invalidEmails.length > 0) {
        csvImportError.value = `Warning: ${invalidEmails.length} invalid email format(s) detected in preview rows`
      }
    }
  } catch (err: any) {
    csvImportError.value = err.message || 'Failed to parse CSV file'
  }
}

async function handleCsvImport() {
  if (!isEdit.value || !csvData.value || !csvColumnMapping.value.email) {
    csvImportError.value = 'Email column mapping is required'
    return
  }

  importingCsv.value = true
  csvImportError.value = ''

  try {
    const response = await api.post(`/lists/${route.params.id}/contacts/import`, {
      csv: csvData.value,
      columnMapping: csvColumnMapping.value,
    })

    csvImportResult.value = response.data
    csvImportStep.value = 'results'
    
    // Reload list contacts after successful import
    if (response.data.imported > 0) {
      setTimeout(() => {
        loadListContacts()
      }, 1500)
    }
  } catch (err: any) {
    csvImportError.value = err.response?.data?.error || 'Failed to import contacts'
    console.error('Failed to import contacts:', err)
  } finally {
    importingCsv.value = false
  }
}

function closeCsvImportModal() {
  showCsvImportModal.value = false
  csvImportStep.value = 'upload'
  csvData.value = ''
  csvColumns.value = []
  csvRows.value = []
  csvColumnMapping.value = {
    email: '',
    name: '',
    company: '',
    role: '',
    country: '',
  }
  csvImportError.value = ''
  csvImportResult.value = null
  if (csvFileInput.value) {
    csvFileInput.value.value = ''
  }
}

function onTypeChange() {
  if (form.value.type === 'static') {
    // Don't overwrite savedSmartListRules - preserve original saved rules
    // User's unsaved modifications will be lost if they switch away, which is expected
    form.value.rules = null
    smartListRules.value = { operator: 'AND', rules: [] }
    previewContactsList.value = []
    if (isEdit.value) {
      loadListContacts()
    }
  } else if (form.value.type === 'smart') {
    // Restore original saved rules if they exist, otherwise initialize empty rules
    if (savedSmartListRules.value && savedSmartListRules.value.rules.length > 0) {
      smartListRules.value = {
        operator: savedSmartListRules.value.operator,
        rules: JSON.parse(JSON.stringify(savedSmartListRules.value.rules)), // Deep copy
      }
      // Restore rules in form for saving
      form.value.rules = {
        operator: savedSmartListRules.value.operator,
        rules: savedSmartListRules.value.rules,
      }
    } else if (smartListRules.value.rules.length === 0) {
      // If no saved rules and current rules are empty, initialize empty rules
      smartListRules.value = { operator: 'AND', rules: [] }
    }
  }
}

// Rule builder functions
function addRule() {
  smartListRules.value.rules.push({
    field: 'email',
    operator: 'contains',
    value: '',
  })
}

function removeRule(index: number) {
  smartListRules.value.rules.splice(index, 1)
  // Refresh preview after removing rule
  if (smartListRules.value.rules.length > 0) {
    previewContacts()
  } else {
    previewContactsList.value = []
  }
}

function updateRuleValueType(index: number) {
  const rule = smartListRules.value.rules[index]
  // Reset value when field changes
  rule.value = ''
  // Set default operator based on field
  if (rule.field === 'subscription_status') {
    rule.operator = 'equals'
  } else if (rule.field === 'signup_date') {
    rule.operator = 'greater_than'
  } else if (rule.field === 'tag') {
    rule.operator = 'equals'
  } else {
    rule.operator = 'contains'
  }
}

function getOperatorsForField(field: string) {
  if (field === 'subscription_status') {
    return [{ value: 'equals', label: 'Is' }]
  }
  if (field === 'signup_date') {
    return [
      { value: 'greater_than', label: 'After' },
      { value: 'less_than', label: 'Before' },
    ]
  }
  if (field === 'tag') {
    // Backend only supports tag matching (like equals), so only show one option
    return [{ value: 'equals', label: 'Has Tag' }]
  }
  return [
    { value: 'equals', label: 'Equals' },
    { value: 'contains', label: 'Contains' },
    { value: 'not_equals', label: 'Not Equals' },
    { value: 'not_contains', label: 'Not Contains' },
  ]
}

function getValuePlaceholder(field: string) {
  const placeholders: Record<string, string> = {
    email: 'e.g., @gmail.com',
    name: 'e.g., John',
    company: 'e.g., Acme Inc',
    role: 'e.g., CEO',
    country: 'e.g., United States',
    tag: 'e.g., VIP',
  }
  return placeholders[field] || 'Enter value'
}

async function previewContacts() {
  if (smartListRules.value.rules.length === 0) {
    previewContactsList.value = []
    return
  }

  // Validate all rules have values
  const invalidRules = smartListRules.value.rules.filter(r => {
    if (!r.value) return true
    if (typeof r.value === 'string' && r.value.trim() === '') return true
    return false
  })
  if (invalidRules.length > 0) {
    alert('Please fill in all rule values before previewing')
    return
  }

  // For new lists, we need to save first to preview (need a list ID)
  if (!isEdit.value) {
    alert('Please save the list first to preview matching contacts')
    return
  }

  loadingPreview.value = true
  try {
    // Use preview endpoint - this evaluates rules without saving them
    const testRules = {
      operator: smartListRules.value.operator,
      rules: smartListRules.value.rules,
    }
    
    const response = await api.post(`/lists/${route.params.id}/contacts/preview`, {
      rules: testRules,
      limit: 50, // Limit preview to 50 contacts
    })
    previewContactsList.value = response.data.contacts || []
  } catch (err: any) {
    console.error('Failed to preview contacts:', err)
    alert(err.response?.data?.error || 'Failed to preview contacts. Make sure all rules are valid.')
    previewContactsList.value = []
  } finally {
    loadingPreview.value = false
  }
}

async function handleSubmit() {
  loading.value = true
  error.value = ''

  try {
    // Validate smart list rules
    if (form.value.type === 'smart') {
      if (smartListRules.value.rules.length === 0) {
        error.value = 'Smart lists require at least one rule'
        loading.value = false
        return
      }
      
      // Validate all rules have values
      const invalidRules = smartListRules.value.rules.filter(r => !r.value || (typeof r.value === 'string' && r.value.trim() === ''))
      if (invalidRules.length > 0) {
        error.value = 'All rules must have a value'
        loading.value = false
        return
      }
      
      // Set rules in form
      form.value.rules = {
        operator: smartListRules.value.operator,
        rules: smartListRules.value.rules,
      }
    } else {
      form.value.rules = null
    }

    if (isEdit.value) {
      await api.put(`/lists/${route.params.id}`, form.value)
      router.push('/app/lists')
    } else {
      const response = await api.post('/lists', form.value)
      // After creating, navigate to edit page so user can add contacts or see preview
      router.push(`/app/lists/${response.data.list.id}`)
    }
  } catch (err: any) {
    error.value = err.response?.data?.error || 'Failed to save list'
  } finally {
    loading.value = false
  }
}
</script>

