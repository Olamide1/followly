<template>
  <div>
    <div class="page-header">
      <h1 class="page-title">Settings</h1>
      <p class="page-description">Manage your account and email providers</p>
    </div>

    <div class="space-y-8 sm:space-y-12">
      <div class="bg-paper border border-grid-light p-8">
        <h2 class="text-sm font-normal text-ink-500 uppercase tracking-wider mb-6">Email Providers</h2>
        <p class="text-sm text-ink-600 mb-8 leading-relaxed">
          Connect your own email providers or use Followly's infrastructure.
        </p>
        
        <div v-if="providers.length === 0" class="border-l-2 border-ink-900 pl-6 mb-8">
          <h3 class="text-sm font-normal text-ink-500 uppercase tracking-wider mb-4">No Providers Configured</h3>
          <p class="text-ink-700 leading-relaxed mb-6">
            Add an email provider to start sending campaigns. You can configure Brevo, Mailjet, or Resend.
          </p>
        </div>
        
        <div v-else class="space-y-4">
          <div
            v-for="provider in providers"
            :key="provider.id"
            class="flex justify-between items-center border-b border-grid-light pb-4"
          >
            <div>
              <span class="text-ink-900 uppercase tracking-wider text-sm">{{ provider.provider }}</span>
              <span v-if="provider.is_default" class="ml-3 text-xs text-ink-500 uppercase tracking-wider">(Default)</span>
            </div>
            <button
              @click="deleteProvider(provider.id)"
              class="text-ink-500 hover:text-ink-900 text-xs"
            >
              Remove
            </button>
          </div>
        </div>
      </div>

      <div class="bg-paper border border-grid-light p-8">
        <div class="flex items-center justify-between mb-6">
          <h2 class="text-sm font-normal text-ink-500 uppercase tracking-wider">Setup Guide</h2>
          <button
            @click="showGuide = !showGuide"
            class="text-xs text-ink-500 hover:text-ink-900 uppercase tracking-wider"
          >
            {{ showGuide ? 'Hide Guide' : 'Show Guide' }}
          </button>
        </div>
        
        <div v-if="showGuide" class="space-y-6 mb-8 pb-8 border-b border-grid-light">
          <div class="prose prose-sm max-w-none">
            <p class="text-ink-700 leading-relaxed mb-6">
              Follow these step-by-step instructions to configure your email provider. Each provider requires different setup steps.
            </p>

            <!-- Brevo Guide -->
            <div class="mb-8">
              <h3 class="text-sm font-normal text-ink-900 uppercase tracking-wider mb-4">Brevo (formerly Sendinblue)</h3>
              <ol class="list-decimal list-inside space-y-3 text-ink-700 text-sm leading-relaxed">
                <li>Sign up or log in to your <a href="https://www.brevo.com" target="_blank" class="text-ink-900 underline">Brevo account</a></li>
                <li>Navigate to <strong>Settings → API Keys</strong> (or <strong>SMTP & API → API Keys</strong>)</li>
                <li>Click <strong>"Generate a new API key"</strong></li>
                <li>Give it a name (e.g., "Followly") and select the appropriate permissions:
                  <ul class="list-disc list-inside ml-4 mt-2 space-y-1">
                    <li>At minimum: <strong>Send emails</strong></li>
                    <li>Recommended: <strong>Send emails</strong> and <strong>Access account information</strong></li>
                  </ul>
                </li>
                <li>Copy the generated API key (it starts with <code class="bg-ink-100 px-1 rounded">xkeysib-</code>)</li>
                <li>Paste it into the <strong>API Key</strong> field below</li>
                <li>Enter your <strong>From Email</strong> (must be verified in Brevo)</li>
                <li>Set your <strong>Daily Limit</strong> (optional, leave 0 for unlimited based on your plan)</li>
              </ol>
              <div class="mt-4 p-4 bg-ink-50 border-l-2 border-ink-900">
                <p class="text-xs text-ink-600"><strong>Note:</strong> Your "From Email" must be verified in Brevo. Go to <strong>Settings → Senders</strong> to verify your email address or domain.</p>
              </div>
            </div>

            <!-- Mailjet Guide -->
            <div class="mb-8">
              <h3 class="text-sm font-normal text-ink-900 uppercase tracking-wider mb-4">Mailjet</h3>
              <ol class="list-decimal list-inside space-y-3 text-ink-700 text-sm leading-relaxed">
                <li>Sign up or log in to your <a href="https://www.mailjet.com" target="_blank" class="text-ink-900 underline">Mailjet account</a></li>
                <li>Navigate to <strong>Account Settings → API Keys</strong> (or click your profile → <strong>API Keys</strong>)</li>
                <li>You'll see two keys:
                  <ul class="list-disc list-inside ml-4 mt-2 space-y-1">
                    <li><strong>API Key</strong> (starts with numbers/letters)</li>
                    <li><strong>Secret Key</strong> (longer string)</li>
                  </ul>
                </li>
                <li>Copy both keys and paste them into the respective fields below</li>
                <li>Enter your <strong>From Email</strong> (must be verified in Mailjet)</li>
                <li>Set your <strong>Daily Limit</strong> (optional, leave 0 for unlimited based on your plan)</li>
              </ol>
              <div class="mt-4 p-4 bg-ink-50 border-l-2 border-ink-900">
                <p class="text-xs text-ink-600"><strong>Note:</strong> Verify your sender email in <strong>Account Settings → Sender &amp; Domains</strong> before sending campaigns.</p>
              </div>
            </div>

            <!-- Resend Guide -->
            <div class="mb-8">
              <h3 class="text-sm font-normal text-ink-900 uppercase tracking-wider mb-4">Resend</h3>
              <ol class="list-decimal list-inside space-y-3 text-ink-700 text-sm leading-relaxed">
                <li>Sign up or log in to your <a href="https://resend.com" target="_blank" class="text-ink-900 underline">Resend account</a></li>
                <li>Navigate to <strong>API Keys</strong> in the left sidebar</li>
                <li>Click <strong>"Create API Key"</strong></li>
                <li>Give it a name (e.g., "Followly") and select permissions:
                  <ul class="list-disc list-inside ml-4 mt-2 space-y-1">
                    <li>Select <strong>"Sending access"</strong></li>
                    <li>Optionally restrict to specific domains</li>
                  </ul>
                </li>
                <li>Copy the generated API key (it starts with <code class="bg-ink-100 px-1 rounded">re_</code>)</li>
                <li>Paste it into the <strong>API Key</strong> field below</li>
                <li><strong>IMPORTANT - Domain Verification:</strong>
                  <ul class="list-disc list-inside ml-4 mt-2 space-y-2">
                    <li>Go to <strong>Domains</strong> in Resend</li>
                    <li>Click <strong>"Add Domain"</strong> and enter your domain (e.g., <code class="bg-ink-100 px-1 rounded">yourdomain.com</code>)</li>
                    <li>Resend will provide DNS records to add to your domain's DNS settings</li>
                    <li>Add these records in your domain's DNS (cPanel Zone Editor, Cloudflare, etc.):
                      <ul class="list-disc list-inside ml-4 mt-1 space-y-1 text-xs">
                        <li><strong>SPF record:</strong> <code class="bg-ink-100 px-1 rounded">v=spf1 include:resend.com ~all</code></li>
                        <li><strong>DKIM records:</strong> Multiple TXT records (provided by Resend)</li>
                        <li><strong>DMARC record:</strong> <code class="bg-ink-100 px-1 rounded">v=DMARC1; p=none;</code> (optional but recommended)</li>
                      </ul>
                    </li>
                    <li>Wait for DNS propagation (usually 5-30 minutes, can take up to 48 hours)</li>
                    <li>Resend will show "Verified" when DNS is correct</li>
                  </ul>
                </li>
                <li>Enter your <strong>From Email</strong> using the verified domain (e.g., <code class="bg-ink-100 px-1 rounded">noreply@yourdomain.com</code>)</li>
                <li>Set your <strong>Daily Limit</strong> (optional, leave 0 for unlimited based on your plan)</li>
              </ol>
              <div class="mt-4 p-4 bg-ink-50 border-l-2 border-ink-900">
                <p class="text-xs text-ink-600 mb-2"><strong>Important:</strong> Resend requires domain verification before sending emails. Adding Resend DNS records will NOT affect your regular email server. They work alongside each other.</p>
                <p class="text-xs text-ink-600"><strong>cPanel Users:</strong> Add the DNS records in your Zone Editor. The records are TXT and CNAME types. Your existing email server records (MX, A, etc.) should remain unchanged.</p>
              </div>
            </div>

            <!-- Field Explanations -->
            <div class="mt-8 pt-6 border-t border-grid-light">
              <h3 class="text-sm font-normal text-ink-900 uppercase tracking-wider mb-4">Field Explanations</h3>
              <dl class="space-y-3 text-sm text-ink-700">
                <div>
                  <dt class="font-medium text-ink-900 mb-1">API Key</dt>
                  <dd class="text-ink-600">Your provider's API key for authentication. Required for all providers.</dd>
                </div>
                <div>
                  <dt class="font-medium text-ink-900 mb-1">API Secret (Mailjet only)</dt>
                  <dd class="text-ink-600">Mailjet requires both an API Key and API Secret. Found in the same section as your API Key.</dd>
                </div>
                <div>
                  <dt class="font-medium text-ink-900 mb-1">From Email</dt>
                  <dd class="text-ink-600">The email address that will appear as the sender. Must be verified with your provider. For Resend, must use a verified domain.</dd>
                </div>
                <div>
                  <dt class="font-medium text-ink-900 mb-1">Daily Limit</dt>
                  <dd class="text-ink-600">Maximum number of emails to send per day through this provider. Set to 0 for unlimited (based on your provider plan). Useful for email warmup or managing sending limits.</dd>
                </div>
                <div>
                  <dt class="font-medium text-ink-900 mb-1">Set as Default</dt>
                  <dd class="text-ink-600">When enabled, this provider will be used for all campaigns unless you specify otherwise. You can have multiple providers and switch between them.</dd>
                </div>
              </dl>
            </div>
          </div>
        </div>
      </div>

      <div class="bg-paper border border-grid-light p-8">
        <h2 class="text-sm font-normal text-ink-500 uppercase tracking-wider mb-8">Add Provider</h2>
        <form @submit.prevent="addProvider" class="space-y-6 sm:space-y-8">
          <div>
            <label for="provider" class="block text-xs font-normal text-ink-500 uppercase tracking-wider mb-3">
              Provider
            </label>
            <select id="provider" v-model="providerForm.provider" required class="input">
              <option value="">Select provider</option>
              <option value="brevo">Brevo</option>
              <option value="mailjet">Mailjet</option>
              <option value="resend">Resend</option>
            </select>
          </div>

          <div>
            <label for="api_key" class="block text-xs font-normal text-ink-500 uppercase tracking-wider mb-3">
              API Key
            </label>
            <input id="api_key" v-model="providerForm.api_key" type="text" required class="input" />
          </div>

          <div v-if="providerForm.provider === 'mailjet'">
            <label for="api_secret" class="block text-xs font-normal text-ink-500 uppercase tracking-wider mb-3">
              API Secret
            </label>
            <input id="api_secret" v-model="providerForm.api_secret" type="text" class="input" />
          </div>

          <div>
            <label for="from_email" class="block text-xs font-normal text-ink-500 uppercase tracking-wider mb-3">
              From Email
            </label>
            <input id="from_email" v-model="providerForm.from_email" type="email" class="input" />
          </div>

          <div>
            <label for="daily_limit" class="block text-xs font-normal text-ink-500 uppercase tracking-wider mb-3">
              Daily Limit
            </label>
            <input
              id="daily_limit"
              v-model.number="providerForm.daily_limit"
              type="number"
              class="input"
            />
          </div>

          <div>
            <label class="flex items-center">
              <input
                v-model="providerForm.is_default"
                type="checkbox"
                class="mr-3"
              />
              <span class="text-xs text-ink-600 uppercase tracking-wider">Set as default provider</span>
            </label>
          </div>

          <button type="submit" class="btn btn-primary w-full sm:w-auto">Add Provider</button>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import api from '@/services/api'

const providers = ref<any[]>([])
const showGuide = ref(false)
const providerForm = ref({
  provider: '',
  api_key: '',
  api_secret: '',
  from_email: '',
  daily_limit: 0,
  is_default: false,
})

async function loadProviders() {
  try {
    const response = await api.get('/providers')
    providers.value = response.data.configs
  } catch (error) {
    console.error('Failed to load providers:', error)
  }
}

async function addProvider() {
  try {
    await api.post('/providers', providerForm.value)
    alert('Provider added successfully!')
    providerForm.value = {
      provider: '',
      api_key: '',
      api_secret: '',
      from_email: '',
      daily_limit: 0,
      is_default: false,
    }
    loadProviders()
  } catch (error: any) {
    const errorMessage = error.response?.data?.message || error.message || 'Failed to add provider'
    alert(`Error: ${errorMessage}`)
    console.error('Failed to add provider:', error)
  }
}

async function deleteProvider(id: number) {
  if (!confirm('Are you sure you want to remove this provider?')) return
  
  try {
    await api.delete(`/providers/${id}`)
    loadProviders()
  } catch (error) {
    console.error('Failed to delete provider:', error)
  }
}

onMounted(() => {
  loadProviders()
})
</script>

