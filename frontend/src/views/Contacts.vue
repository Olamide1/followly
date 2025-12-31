<template>
  <div>
    <div class="page-header flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 sm:gap-0">
      <div>
        <h1 class="page-title">Contacts</h1>
        <p class="page-description">Manage your email contacts</p>
      </div>
      <div class="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-4 w-full sm:w-auto">
        <button @click="showImportModal = true" class="btn w-full sm:w-auto">
          Import CSV
        </button>
        <router-link to="/app/contacts/new" class="btn btn-primary w-full sm:w-auto text-center">
          Add Contact
        </router-link>
      </div>
    </div>

    <div class="mb-8">
      <input
        v-model="searchQuery"
        type="text"
        placeholder="Search contacts..."
        class="input"
        @input="loadContacts"
      />
    </div>

    <!-- Top Pagination -->
    <div v-if="!loading && contacts.length > 0 && pagination.totalPages > 1" class="mb-6 flex justify-center items-center space-x-6">
      <button
        @click="changePage(pagination.page - 1)"
        :disabled="pagination.page === 1"
        class="btn btn-ghost text-xs"
        :class="{ 'opacity-50 cursor-not-allowed': pagination.page === 1 }"
      >
        Previous
      </button>
      <span class="text-xs text-ink-500 tracking-wider">
        Page {{ pagination.page }} of {{ pagination.totalPages }}
      </span>
      <button
        @click="changePage(pagination.page + 1)"
        :disabled="pagination.page >= pagination.totalPages"
        class="btn btn-ghost text-xs"
        :class="{ 'opacity-50 cursor-not-allowed': pagination.page >= pagination.totalPages }"
      >
        Next
      </button>
    </div>

    <div v-if="loading" class="text-center py-24">
      <p class="text-ink-500 text-sm tracking-wider">LOADING...</p>
    </div>

    <div v-else-if="contacts.length > 0">
      <!-- Bulk Actions Bar -->
      <div v-if="selectedContacts.size > 0" class="mb-6 bg-paper border border-grid-medium p-4 flex items-center justify-between">
        <div class="flex items-center space-x-4">
          <span class="text-sm text-ink-700">
            {{ selectedContacts.size }} contact{{ selectedContacts.size === 1 ? '' : 's' }} selected
          </span>
        </div>
        <div class="flex items-center space-x-4">
          <button
            @click="showBulkAddToListModal = true"
            class="text-xs text-ink-600 hover:text-ink-900 uppercase tracking-wider transition-colors"
          >
            Add to List
          </button>
          <button
            @click="clearSelection"
            class="text-xs text-ink-600 hover:text-ink-900 uppercase tracking-wider transition-colors"
          >
            Clear
          </button>
          <button
            @click="bulkDelete"
            class="text-xs text-ink-500 hover:text-ink-700 uppercase tracking-wider transition-colors"
          >
            Delete Selected
          </button>
        </div>
      </div>

      <div class="bg-paper border border-grid-light overflow-x-auto">
        <table class="table-grid min-w-full">
          <thead>
            <tr>
              <th class="px-4 sm:px-6 w-12">
                <input
                  type="checkbox"
                  :checked="isAllSelected"
                  @change="toggleSelectAll"
                  class="h-4 w-4 text-ink-900 focus:ring-ink-900 border-grid-medium rounded-none cursor-pointer"
                />
              </th>
              <th class="px-4 sm:px-6">Email</th>
              <th class="px-4 sm:px-6 hidden sm:table-cell">Name</th>
              <th class="px-4 sm:px-6 hidden md:table-cell">Company</th>
              <th class="px-4 sm:px-6">Lists</th>
              <th class="px-4 sm:px-6">Status</th>
              <th class="px-4 sm:px-6 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="contact in contacts" :key="contact.id">
              <td class="px-4 sm:px-6">
                <input
                  type="checkbox"
                  :checked="selectedContacts.has(contact.id)"
                  @change="toggleContact(contact.id)"
                  class="h-4 w-4 text-ink-900 focus:ring-ink-900 border-grid-medium rounded-none cursor-pointer"
                />
              </td>
              <td class="px-4 sm:px-6 text-sm">{{ contact.email }}</td>
              <td class="px-4 sm:px-6 hidden sm:table-cell text-sm">{{ contact.name || '-' }}</td>
              <td class="px-4 sm:px-6 hidden md:table-cell text-sm">{{ contact.company || '-' }}</td>
              <td class="px-4 sm:px-6">
                <div v-if="contactLists[contact.id] && contactLists[contact.id].length > 0" class="flex flex-wrap gap-2">
                  <span
                    v-for="list in contactLists[contact.id]"
                    :key="list.id"
                    class="inline-block text-xs px-2 py-1 border border-grid-medium bg-paper text-ink-700 uppercase tracking-wider"
                  >
                    {{ list.name }}
                  </span>
                </div>
                <span v-else class="text-xs text-ink-400 italic">No lists</span>
              </td>
              <td class="px-4 sm:px-6">
                <span
                  class="text-xs uppercase tracking-wider"
                  :class="
                    contact.subscription_status === 'subscribed'
                      ? 'text-ink-700'
                      : 'text-ink-500'
                  "
                >
                  {{ contact.subscription_status }}
                </span>
              </td>
              <td class="px-4 sm:px-6">
                <div class="flex items-center justify-end gap-3">
                  <button
                    @click="showAddToListModal(contact.id)"
                    class="text-xs px-3 py-1 border border-grid-medium bg-paper text-ink-700 hover:bg-ink-900 hover:text-paper hover:border-ink-900 uppercase tracking-wider transition-all"
                  >
                    Add to List
                  </button>
                  <router-link
                    :to="`/app/contacts/${contact.id}`"
                    class="text-xs px-3 py-1 border border-grid-medium bg-paper text-ink-700 hover:bg-ink-900 hover:text-paper hover:border-ink-900 uppercase tracking-wider transition-all"
                  >
                    Edit
                  </router-link>
                  <button
                    @click="deleteContact(contact.id)"
                    class="text-xs px-3 py-1 border border-grid-medium bg-paper text-ink-500 hover:bg-ink-900 hover:text-paper hover:border-ink-900 uppercase tracking-wider transition-all"
                  >
                    Delete
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if="contacts.length > 0 && pagination.totalPages > 1" class="mt-12 flex justify-center items-center space-x-6">
        <button
          @click="changePage(pagination.page - 1)"
          :disabled="pagination.page === 1"
          class="btn btn-ghost text-xs"
          :class="{ 'opacity-50 cursor-not-allowed': pagination.page === 1 }"
        >
          Previous
        </button>
        <span class="text-xs text-ink-500 tracking-wider">
          Page {{ pagination.page }} of {{ pagination.totalPages }}
        </span>
        <button
          @click="changePage(pagination.page + 1)"
          :disabled="pagination.page >= pagination.totalPages"
          class="btn btn-ghost text-xs"
          :class="{ 'opacity-50 cursor-not-allowed': pagination.page >= pagination.totalPages }"
        >
          Next
        </button>
      </div>
    </div>

    <!-- Empty state -->
    <div v-else class="text-center py-24">
      <div class="max-w-md mx-auto">
        <div class="border-l-2 border-ink-900 pl-6 mb-8 text-left">
          <h3 class="text-sm font-normal text-ink-500 uppercase tracking-wider mb-4">No Contacts Yet</h3>
          <p class="text-ink-700 leading-relaxed mb-6">
            Start building your email list by adding contacts manually or importing a CSV file.
          </p>
          <div class="space-y-3">
            <router-link to="/app/contacts/new" class="block btn btn-primary w-full text-center">
              Add Your First Contact
            </router-link>
            <button @click="showImportModal = true" class="block btn w-full text-center">
              Import CSV
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Import Modal -->
    <div
      v-if="showImportModal"
      class="fixed inset-0 bg-ink-900 bg-opacity-40 flex items-center justify-center z-50"
      @click="showImportModal = false"
    >
      <div class="bg-paper border border-grid-medium p-8 sm:p-12 max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto" @click.stop>
        <h2 class="text-lg font-light text-ink-900 mb-8 tracking-wide">Import Contacts (CSV)</h2>
        
        <!-- Step 1: File Upload -->
        <div v-if="importStep === 'upload'" class="space-y-6">
          <div>
            <label class="block text-xs font-normal text-ink-500 uppercase tracking-wider mb-3">
              Upload CSV File
            </label>
            <div class="border-2 border-dashed border-grid-medium p-8 text-center hover:border-ink-400 transition-colors">
              <input
                ref="fileInput"
                type="file"
                accept=".csv"
                @change="handleFileSelect"
                class="hidden"
                id="csv-upload"
              />
              <label
                for="csv-upload"
                class="cursor-pointer block"
              >
                <div class="mb-4">
                  <p class="text-sm text-ink-600 mb-2">Click to select a CSV file</p>
                  <p class="text-xs text-ink-500">or drag and drop</p>
                </div>
                <div v-if="selectedFileName" class="mt-4">
                  <p class="text-xs text-ink-700 uppercase tracking-wider">Selected:</p>
                  <p class="text-sm text-ink-900 mt-1">{{ selectedFileName }}</p>
                </div>
              </label>
            </div>
            <p class="text-xs text-ink-500 mt-4 leading-relaxed">
              CSV should include headers. You'll be able to map columns in the next step.
            </p>
          </div>

          <div v-if="importError" class="border-l-2 border-ink-900 pl-4">
            <p class="text-sm text-ink-700">{{ importError }}</p>
          </div>

          <div class="flex justify-end space-x-4">
            <button @click="closeImportModal" class="btn">Cancel</button>
            <button 
              @click="parseCsvForMapping" 
              :disabled="!csvData"
              class="btn btn-primary"
              :class="{ 'opacity-50 cursor-not-allowed': !csvData }"
            >
              Next: Map Columns
            </button>
          </div>
        </div>

        <!-- Step 2: Column Mapping -->
        <div v-if="importStep === 'mapping'" class="space-y-6">
          <div>
            <h3 class="text-sm font-normal text-ink-500 uppercase tracking-wider mb-4">Map CSV Columns to Contact Fields</h3>
            <p class="text-xs text-ink-600 mb-6">
              Select which CSV column should map to each contact field. Email is required.
            </p>
            
            <div class="space-y-4">
              <div
                v-for="field in contactFields"
                :key="field.key"
                class="flex items-center justify-between border-l-2 border-grid-light pl-4 py-3 bg-paper"
              >
                <div class="flex-1">
                  <label class="text-sm text-ink-900 font-medium">
                    {{ field.label }}
                    <span v-if="field.required" class="text-ink-500">*</span>
                  </label>
                  <p v-if="field.description" class="text-xs text-ink-500 mt-1">{{ field.description }}</p>
                </div>
                <select
                  v-model="columnMapping[field.key]"
                  class="input ml-4 min-w-[200px]"
                  :class="{ 'border-red-500': field.required && !columnMapping[field.key] }"
                >
                  <option value="">-- Select Column --</option>
                  <option
                    v-for="column in csvColumns"
                    :key="column"
                    :value="column"
                  >
                    {{ column }}
                  </option>
                </select>
              </div>
            </div>

            <!-- Preview sample data -->
            <div v-if="csvPreview.length > 0" class="mt-8">
              <h4 class="text-xs font-normal text-ink-500 uppercase tracking-wider mb-4">Preview (first 3 rows)</h4>
              <div class="bg-paper border border-grid-light overflow-x-auto">
                <table class="table-grid min-w-full text-xs">
                  <thead>
                    <tr>
                      <th class="px-4 py-2">Email</th>
                      <th class="px-4 py-2">Name</th>
                      <th class="px-4 py-2">Company</th>
                      <th class="px-4 py-2">Role</th>
                      <th class="px-4 py-2">Country</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(row, idx) in csvPreview" :key="idx">
                      <td class="px-4 py-2">{{ row.email || '-' }}</td>
                      <td class="px-4 py-2">{{ row.name || '-' }}</td>
                      <td class="px-4 py-2">{{ row.company || '-' }}</td>
                      <td class="px-4 py-2">{{ row.role || '-' }}</td>
                      <td class="px-4 py-2">{{ row.country || '-' }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div v-if="importError" class="border-l-2 border-ink-900 pl-4">
            <p class="text-sm text-ink-700">{{ importError }}</p>
          </div>

          <div class="flex justify-end space-x-4">
            <button @click="importStep = 'upload'" class="btn">Back</button>
            <button 
              @click="handleImport" 
              :disabled="!columnMapping.email || importing"
              class="btn btn-primary"
              :class="{ 'opacity-50 cursor-not-allowed': !columnMapping.email || importing }"
            >
              {{ importing ? 'IMPORTING...' : 'Import' }}
            </button>
          </div>
        </div>

        <!-- Step 3: Results -->
        <div v-if="importStep === 'results'" class="space-y-6">
          <div class="border-l-2 border-ink-900 pl-4">
            <p class="text-sm text-ink-700 mb-2">
              Imported: {{ importResult?.success || 0 }} contacts
            </p>
            <p v-if="importResult?.failed && importResult.failed > 0" class="text-sm text-ink-600">
              Failed: {{ importResult.failed }} contacts
            </p>
          </div>

          <div class="flex justify-end space-x-4">
            <button @click="closeImportModal" class="btn btn-primary">Done</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Bulk Add to List Modal -->
    <div
      v-if="showBulkAddToListModal"
      class="fixed inset-0 bg-ink-900 bg-opacity-40 flex items-center justify-center z-50"
      @click="closeBulkAddToListModal"
    >
      <div class="bg-paper border border-grid-medium p-8 max-w-2xl w-full mx-4" @click.stop>
        <h2 class="text-lg font-light text-ink-900 mb-6 tracking-wide">Add Selected Contacts to List</h2>
        <p class="text-sm text-ink-600 mb-6">
          Add {{ selectedContacts.size }} contact{{ selectedContacts.size === 1 ? '' : 's' }} to a list
        </p>
        
        <div v-if="loadingLists" class="text-center py-12">
          <p class="text-ink-500 text-sm tracking-wider">LOADING...</p>
        </div>

        <div v-else-if="availableLists.length > 0" class="space-y-3 mb-6">
          <div
            v-for="list in availableLists"
            :key="list.id"
            class="flex items-center justify-between border-l-2 border-grid-light pl-4 py-3 hover:border-ink-900 transition-colors"
          >
            <div class="flex-1">
              <p class="text-sm text-ink-900">{{ list.name }}</p>
              <p v-if="list.description" class="text-xs text-ink-600">{{ list.description }}</p>
              <p class="text-xs text-ink-500 mt-1">{{ list.type === 'static' ? 'Static List' : 'Smart List' }}</p>
            </div>
            <button
              @click="bulkAddContactsToList(list.id)"
              :disabled="bulkAddingToListId === list.id"
              class="text-xs text-ink-600 hover:text-ink-900 uppercase tracking-wider transition-colors"
            >
              {{ bulkAddingToListId === list.id ? 'Adding...' : 'Add' }}
            </button>
          </div>
        </div>

        <div v-else class="text-center py-12 mb-6">
          <div class="border-l-2 border-ink-900 pl-6 text-left max-w-md mx-auto">
            <h3 class="text-sm font-normal text-ink-500 uppercase tracking-wider mb-4">No Lists Available</h3>
            <p class="text-ink-700 leading-relaxed mb-6 text-sm">
              Create a static list first to add contacts.
            </p>
            <router-link to="/app/lists/new" class="btn btn-primary text-xs" @click="closeBulkAddToListModal">
              Create List
            </router-link>
          </div>
        </div>

        <div class="flex justify-end space-x-4">
          <button @click="closeBulkAddToListModal" class="btn">Close</button>
        </div>
      </div>
    </div>

    <!-- Add to List Modal (single contact) -->
    <div
      v-if="showAddToListModalRef"
      class="fixed inset-0 bg-ink-900 bg-opacity-40 flex items-center justify-center z-50"
      @click="closeAddToListModal"
    >
      <div class="bg-paper border border-grid-medium p-8 max-w-2xl w-full mx-4" @click.stop>
        <h2 class="text-lg font-light text-ink-900 mb-6 tracking-wide">Add Contact to List</h2>
        
        <div v-if="loadingLists" class="text-center py-12">
          <p class="text-ink-500 text-sm tracking-wider">LOADING...</p>
        </div>

        <div v-else-if="availableLists.length > 0" class="space-y-3 mb-6">
          <div
            v-for="list in availableLists"
            :key="list.id"
            class="flex items-center justify-between border-l-2 border-grid-light pl-4 py-3 hover:border-ink-900 transition-colors"
          >
            <div class="flex-1">
              <p class="text-sm text-ink-900">{{ list.name }}</p>
              <p v-if="list.description" class="text-xs text-ink-600">{{ list.description }}</p>
              <p class="text-xs text-ink-500 mt-1">{{ list.type === 'static' ? 'Static List' : 'Smart List' }}</p>
            </div>
            <button
              @click="addContactToList(list.id)"
              :disabled="addingToListId === list.id"
              class="text-xs text-ink-600 hover:text-ink-900 uppercase tracking-wider transition-colors"
            >
              {{ addingToListId === list.id ? 'Adding...' : 'Add' }}
            </button>
          </div>
        </div>

        <div v-else class="text-center py-12 mb-6">
          <div class="border-l-2 border-ink-900 pl-6 text-left max-w-md mx-auto">
            <h3 class="text-sm font-normal text-ink-500 uppercase tracking-wider mb-4">No Lists Available</h3>
            <p class="text-ink-700 leading-relaxed mb-6 text-sm">
              Create a static list first to add contacts.
            </p>
            <router-link to="/app/lists/new" class="btn btn-primary text-xs" @click="closeAddToListModal">
              Create List
            </router-link>
          </div>
        </div>

        <div class="flex justify-end space-x-4">
          <button @click="closeAddToListModal" class="btn">Close</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import api from '@/services/api'

const contacts = ref<any[]>([])
const loading = ref(true)
const searchQuery = ref('')
const pagination = ref({ page: 1, limit: 50, total: 0, totalPages: 0 })
const showImportModal = ref(false)
const csvData = ref('')
const selectedFileName = ref('')
const importing = ref(false)
const importError = ref('')
const importResult = ref<{ success: number; failed: number; errors: string[] } | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)

const importStep = ref<'upload' | 'mapping' | 'results'>('upload')
const csvColumns = ref<string[]>([])
const csvRows = ref<any[]>([])
const columnMapping = ref<Record<string, string>>({
  email: '',
  name: '',
  company: '',
  role: '',
  country: '',
  subscription_status: '',
})
const csvPreview = ref<any[]>([])

const contactFields = [
  { key: 'email', label: 'Email', required: true, description: 'Required field' },
  { key: 'name', label: 'Name', required: false, description: 'Full name or first name' },
  { key: 'company', label: 'Company', required: false, description: 'Company or organization' },
  { key: 'role', label: 'Role', required: false, description: 'Job title or role' },
  { key: 'country', label: 'Country', required: false, description: 'Country name' },
  { key: 'subscription_status', label: 'Subscription Status', required: false, description: 'subscribed or unsubscribed' },
]

const showAddToListModalRef = ref(false)
const showBulkAddToListModal = ref(false)
const selectedContactId = ref<number | null>(null)
const availableLists = ref<any[]>([])
const loadingLists = ref(false)
const addingToListId = ref<number | null>(null)
const bulkAddingToListId = ref<number | null>(null)

const selectedContacts = ref<Set<number>>(new Set())
const isDeleting = ref(false)
const contactLists = ref<Record<number, any[]>>({})

async function loadContacts() {
  loading.value = true
  try {
    const response = await api.get('/contacts', {
      params: {
        page: pagination.value.page,
        limit: pagination.value.limit,
        search: searchQuery.value || undefined,
      },
    })
    contacts.value = response.data.contacts
    pagination.value = response.data.pagination
    // Clear selection when contacts change
    selectedContacts.value.clear()
    // Load lists for each contact
    await loadContactLists()
  } catch (error) {
    console.error('Failed to load contacts:', error)
  } finally {
    loading.value = false
  }
}

async function loadContactLists() {
  // Load lists for all contacts in parallel
  const promises = contacts.value.map(async (contact) => {
    try {
      const response = await api.get(`/contacts/${contact.id}/lists`)
      contactLists.value[contact.id] = response.data.lists || []
    } catch (error) {
      console.error(`Failed to load lists for contact ${contact.id}:`, error)
      contactLists.value[contact.id] = []
    }
  })
  await Promise.all(promises)
}

function changePage(page: number) {
  pagination.value.page = page
  loadContacts()
}

async function deleteContact(id: number) {
  if (!confirm('Are you sure you want to delete this contact?')) return
  
  try {
    await api.delete(`/contacts/${id}`)
    loadContacts()
  } catch (error: any) {
    console.error('Failed to delete contact:', error)
    const errorMessage = error.response?.data?.error || error.message || 'Failed to delete contact'
    alert(errorMessage)
    // Don't reload or redirect - just show error and keep user on page
  }
}

function handleFileSelect(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  
  if (!file) return
  
  if (!file.name.endsWith('.csv')) {
    importError.value = 'Please select a CSV file'
    return
  }
  
  selectedFileName.value = file.name
  importError.value = ''
  importResult.value = null
  importStep.value = 'upload'
  
  const reader = new FileReader()
  reader.onload = (e) => {
    const content = e.target?.result as string
    csvData.value = content
  }
  reader.onerror = () => {
    importError.value = 'Failed to read file'
  }
  reader.readAsText(file)
}

function parseCsvForMapping() {
  if (!csvData.value) {
    importError.value = 'No CSV data to parse'
    return
  }

  try {
    // Simple CSV parsing for preview
    const lines = csvData.value.split('\n').filter(line => line.trim())
    if (lines.length === 0) {
      importError.value = 'CSV file appears to be empty'
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
      columnMapping.value.email = emailCol
    }

    // Try to auto-detect other common fields
    const nameCol = csvColumns.value.find(col => 
      /name|full.?name|contact.?name/i.test(col)
    )
    if (nameCol) {
      columnMapping.value.name = nameCol
    }

    const companyCol = csvColumns.value.find(col => 
      /company|organization|org|employer/i.test(col)
    )
    if (companyCol) {
      columnMapping.value.company = companyCol
    }

    const roleCol = csvColumns.value.find(col => 
      /role|title|job.?title|position/i.test(col)
    )
    if (roleCol) {
      columnMapping.value.role = roleCol
    }

    const countryCol = csvColumns.value.find(col => 
      /country|nation|location/i.test(col)
    )
    if (countryCol) {
      columnMapping.value.country = countryCol
    }

    const statusCol = csvColumns.value.find(col => 
      /status|subscription|subscribed|opt.?in/i.test(col)
    )
    if (statusCol) {
      columnMapping.value.subscription_status = statusCol
    }

    // Generate preview
    updatePreview()

    importStep.value = 'mapping'
    importError.value = ''
  } catch (error: any) {
    importError.value = `Failed to parse CSV: ${error.message}`
    console.error('CSV parsing error:', error)
  }
}

function updatePreview() {
  csvPreview.value = csvRows.value.map(row => {
    const mapped: any = {}
    Object.keys(columnMapping.value).forEach(field => {
      const csvCol = columnMapping.value[field]
      if (csvCol && row[csvCol]) {
        mapped[field] = row[csvCol]
      }
    })
    return mapped
  })
}

// Watch column mapping changes to update preview
watch(columnMapping, () => {
  updatePreview()
}, { deep: true })

function closeImportModal() {
  showImportModal.value = false
  csvData.value = ''
  selectedFileName.value = ''
  importError.value = ''
  importResult.value = null
  importStep.value = 'upload'
  csvColumns.value = []
  csvRows.value = []
  csvPreview.value = []
  columnMapping.value = {
    email: '',
    name: '',
    company: '',
    role: '',
    country: '',
    subscription_status: '',
  }
  if (fileInput.value) {
    fileInput.value.value = ''
  }
}

async function handleImport() {
  if (!csvData.value) {
    importError.value = 'Please select a CSV file'
    return
  }

  if (!columnMapping.value.email) {
    importError.value = 'Email column mapping is required'
    return
  }
  
  importing.value = true
  importError.value = ''
  importResult.value = null
  
  try {
    const response = await api.post('/contacts/import', { 
      csv: csvData.value,
      columnMapping: columnMapping.value
    })
    importResult.value = response.data
    importStep.value = 'results'
    
    // Reload contacts after successful import
    if (response.data.success > 0) {
      setTimeout(() => {
        loadContacts()
      }, 1500)
    }
  } catch (error: any) {
    importError.value = error.response?.data?.error || 'Failed to import contacts'
    console.error('Failed to import contacts:', error)
  } finally {
    importing.value = false
  }
}

function showAddToListModal(contactId: number) {
  selectedContactId.value = contactId
  showAddToListModalRef.value = true
  loadLists()
}

watch(showBulkAddToListModal, (isOpen) => {
  if (isOpen) {
    loadLists()
  }
})

function closeAddToListModal() {
  showAddToListModalRef.value = false
  selectedContactId.value = null
  availableLists.value = []
}

function closeBulkAddToListModal() {
  showBulkAddToListModal.value = false
  availableLists.value = []
}

async function loadLists() {
  loadingLists.value = true
  try {
    const response = await api.get('/lists')
    // Only show static lists (smart lists can't have contacts added manually)
    availableLists.value = response.data.lists.filter((l: any) => l.type === 'static')
  } catch (error) {
    console.error('Failed to load lists:', error)
  } finally {
    loadingLists.value = false
  }
}

async function addContactToList(listId: number) {
  if (!selectedContactId.value) return

  addingToListId.value = listId
  try {
    await api.post(`/lists/${listId}/contacts/${selectedContactId.value}`)
    // Reload lists for this contact
    await loadContactListsForContact(selectedContactId.value)
    alert('Contact added to list successfully')
    closeAddToListModal()
  } catch (err: any) {
    console.error('Failed to add contact to list:', err)
    alert(err.response?.data?.error || 'Failed to add contact to list')
  } finally {
    addingToListId.value = null
  }
}

async function loadContactListsForContact(contactId: number) {
  try {
    const response = await api.get(`/contacts/${contactId}/lists`)
    contactLists.value[contactId] = response.data.lists || []
  } catch (error) {
    console.error(`Failed to load lists for contact ${contactId}:`, error)
  }
}

async function bulkAddContactsToList(listId: number) {
  if (selectedContacts.value.size === 0) return

  // Validate listId
  const numListId = typeof listId === 'number' ? listId : parseInt(String(listId), 10)
  if (isNaN(numListId) || numListId <= 0) {
    alert('Invalid list ID')
    return
  }

  bulkAddingToListId.value = numListId
  try {
    // Ensure all IDs are valid numbers
    const contactIds: number[] = []
    for (const id of selectedContacts.value) {
      const numId = typeof id === 'number' ? id : parseInt(String(id), 10)
      if (!isNaN(numId) && numId > 0 && Number.isInteger(numId)) {
        contactIds.push(numId)
      } else {
        console.warn('Skipping invalid contact ID:', id)
      }
    }

    if (contactIds.length === 0) {
      alert('No valid contacts selected')
      bulkAddingToListId.value = null
      return
    }

    console.log('Adding contacts to list:', { listId: numListId, contactIds })

    await api.post(`/lists/${numListId}/contacts/bulk`, { contactIds })
    
    // Reload lists for all affected contacts
    await Promise.all(contactIds.map(id => loadContactListsForContact(id)))
    
    alert(`Successfully added ${contactIds.length} contact${contactIds.length === 1 ? '' : 's'} to list`)
    selectedContacts.value.clear()
    closeBulkAddToListModal()
  } catch (err: any) {
    console.error('Failed to add contacts to list:', err)
    alert(err.response?.data?.error || 'Failed to add contacts to list')
  } finally {
    bulkAddingToListId.value = null
  }
}

function toggleContact(contactId: number | string) {
  // Ensure ID is a number
  const numId = typeof contactId === 'number' ? contactId : parseInt(String(contactId), 10)
  if (isNaN(numId)) {
    console.error('Invalid contact ID:', contactId)
    return
  }

  if (selectedContacts.value.has(numId)) {
    selectedContacts.value.delete(numId)
  } else {
    selectedContacts.value.add(numId)
  }
}

function toggleSelectAll() {
  if (isAllSelected.value) {
    selectedContacts.value.clear()
  } else {
    contacts.value.forEach(contact => {
      // Ensure ID is a number
      const numId = typeof contact.id === 'number' ? contact.id : parseInt(String(contact.id), 10)
      if (!isNaN(numId)) {
        selectedContacts.value.add(numId)
      }
    })
  }
}

const isAllSelected = computed(() => {
  return contacts.value.length > 0 && contacts.value.every(contact => selectedContacts.value.has(contact.id))
})

function clearSelection() {
  selectedContacts.value.clear()
}

async function bulkDelete() {
  if (selectedContacts.value.size === 0) return
  
  const count = selectedContacts.value.size
  if (!confirm(`Are you sure you want to delete ${count} contact${count === 1 ? '' : 's'}?`)) return

  isDeleting.value = true
  try {
    await api.post('/contacts/bulk-delete', {
      contactIds: Array.from(selectedContacts.value)
    })
    selectedContacts.value.clear()
    loadContacts()
  } catch (error: any) {
    console.error('Failed to delete contacts:', error)
    const errorMessage = error.response?.data?.error || error.message || 'Failed to delete contacts'
    alert(errorMessage)
    // Don't reload or redirect - just show error and keep user on page
    // Only reload if it was a successful deletion
  } finally {
    isDeleting.value = false
  }
}

onMounted(() => {
  loadContacts()
})
</script>

