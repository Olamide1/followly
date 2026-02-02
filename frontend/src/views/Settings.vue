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
        <h2 class="text-sm font-normal text-ink-500 uppercase tracking-wider mb-6">Failed Campaign Send Jobs</h2>
        <p class="text-sm text-ink-600 mb-8 leading-relaxed">
          View and manage failed campaign send jobs. Failed jobs can prevent new campaigns from sending if they have the same job ID.
        </p>
        
        <div class="space-y-4">
          <div class="flex items-center justify-between mb-4">
            <div>
              <p class="text-sm font-medium text-ink-900">
                Failed Jobs: <span class="text-red-600">{{ failedJobs.length }}</span>
              </p>
            </div>
            <div class="flex space-x-3">
              <button
                @click="loadFailedJobs"
                :disabled="failedJobsLoading"
                class="btn btn-ghost"
              >
                {{ failedJobsLoading ? 'Loading...' : 'Refresh' }}
              </button>
              <button
                @click="cleanFailedJobs"
                :disabled="failedJobsLoading || failedJobs.length === 0"
                class="btn"
                :class="failedJobs.length === 0 ? 'opacity-50 cursor-not-allowed' : 'btn-primary'"
              >
                Clean All Failed Jobs
              </button>
            </div>
          </div>

          <div v-if="failedJobs.length === 0 && !failedJobsLoading" class="p-4 border border-grid-light text-center">
            <p class="text-sm text-ink-600">No failed jobs found. All campaign send jobs are healthy.</p>
          </div>

          <div v-else-if="failedJobsLoading" class="p-4 border border-grid-light text-center">
            <p class="text-sm text-ink-600">Loading failed jobs...</p>
          </div>

          <div v-else class="space-y-4">
            <div
              v-for="job in failedJobs"
              :key="job.id"
              class="border border-red-200 bg-red-50 p-4"
            >
              <div class="flex justify-between items-start mb-2">
                <div>
                  <p class="text-sm font-medium text-ink-900">Job ID: {{ job.id }}</p>
                  <p v-if="job.data?.campaignId" class="text-xs text-ink-600">
                    Campaign ID: {{ job.data.campaignId }}, User ID: {{ job.data.userId }}
                  </p>
                </div>
                <span class="px-2 py-1 text-xs uppercase tracking-wider bg-red-100 text-red-800">
                  Failed
                </span>
              </div>
              
              <div class="mt-3 space-y-2">
                <div>
                  <p class="text-xs font-medium text-ink-700 mb-1">Error Reason:</p>
                  <p class="text-xs text-ink-600 font-mono bg-white p-2 border border-red-200 rounded">
                    {{ job.failedReason || 'No reason provided' }}
                  </p>
                </div>
                
                <div v-if="job.stacktrace && job.stacktrace.length > 0">
                  <p class="text-xs font-medium text-ink-700 mb-1">Stack Trace:</p>
                  <pre class="text-xs text-ink-600 font-mono bg-white p-2 border border-red-200 rounded overflow-auto max-h-32">{{ job.stacktrace.join('\n') }}</pre>
                </div>
                
                <div class="flex items-center space-x-4 text-xs text-ink-500 mt-2">
                  <span>Attempts: {{ job.attemptsMade || 0 }}</span>
                  <span v-if="job.timestamp">Created: {{ new Date(job.timestamp).toLocaleString() }}</span>
                  <span v-if="job.finishedOn">Failed: {{ new Date(job.finishedOn).toLocaleString() }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="bg-paper border border-grid-light p-8">
        <h2 class="text-sm font-normal text-ink-500 uppercase tracking-wider mb-6">Email Warmup Management</h2>
        <p class="text-sm text-ink-600 mb-8 leading-relaxed">
          Manage domain warmup schedules to safely increase sending capacity. Warmup protects your domain reputation by gradually increasing limits while monitoring bounce and complaint rates.
        </p>
        
        <!-- Sending Diagnostics -->
        <div class="mb-8 p-4 border border-grid-light bg-ink-50">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-sm font-medium text-ink-900">Sending Diagnostics</h3>
            <button
              @click="loadSendingDiagnostics"
              :disabled="diagnosticsLoading"
              class="text-xs text-ink-500 hover:text-ink-900 uppercase tracking-wider"
            >
              {{ diagnosticsLoading ? 'Loading...' : 'Refresh' }}
            </button>
          </div>
          
          <div v-if="diagnosticsLoading" class="text-xs text-ink-600 text-center py-4">
            Loading diagnostics...
          </div>
          
          <div v-else-if="!sendingDiagnostics" class="text-xs text-ink-500 text-center py-2">
            Diagnostics unavailable (check console for errors)
          </div>
          
          <div v-else-if="sendingDiagnostics" class="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p class="text-xs text-ink-500 uppercase tracking-wider mb-1">Sent This Hour</p>
              <p class="text-lg font-medium text-ink-900">
                {{ sendingDiagnostics.emails.sentLastHour }}
                <span class="text-xs text-ink-500">/ {{ sendingDiagnostics.warmup[0]?.warmup.hourlyLimit || 'N/A' }}</span>
              </p>
            </div>
            <div>
              <p class="text-xs text-ink-500 uppercase tracking-wider mb-1">Sent Today</p>
              <p class="text-lg font-medium text-ink-900">
                {{ sendingDiagnostics.emails.sentToday }}
                <span class="text-xs text-ink-500">/ {{ sendingDiagnostics.warmup[0]?.warmup.dailyLimit || 'N/A' }}</span>
              </p>
            </div>
            <div>
              <p class="text-xs text-ink-500 uppercase tracking-wider mb-1">Queue Status</p>
              <p class="text-lg font-medium text-ink-900">
                <span v-if="sendingDiagnostics.queue.emailQueue.waiting > 0" class="text-yellow-600">
                  {{ sendingDiagnostics.queue.emailQueue.waiting }} waiting
                </span>
                <span v-else-if="sendingDiagnostics.queue.emailQueue.delayed > 0" class="text-orange-600">
                  {{ sendingDiagnostics.queue.emailQueue.delayed }} delayed
                </span>
                <span v-else-if="sendingDiagnostics.queue.emailQueue.active > 0" class="text-blue-600">
                  {{ sendingDiagnostics.queue.emailQueue.active }} active
                </span>
                <span v-else class="text-green-600">Clear</span>
              </p>
            </div>
            <div>
              <p class="text-xs text-ink-500 uppercase tracking-wider mb-1">Rate Limit</p>
              <p class="text-lg font-medium" :class="sendingDiagnostics.warmup[0]?.rateLimit?.canSend ? 'text-green-600' : 'text-red-600'">
                {{ sendingDiagnostics.warmup[0]?.rateLimit?.currentCount || 0 }}
                <span class="text-xs text-ink-500">/ {{ sendingDiagnostics.warmup[0]?.rateLimit?.limit || 'N/A' }}</span>
              </p>
            </div>
          </div>
          
          <div v-if="sendingDiagnostics && sendingDiagnostics.summary" class="mt-4 pt-4 border-t border-grid-light">
            <div class="flex items-center space-x-4 text-xs">
              <div>
                <span class="text-ink-500">Expected Rate:</span>
                <span class="font-medium text-ink-900 ml-1">{{ sendingDiagnostics.summary.expectedHourlyRate || 'N/A' }}/hour</span>
              </div>
              <div>
                <span class="text-ink-500">Current Rate:</span>
                <span class="font-medium text-ink-900 ml-1">{{ sendingDiagnostics.summary.currentHourlyRate || 0 }}/hour</span>
              </div>
              <div v-if="sendingDiagnostics.summary.emailsDelayed > 0" class="text-orange-600">
                ⚠️ {{ sendingDiagnostics.summary.emailsDelayed }} emails delayed (waiting for limit reset)
              </div>
              <div v-if="sendingDiagnostics.summary.emailsWaiting > 0" class="text-yellow-600">
                ⏳ {{ sendingDiagnostics.summary.emailsWaiting }} emails waiting in queue
              </div>
            </div>
          </div>
        </div>
        
        <div class="space-y-4">
          <div class="flex items-center justify-between mb-4">
            <div>
              <p class="text-sm font-medium text-ink-900">
                Domains in Warmup: <span class="text-blue-600">{{ warmupSummary.domainsInWarmup }}</span> / {{ warmupSummary.totalDomains }}
              </p>
              <p class="text-xs text-ink-600 mt-1">
                Total Remaining Today: <span class="font-medium">{{ warmupSummary.totalRemainingToday }}</span> emails
              </p>
            </div>
            <button
              @click="loadWarmupStatus"
              :disabled="warmupLoading"
              class="btn btn-ghost"
            >
              {{ warmupLoading ? 'Loading...' : 'Refresh Status' }}
            </button>
          </div>

          <div v-if="warmupLoading" class="p-4 border border-grid-light text-center">
            <p class="text-sm text-ink-600">Loading warmup schedules...</p>
          </div>

          <div v-else-if="warmupSchedules.length === 0" class="p-4 border border-grid-light text-center">
            <p class="text-sm text-ink-600">No warmup schedules found. Warmup schedules are created automatically when you start sending emails.</p>
          </div>

          <div v-else class="space-y-6">
            <div
              v-for="schedule in warmupSchedules"
              :key="`${schedule.domain}-${schedule.provider}`"
              class="border border-grid-light p-6"
            >
              <div class="flex justify-between items-start mb-4">
                <div class="flex-1">
                  <div class="flex items-center space-x-3 mb-2">
                    <h3 class="text-sm font-medium text-ink-900">{{ schedule.domain }}</h3>
                    <span class="text-xs text-ink-500 uppercase tracking-wider">{{ schedule.provider }}</span>
                    <span 
                      v-if="schedule.inWarmup"
                      class="px-2 py-1 text-xs uppercase tracking-wider bg-blue-100 text-blue-800"
                    >
                      Phase {{ schedule.phase }}
                    </span>
                    <span 
                      v-else
                      class="px-2 py-1 text-xs uppercase tracking-wider bg-green-100 text-green-800"
                    >
                      Completed
                    </span>
                  </div>
                  
                  <div v-if="schedule.inWarmup" class="space-y-2 mt-3">
                    <div class="grid grid-cols-2 gap-4 text-xs">
                      <div>
                        <span class="text-ink-500">Daily Limit:</span>
                        <span class="ml-2 font-medium text-ink-900">{{ schedule.dailyLimit }}</span>
                      </div>
                      <div>
                        <span class="text-ink-500">Hourly Limit:</span>
                        <span class="ml-2 font-medium text-ink-900">{{ schedule.hourlyLimit }}</span>
                      </div>
                      <div>
                        <span class="text-ink-500">Sent Today:</span>
                        <span class="ml-2 font-medium text-ink-900">{{ schedule.currentCount }}</span>
                      </div>
                      <div>
                        <span class="text-ink-500">Remaining:</span>
                        <span class="ml-2 font-medium text-green-600">{{ schedule.remainingToday }}</span>
                      </div>
                    </div>
                    
                    <div v-if="schedule.startDate" class="text-xs text-ink-500 mt-2">
                      Started: {{ new Date(schedule.startDate).toLocaleDateString() }}
                    </div>
                  </div>
                  
                  <div v-else class="text-xs text-ink-600 mt-2">
                    Warmup completed. No restrictions active.
                  </div>
                </div>
              </div>

              <div v-if="schedule.inWarmup" class="mt-4 pt-4 border-t border-grid-light">
                <div class="flex flex-wrap gap-2">
                  <button
                    @click="fastTrackWarmup(schedule.domain, schedule.provider)"
                    :disabled="warmupActionLoading"
                    class="btn btn-primary text-xs"
                  >
                    Fast-Track to Phase 3 (500/day)
                  </button>
                  <button
                    @click="showIncreaseLimitModal(schedule)"
                    :disabled="warmupActionLoading"
                    class="btn text-xs"
                  >
                    Increase Limit
                  </button>
                  <button
                    @click="showTemporaryIncreaseModal(schedule)"
                    :disabled="warmupActionLoading"
                    class="btn text-xs"
                  >
                    Temporary Increase
                  </button>
                  <button
                    @click="completeWarmup(schedule.domain, schedule.provider)"
                    :disabled="warmupActionLoading"
                    class="btn text-xs bg-yellow-600 hover:bg-yellow-700"
                  >
                    Complete Warmup
                  </button>
                </div>
                <p class="text-xs text-ink-500 mt-3">
                  ⚠️ Warmup monitoring is active. Limits will auto-reduce if bounce/complaint rates exceed safe thresholds.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Increase Limit Modal -->
      <div v-if="showIncreaseModal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div class="bg-white p-8 max-w-md w-full mx-4">
          <h3 class="text-lg font-medium text-ink-900 mb-4">Increase Warmup Limit</h3>
          <p class="text-sm text-ink-600 mb-4">
            Set a new daily limit for <strong>{{ increaseModalSchedule?.domain }}</strong> ({{ increaseModalSchedule?.provider }}).
            Warmup monitoring will remain active.
          </p>
          <div class="space-y-4">
            <div>
              <label class="block text-xs font-normal text-ink-500 uppercase tracking-wider mb-2">
                Daily Limit (0-2000)
              </label>
              <input
                v-model.number="increaseLimitValue"
                type="number"
                min="0"
                max="2000"
                class="input w-full"
                placeholder="e.g., 500"
              />
            </div>
            <div class="flex space-x-3">
              <button
                @click="applyIncreaseLimit"
                :disabled="warmupActionLoading || !increaseLimitValue || increaseLimitValue < 0 || increaseLimitValue > 2000"
                class="btn btn-primary flex-1"
              >
                {{ warmupActionLoading ? 'Applying...' : 'Apply' }}
              </button>
              <button
                @click="showIncreaseModal = false"
                class="btn btn-ghost flex-1"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Temporary Increase Modal -->
      <div v-if="showTemporaryModal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div class="bg-white p-8 max-w-md w-full mx-4">
          <h3 class="text-lg font-medium text-ink-900 mb-4">Temporary Warmup Increase</h3>
          <p class="text-sm text-ink-600 mb-4">
            Set a temporary higher limit for <strong>{{ temporaryModalSchedule?.domain }}</strong> ({{ temporaryModalSchedule?.provider }}).
            The limit will automatically revert after the specified days.
          </p>
          <div class="space-y-4">
            <div>
              <label class="block text-xs font-normal text-ink-500 uppercase tracking-wider mb-2">
                Daily Limit (0-2000)
              </label>
              <input
                v-model.number="temporaryLimitValue"
                type="number"
                min="0"
                max="2000"
                class="input w-full"
                placeholder="e.g., 500"
              />
            </div>
            <div>
              <label class="block text-xs font-normal text-ink-500 uppercase tracking-wider mb-2">
                Revert After (days, 1-30)
              </label>
              <input
                v-model.number="temporaryDaysValue"
                type="number"
                min="1"
                max="30"
                class="input w-full"
                placeholder="7"
              />
            </div>
            <div class="flex space-x-3">
              <button
                @click="applyTemporaryIncrease"
                :disabled="warmupActionLoading || !temporaryLimitValue || !temporaryDaysValue"
                class="btn btn-primary flex-1"
              >
                {{ warmupActionLoading ? 'Applying...' : 'Apply' }}
              </button>
              <button
                @click="showTemporaryModal = false"
                class="btn btn-ghost flex-1"
              >
                Cancel
              </button>
            </div>
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
const failedJobs = ref<any[]>([])
const failedJobsLoading = ref(false)
const warmupSchedules = ref<any[]>([])
const warmupSummary = ref({
  totalDomains: 0,
  domainsInWarmup: 0,
  totalRemainingToday: 0,
})
const warmupLoading = ref(false)
const warmupActionLoading = ref(false)
const showIncreaseModal = ref(false)
const showTemporaryModal = ref(false)
const increaseModalSchedule = ref<any>(null)
const temporaryModalSchedule = ref<any>(null)
const increaseLimitValue = ref<number>(500)
const temporaryLimitValue = ref<number>(500)
const temporaryDaysValue = ref<number>(7)
const sendingDiagnostics = ref<any>(null)
const diagnosticsLoading = ref(false)

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

async function loadFailedJobs() {
  try {
    failedJobsLoading.value = true
    const response = await api.get('/admin/campaign-send/failed')
    failedJobs.value = response.data.jobs || []
  } catch (error: any) {
    console.error('Failed to load failed jobs:', error)
    const errorMessage = error.response?.data?.message || error.message || 'Failed to load failed jobs'
    alert(`Error: ${errorMessage}`)
  } finally {
    failedJobsLoading.value = false
  }
}

async function cleanFailedJobs() {
  if (!confirm(`Are you sure you want to remove all ${failedJobs.value.length} failed jobs? This will allow new campaigns with the same IDs to be sent.`)) {
    return
  }
  
  try {
    failedJobsLoading.value = true
    const response = await api.post('/admin/campaign-send/clean-failed')
    alert(`Successfully removed ${response.data.cleaned} failed jobs.`)
    await loadFailedJobs()
  } catch (error: any) {
    const errorMessage = error.response?.data?.message || error.message || 'Failed to clean failed jobs'
    alert(`Error: ${errorMessage}`)
    console.error('Failed to clean failed jobs:', error)
  } finally {
    failedJobsLoading.value = false
  }
}

async function loadWarmupStatus() {
  try {
    warmupLoading.value = true
    const response = await api.get('/admin/warmup/status')
    warmupSchedules.value = response.data.warmupSchedules || []
    warmupSummary.value = response.data.summary || {
      totalDomains: 0,
      domainsInWarmup: 0,
      totalRemainingToday: 0,
    }
  } catch (error: any) {
    console.error('Failed to load warmup status:', error)
    const errorMessage = error.response?.data?.message || error.message || 'Failed to load warmup status'
    alert(`Error: ${errorMessage}`)
  } finally {
    warmupLoading.value = false
  }
}

async function loadSendingDiagnostics() {
  try {
    diagnosticsLoading.value = true
    const response = await api.get('/admin/sending/diagnostics')
    sendingDiagnostics.value = response.data
  } catch (error: any) {
    // Don't alert - just log, diagnostics are nice-to-have
    console.error('Failed to load sending diagnostics:', error?.response?.data?.message || error?.message || error)
    // Set to null so UI doesn't try to render invalid data
    sendingDiagnostics.value = null
  } finally {
    diagnosticsLoading.value = false
  }
}

async function fastTrackWarmup(domain: string, provider: string) {
  if (!confirm(`Fast-track warmup for ${domain} (${provider}) to Phase 3 (500/day)? Warmup monitoring will remain active.`)) {
    return
  }
  
  try {
    warmupActionLoading.value = true
    const response = await api.post('/admin/warmup/fast-track', { domain, provider })
    alert(response.data.message || 'Warmup fast-tracked successfully')
    await loadWarmupStatus()
  } catch (error: any) {
    const errorMessage = error.response?.data?.message || error.message || 'Failed to fast-track warmup'
    alert(`Error: ${errorMessage}`)
    console.error('Failed to fast-track warmup:', error)
  } finally {
    warmupActionLoading.value = false
  }
}

function showIncreaseLimitModal(schedule: any) {
  increaseModalSchedule.value = schedule
  increaseLimitValue.value = schedule.dailyLimit || 500
  showIncreaseModal.value = true
}

function showTemporaryIncreaseModal(schedule: any) {
  temporaryModalSchedule.value = schedule
  temporaryLimitValue.value = schedule.dailyLimit || 500
  temporaryDaysValue.value = 7
  showTemporaryModal.value = true
}

async function applyIncreaseLimit() {
  if (!increaseModalSchedule.value) return
  
  const { domain, provider } = increaseModalSchedule.value
  if (!increaseLimitValue.value || increaseLimitValue.value < 0 || increaseLimitValue.value > 2000) {
    alert('Daily limit must be between 0 and 2000')
    return
  }
  
  try {
    warmupActionLoading.value = true
    const response = await api.post('/admin/warmup/increase-limit', {
      domain,
      provider,
      dailyLimit: increaseLimitValue.value,
    })
    alert(response.data.message || 'Warmup limit updated successfully')
    showIncreaseModal.value = false
    await loadWarmupStatus()
  } catch (error: any) {
    const errorMessage = error.response?.data?.message || error.message || 'Failed to update warmup limit'
    alert(`Error: ${errorMessage}`)
    console.error('Failed to update warmup limit:', error)
  } finally {
    warmupActionLoading.value = false
  }
}

async function applyTemporaryIncrease() {
  if (!temporaryModalSchedule.value) return
  
  const { domain, provider } = temporaryModalSchedule.value
  if (!temporaryLimitValue.value || temporaryLimitValue.value < 0 || temporaryLimitValue.value > 2000) {
    alert('Daily limit must be between 0 and 2000')
    return
  }
  if (!temporaryDaysValue.value || temporaryDaysValue.value < 1 || temporaryDaysValue.value > 30) {
    alert('Days must be between 1 and 30')
    return
  }
  
  try {
    warmupActionLoading.value = true
    const response = await api.post('/admin/warmup/increase-limit', {
      domain,
      provider,
      dailyLimit: temporaryLimitValue.value,
      temporary: true,
      revertAfterDays: temporaryDaysValue.value,
    })
    alert(response.data.message || 'Temporary warmup increase set successfully')
    showTemporaryModal.value = false
    await loadWarmupStatus()
  } catch (error: any) {
    const errorMessage = error.response?.data?.message || error.message || 'Failed to set temporary increase'
    alert(`Error: ${errorMessage}`)
    console.error('Failed to set temporary increase:', error)
  } finally {
    warmupActionLoading.value = false
  }
}

async function completeWarmup(domain: string, provider: string) {
  if (!confirm(`⚠️ WARNING: Completing warmup for ${domain} (${provider}) will remove ALL warmup protections.\n\nThis should only be done if your domain is well-established.\n\nAre you sure you want to continue?`)) {
    return
  }
  
  if (!confirm(`Final confirmation: Remove all warmup protections for ${domain}?`)) {
    return
  }
  
  try {
    warmupActionLoading.value = true
    const response = await api.post('/admin/warmup/complete', {
      domain,
      provider,
      confirm: true,
    })
    alert(response.data.message || 'Warmup completed successfully')
    await loadWarmupStatus()
  } catch (error: any) {
    const errorMessage = error.response?.data?.message || error.message || 'Failed to complete warmup'
    alert(`Error: ${errorMessage}`)
    console.error('Failed to complete warmup:', error)
  } finally {
    warmupActionLoading.value = false
  }
}

onMounted(() => {
  loadProviders()
  loadFooterSettings()
  checkQueueStatus()
  loadFailedJobs()
  loadWarmupStatus()
  loadSendingDiagnostics()
})
</script>

