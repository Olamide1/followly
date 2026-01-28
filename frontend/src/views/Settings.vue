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
            Add an email provider to start sending campaigns. You can configure Brevo, Mailjet, Resend, or your own SMTP server with DKIM.
          </p>
        </div>
        
        <div v-else class="space-y-4">
          <div
            v-for="provider in providers"
            :key="provider.id"
            class="border-b border-grid-light pb-4"
          >
            <div class="flex justify-between items-start">
              <div class="flex-1">
                <div class="flex items-center space-x-3 mb-2">
                  <span class="text-ink-900 uppercase tracking-wider text-sm font-medium">{{ provider.provider }}</span>
                  <span v-if="provider.is_default" class="text-xs text-ink-500 uppercase tracking-wider">(Default)</span>
                  <span 
                    v-if="!provider.is_active" 
                    class="text-xs text-ink-600 uppercase tracking-wider bg-ink-100 px-2 py-1"
                  >
                    Inactive
                  </span>
                </div>
                <div v-if="provider.from_email" class="text-xs text-ink-600 mb-1">
                  From: {{ provider.from_email }}
                </div>
                <div v-if="provider.provider === 'nodemailer' && provider.smtp_host" class="text-xs text-ink-600 mb-1">
                  SMTP: {{ provider.smtp_host }}:{{ provider.smtp_port }}
                  <span v-if="provider.dkim_domain" class="ml-2 text-green-600">(DKIM enabled)</span>
                </div>
                <div v-if="!provider.is_active" class="text-xs text-ink-500 italic mt-1">
                  This provider is inactive and won't be used for sending emails. Click "Reactivate" to enable it.
                </div>
              </div>
              <div class="flex items-center space-x-3 ml-4">
                <button
                  v-if="!provider.is_default && provider.is_active"
                  @click="setAsDefault(provider.id)"
                  class="text-xs text-ink-600 hover:text-ink-900 uppercase tracking-wider px-3 py-1 border border-grid-medium hover:border-ink-900 transition-colors"
                >
                  Set as Default
                </button>
                <button
                  v-if="!provider.is_active"
                  @click="reactivateProvider(provider.id)"
                  class="text-xs text-ink-600 hover:text-ink-900 uppercase tracking-wider px-3 py-1 border border-grid-medium hover:border-ink-900 transition-colors"
                >
                  Reactivate
                </button>
                <button
                  v-if="provider.is_active"
                  @click="deactivateProvider(provider.id)"
                  class="text-ink-500 hover:text-ink-900 text-xs"
                >
                  Deactivate
                </button>
                <button
                  v-if="!provider.is_active"
                  @click="deleteProvider(provider.id)"
                  class="text-ink-500 hover:text-red-600 text-xs"
                >
                  Delete
                </button>
              </div>
            </div>
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

            <!-- SMTP/Nodemailer Guide -->
            <div class="mb-8">
              <h3 class="text-sm font-normal text-ink-900 uppercase tracking-wider mb-4">SMTP Server (Nodemailer) - Unlimited Sending</h3>
              <p class="text-ink-700 text-sm leading-relaxed mb-4">
                Use your own SMTP server for <strong>unlimited email sending</strong> with full control over deliverability. This is the recommended option if you have your own email server with DKIM set up.
              </p>
              <ol class="list-decimal list-inside space-y-3 text-ink-700 text-sm leading-relaxed">
                <li>Get your SMTP credentials from your email hosting provider:
                  <ul class="list-disc list-inside ml-4 mt-2 space-y-1">
                    <li><strong>SMTP Host:</strong> e.g., <code class="bg-ink-100 px-1 rounded">mail.yourdomain.com</code> or <code class="bg-ink-100 px-1 rounded">smtp.gmail.com</code></li>
                    <li><strong>SMTP Port:</strong> Common ports are <code class="bg-ink-100 px-1 rounded">465</code> (SSL), <code class="bg-ink-100 px-1 rounded">587</code> (TLS), or <code class="bg-ink-100 px-1 rounded">25</code></li>
                    <li><strong>Username:</strong> Usually your full email address</li>
                    <li><strong>Password:</strong> Your email password or app-specific password</li>
                  </ul>
                </li>
                <li>For better inbox placement, add DKIM credentials:
                  <ul class="list-disc list-inside ml-4 mt-2 space-y-1">
                    <li><strong>DKIM Domain:</strong> Your sending domain (e.g., <code class="bg-ink-100 px-1 rounded">yourdomain.com</code>)</li>
                    <li><strong>DKIM Selector:</strong> Usually <code class="bg-ink-100 px-1 rounded">default</code> or <code class="bg-ink-100 px-1 rounded">mail</code></li>
                    <li><strong>DKIM Private Key:</strong> Your private key (PEM format, starting with <code class="bg-ink-100 px-1 rounded">-----BEGIN RSA PRIVATE KEY-----</code>)</li>
                  </ul>
                </li>
                <li>Fill in all the fields below and click "Add Provider"</li>
              </ol>
              <div class="mt-4 p-4 bg-ink-50 border-l-2 border-ink-900">
                <p class="text-xs text-ink-600 mb-2"><strong>Benefits of SMTP:</strong> No daily sending limits, full control over your email reputation, and emails are sent directly from your domain.</p>
                <p class="text-xs text-ink-600 mb-2"><strong>DKIM Importance:</strong> DKIM signing greatly improves inbox placement. Without it, your emails may land in spam folders.</p>
                <p class="text-xs text-ink-600"><strong>Security Note:</strong> Your SMTP password and DKIM private key are encrypted and stored securely. They are never exposed in API responses.</p>
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
              <option value="nodemailer">SMTP Server (Unlimited)</option>
            </select>
          </div>

          <!-- API-based providers (Brevo, Mailjet, Resend) -->
          <template v-if="providerForm.provider && providerForm.provider !== 'nodemailer'">
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
          </template>

          <!-- SMTP/Nodemailer configuration -->
          <template v-if="providerForm.provider === 'nodemailer'">
            <div class="border-l-2 border-ink-300 pl-6 space-y-6">
              <h3 class="text-xs font-normal text-ink-500 uppercase tracking-wider">SMTP Connection</h3>
              
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label for="smtp_host" class="block text-xs font-normal text-ink-500 uppercase tracking-wider mb-3">
                    SMTP Host *
                  </label>
                  <input 
                    id="smtp_host" 
                    v-model="providerForm.smtp_host" 
                    type="text" 
                    required 
                    placeholder="mail.yourdomain.com"
                    class="input" 
                  />
                </div>
                <div>
                  <label for="smtp_port" class="block text-xs font-normal text-ink-500 uppercase tracking-wider mb-3">
                    SMTP Port *
                  </label>
                  <input 
                    id="smtp_port" 
                    v-model.number="providerForm.smtp_port" 
                    type="number" 
                    required 
                    placeholder="465"
                    class="input" 
                  />
                </div>
              </div>

              <div>
                <label class="flex items-center">
                  <input
                    v-model="providerForm.smtp_secure"
                    type="checkbox"
                    class="mr-3"
                  />
                  <span class="text-xs text-ink-600 uppercase tracking-wider">Use SSL/TLS (check for port 465, uncheck for 587)</span>
                </label>
              </div>

              <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label for="smtp_user" class="block text-xs font-normal text-ink-500 uppercase tracking-wider mb-3">
                    Username *
                  </label>
                  <input 
                    id="smtp_user" 
                    v-model="providerForm.smtp_user" 
                    type="text" 
                    required 
                    placeholder="you@yourdomain.com"
                    class="input" 
                  />
                </div>
                <div>
                  <label for="smtp_pass" class="block text-xs font-normal text-ink-500 uppercase tracking-wider mb-3">
                    Password *
                  </label>
                  <input 
                    id="smtp_pass" 
                    v-model="providerForm.smtp_pass" 
                    type="password" 
                    required 
                    placeholder="Your email password"
                    class="input" 
                  />
                </div>
              </div>
            </div>

            <div class="border-l-2 border-green-300 pl-6 space-y-6">
              <h3 class="text-xs font-normal text-ink-500 uppercase tracking-wider">DKIM Configuration (Optional but Recommended)</h3>
              <p class="text-xs text-ink-600">DKIM signing helps your emails land in the inbox instead of spam.</p>
              
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label for="dkim_domain" class="block text-xs font-normal text-ink-500 uppercase tracking-wider mb-3">
                    DKIM Domain
                  </label>
                  <input 
                    id="dkim_domain" 
                    v-model="providerForm.dkim_domain" 
                    type="text" 
                    placeholder="yourdomain.com"
                    class="input" 
                  />
                </div>
                <div>
                  <label for="dkim_selector" class="block text-xs font-normal text-ink-500 uppercase tracking-wider mb-3">
                    DKIM Selector
                  </label>
                  <input 
                    id="dkim_selector" 
                    v-model="providerForm.dkim_selector" 
                    type="text" 
                    placeholder="default"
                    class="input" 
                  />
                </div>
              </div>

              <div>
                <label for="dkim_private_key" class="block text-xs font-normal text-ink-500 uppercase tracking-wider mb-3">
                  DKIM Private Key (PEM format)
                </label>
                <textarea 
                  id="dkim_private_key" 
                  v-model="providerForm.dkim_private_key" 
                  rows="4"
                  placeholder="-----BEGIN RSA PRIVATE KEY-----&#10;...&#10;-----END RSA PRIVATE KEY-----"
                  class="input font-mono text-xs"
                ></textarea>
              </div>
            </div>
          </template>

          <div>
            <label for="from_email" class="block text-xs font-normal text-ink-500 uppercase tracking-wider mb-3">
              From Email
            </label>
            <input id="from_email" v-model="providerForm.from_email" type="email" class="input" />
          </div>

          <div v-if="providerForm.provider !== 'nodemailer'">
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

      <div class="bg-paper border border-grid-light p-8">
        <h2 class="text-sm font-normal text-ink-500 uppercase tracking-wider mb-6">Queue Management</h2>
        <p class="text-sm text-ink-600 mb-8 leading-relaxed">
          Control email queue processing. Pause to stop sending emails immediately, or resume to continue processing.
        </p>
        
        <div class="space-y-4">
          <div class="flex items-center justify-between p-4 border border-grid-light">
            <div>
              <p class="text-sm font-medium text-ink-900 mb-1">Email Queue Status</p>
              <p class="text-xs text-ink-600">
                {{ queueStatus.paused ? 'Queue is paused - no new emails will be processed' : 'Queue is active - emails are being processed' }}
              </p>
            </div>
            <div class="flex items-center space-x-2">
              <span 
                class="px-3 py-1 text-xs uppercase tracking-wider"
                :class="queueStatus.paused ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'"
              >
                {{ queueStatus.paused ? 'Paused' : 'Active' }}
              </span>
            </div>
          </div>
          
          <div class="flex space-x-3">
            <button
              @click="pauseQueue"
              :disabled="queueStatus.paused || queueLoading"
              class="btn"
              :class="queueStatus.paused ? 'opacity-50 cursor-not-allowed' : 'btn-primary'"
            >
              {{ queueLoading ? 'Pausing...' : 'Pause Queue' }}
            </button>
            <button
              @click="resumeQueue"
              :disabled="!queueStatus.paused || queueLoading"
              class="btn"
              :class="!queueStatus.paused ? 'opacity-50 cursor-not-allowed' : 'btn-primary'"
            >
              {{ queueLoading ? 'Resuming...' : 'Resume Queue' }}
            </button>
            <button
              @click="checkQueueStatus"
              :disabled="queueLoading"
              class="btn btn-ghost"
            >
              Refresh Status
            </button>
          </div>
          
          <div v-if="queueStatus.message" class="mt-4 p-4 border-l-2 border-ink-900 bg-ink-50">
            <p class="text-xs text-ink-700">{{ queueStatus.message }}</p>
          </div>
        </div>
      </div>

      <div class="bg-paper border border-grid-light p-8">
        <h2 class="text-sm font-normal text-ink-500 uppercase tracking-wider mb-6">Email Footer Settings</h2>
        <p class="text-sm text-ink-600 mb-8 leading-relaxed">
          Customize the unsubscribe footer that is automatically added to all campaign and automation emails. This footer is required for compliance with email regulations (CAN-SPAM, GDPR, CASL).
        </p>
        
        <form @submit.prevent="saveFooterSettings" class="space-y-6 sm:space-y-8">
          <div>
            <label for="custom_footer_text" class="block text-xs font-normal text-ink-500 uppercase tracking-wider mb-3">
              Custom Footer Text
            </label>
            <input
              id="custom_footer_text"
              v-model="footerForm.custom_footer_text"
              type="text"
              placeholder="Don't want to receive these emails?"
              class="input"
            />
            <p class="text-xs text-ink-500 mt-2">
              This text appears before the unsubscribe link. Leave empty to use the default text.
            </p>
          </div>

          <div>
            <label for="company_address" class="block text-xs font-normal text-ink-500 uppercase tracking-wider mb-3">
              Company Address
            </label>
            <textarea
              id="company_address"
              v-model="footerForm.company_address"
              rows="3"
              placeholder="123 Your Street, City, State ZIP"
              class="input"
            ></textarea>
            <p class="text-xs text-ink-500 mt-2">
              Your physical mailing address (required by CAN-SPAM Act). This will appear at the bottom of all emails.
            </p>
          </div>

          <button type="submit" class="btn btn-primary w-full sm:w-auto">Save Footer Settings</button>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import api from '@/services/api'
import { useAuthStore } from '@/stores/auth'

const authStore = useAuthStore()
const providers = ref<any[]>([])
const showGuide = ref(false)
const providerForm = ref({
  provider: '',
  api_key: '',
  api_secret: '',
  from_email: '',
  daily_limit: 0,
  is_default: false,
  // Nodemailer/SMTP fields
  smtp_host: '',
  smtp_port: 465,
  smtp_secure: true,
  smtp_user: '',
  smtp_pass: '',
  dkim_domain: '',
  dkim_selector: 'default',
  dkim_private_key: '',
})
const footerForm = ref({
  custom_footer_text: '',
  company_address: '',
})
const queueStatus = ref({
  paused: false,
  message: '',
})
const queueLoading = ref(false)

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
    // Log what we're sending for nodemailer
    if (providerForm.value.provider === 'nodemailer') {
      console.log('[Frontend] Sending nodemailer config:', {
        provider: providerForm.value.provider,
        smtp_host: providerForm.value.smtp_host ? 'present' : 'missing',
        smtp_port: providerForm.value.smtp_port,
        smtp_secure: providerForm.value.smtp_secure,
        smtp_user: providerForm.value.smtp_user ? 'present' : 'missing',
        smtp_pass: providerForm.value.smtp_pass ? 'present' : 'missing',
        from_email: providerForm.value.from_email,
      });
    }
    
    await api.post('/providers', providerForm.value)
    alert('Provider added successfully!')
    providerForm.value = {
      provider: '',
      api_key: '',
      api_secret: '',
      from_email: '',
      daily_limit: 0,
      is_default: false,
      smtp_host: '',
      smtp_port: 465,
      smtp_secure: true,
      smtp_user: '',
      smtp_pass: '',
      dkim_domain: '',
      dkim_selector: 'default',
      dkim_private_key: '',
    }
    loadProviders()
  } catch (error: any) {
    const errorMessage = error.response?.data?.message || error.message || 'Failed to add provider'
    alert(`Error: ${errorMessage}`)
    console.error('Failed to add provider:', error)
  }
}

async function deactivateProvider(id: number) {
  if (!confirm('Are you sure you want to deactivate this provider? It will be kept for reactivation later.')) return
  
  try {
    await api.delete(`/providers/${id}`)
    alert('Provider deactivated successfully. You can reactivate it later.')
    loadProviders()
  } catch (error: any) {
    const errorMessage = error.response?.data?.message || error.message || 'Failed to deactivate provider'
    alert(`Error: ${errorMessage}`)
    console.error('Failed to deactivate provider:', error)
  }
}

async function deleteProvider(id: number) {
  if (!confirm('Are you sure you want to permanently delete this provider? This cannot be undone and all configuration will be lost.')) return
  
  try {
    // Hard delete - only works for inactive providers
    await api.delete(`/providers/${id}/permanent`)
    alert('Provider permanently deleted.')
    loadProviders()
  } catch (error: any) {
    const errorMessage = error.response?.data?.message || error.message || 'Failed to delete provider'
    alert(`Error: ${errorMessage}`)
    console.error('Failed to delete provider:', error)
  }
}

async function setAsDefault(id: number) {
  try {
    await api.post(`/providers/${id}/set-default`)
    alert('Default provider changed successfully!')
    loadProviders()
  } catch (error: any) {
    const errorMessage = error.response?.data?.message || error.message || 'Failed to set default provider'
    alert(`Error: ${errorMessage}`)
    console.error('Failed to set default provider:', error)
  }
}

async function reactivateProvider(id: number) {
  try {
    await api.post(`/providers/${id}/reactivate`)
    alert('Provider reactivated successfully!')
    loadProviders()
  } catch (error: any) {
    console.error('Failed to reactivate provider:', error)
    const errorMessage = error.response?.data?.message || error.message || 'Failed to reactivate provider'
    alert(`Error: ${errorMessage}`)
  }
}

async function loadFooterSettings() {
  try {
    // Load from user data (already fetched by auth store)
    if (authStore.user) {
      footerForm.value.custom_footer_text = (authStore.user as any).custom_footer_text || ''
      footerForm.value.company_address = (authStore.user as any).company_address || ''
    } else {
      // Fetch user data if not loaded
      await authStore.fetchUser()
      if (authStore.user) {
        footerForm.value.custom_footer_text = (authStore.user as any).custom_footer_text || ''
        footerForm.value.company_address = (authStore.user as any).company_address || ''
      }
    }
  } catch (error) {
    console.error('Failed to load footer settings:', error)
  }
}

async function saveFooterSettings() {
  try {
    await api.put('/auth/footer-settings', footerForm.value)
    alert('Footer settings saved successfully!')
    // Reload user data to get updated settings
    await authStore.fetchUser()
  } catch (error: any) {
    const errorMessage = error.response?.data?.message || error.message || 'Failed to save footer settings'
    alert(`Error: ${errorMessage}`)
    console.error('Failed to save footer settings:', error)
  }
}

async function checkQueueStatus() {
  try {
    queueLoading.value = true
    const response = await api.get('/admin/queue/status')
    queueStatus.value = {
      paused: response.data.paused,
      message: response.data.message || '',
    }
  } catch (error: any) {
    console.error('Failed to check queue status:', error)
    queueStatus.value.message = 'Failed to check queue status'
  } finally {
    queueLoading.value = false
  }
}

async function pauseQueue() {
  if (!confirm('Are you sure you want to pause the email queue? No new emails will be processed until you resume.')) {
    return
  }
  
  try {
    queueLoading.value = true
    const response = await api.post('/admin/queue/pause')
    queueStatus.value = {
      paused: response.data.paused,
      message: response.data.message || 'Email queue paused successfully',
    }
    alert('Email queue paused. No new emails will be processed.')
  } catch (error: any) {
    const errorMessage = error.response?.data?.message || error.message || 'Failed to pause queue'
    alert(`Error: ${errorMessage}`)
    console.error('Failed to pause queue:', error)
  } finally {
    queueLoading.value = false
  }
}

async function resumeQueue() {
  try {
    queueLoading.value = true
    const response = await api.post('/admin/queue/resume')
    queueStatus.value = {
      paused: response.data.paused,
      message: response.data.message || 'Email queue resumed successfully',
    }
    alert('Email queue resumed. Emails will be processed.')
  } catch (error: any) {
    const errorMessage = error.response?.data?.message || error.message || 'Failed to resume queue'
    alert(`Error: ${errorMessage}`)
    console.error('Failed to resume queue:', error)
  } finally {
    queueLoading.value = false
  }
}

onMounted(() => {
  loadProviders()
  loadFooterSettings()
  checkQueueStatus()
})
</script>

