<template>
  <div class="min-h-screen bg-canvas relative z-10">
    <!-- Navigation - minimal, mobile responsive -->
    <nav class="bg-paper border-b border-grid-medium">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="flex justify-between items-center h-16 sm:h-20">
          <span class="text-base sm:text-lg font-normal text-ink-900 tracking-wider">FOLLOWLY</span>
          <div class="flex items-center space-x-4 sm:space-x-6">
            <router-link to="/login" class="text-xs text-ink-600 tracking-wider uppercase hidden sm:inline">Login</router-link>
            <router-link to="/register" class="btn btn-primary text-xs px-4 sm:px-6">Get Started</router-link>
          </div>
        </div>
      </div>
    </nav>

    <!-- Hero - generous spacing, minimal, mobile responsive -->
    <section class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24 lg:py-32">
      <div class="text-center">
        <h1 class="text-3xl sm:text-4xl lg:text-5xl font-light text-ink-900 mb-6 sm:mb-8 tracking-wide leading-tight">
          Email Automation<br class="hidden sm:block" />That Scales Safely
        </h1>
        <p class="text-base sm:text-lg text-ink-600 mb-8 sm:mb-12 max-w-xl mx-auto leading-relaxed px-4">
          Send more emails without breaking your domain. Smart routing, automatic warmup, 
          and lifecycle-focused automation that protects your reputation.
        </p>
        <div class="flex justify-center">
          <router-link to="/register" class="btn btn-primary">
            Start Now
          </router-link>
        </div>
      </div>
    </section>
    
    <!-- Grid line separator -->
    <div class="grid-line"></div>

    <!-- Problem - grid structure, mobile responsive -->
    <section class="bg-paper py-16 sm:py-24 lg:py-32">
      <div class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 class="text-xl sm:text-2xl font-light text-ink-900 mb-12 sm:mb-16 text-center tracking-wide">
          The Problem
        </h2>
        <!-- Agnes Martin grid composition - responsive -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-8 sm:gap-12">
          <div class="border-l-2 border-ink-900 pl-4 sm:pl-6">
            <h3 class="text-xs sm:text-sm font-normal text-ink-500 uppercase tracking-wider mb-3 sm:mb-4">Domain Reputation Risk</h3>
            <p class="text-sm sm:text-base text-ink-700 leading-relaxed">
              One wrong send can tank your deliverability. Most tools don't protect you from yourself.
            </p>
          </div>
          <div class="border-l-2 border-ink-900 pl-4 sm:pl-6 md:border-l-0 md:border-t-2 md:pl-0 md:pt-4 md:mt-0">
            <h3 class="text-xs sm:text-sm font-normal text-ink-500 uppercase tracking-wider mb-3 sm:mb-4">Hitting Send Limits</h3>
            <p class="text-sm sm:text-base text-ink-700 leading-relaxed">
              Provider caps stop you mid-campaign. You're stuck waiting or paying premium rates.
            </p>
          </div>
          <div class="border-l-2 border-ink-900 pl-4 sm:pl-6 md:border-l-0 md:border-t-2 md:pl-0 md:pt-4 md:mt-0">
            <h3 class="text-xs sm:text-sm font-normal text-ink-500 uppercase tracking-wider mb-3 sm:mb-4">Complex Setup</h3>
            <p class="text-sm sm:text-base text-ink-700 leading-relaxed">
              Hours spent configuring. Features you'll never use. All you want is to send emails that work.
            </p>
          </div>
        </div>
      </div>
    </section>
    
    <div class="grid-line"></div>

    <!-- Solution - same grid structure, mobile responsive -->
    <section class="bg-canvas py-16 sm:py-24 lg:py-32">
      <div class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 class="text-xl sm:text-2xl font-light text-ink-900 mb-12 sm:mb-16 text-center tracking-wide">
          The Solution
        </h2>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-8 sm:gap-12">
          <div class="border-l-2 border-ink-900 pl-4 sm:pl-6">
            <h3 class="text-xs sm:text-sm font-normal text-ink-500 uppercase tracking-wider mb-3 sm:mb-4">Protected Sending</h3>
            <p class="text-sm sm:text-base text-ink-700 leading-relaxed">
              Automatic domain warmup prevents reputation damage. We monitor and adjust 
              so you never send too fast.
            </p>
          </div>
          <div class="border-l-2 border-ink-900 pl-4 sm:pl-6 md:border-l-0 md:border-t-2 md:pl-0 md:pt-4 md:mt-0">
            <h3 class="text-xs sm:text-sm font-normal text-ink-500 uppercase tracking-wider mb-3 sm:mb-4">No More Limits</h3>
            <p class="text-sm sm:text-base text-ink-700 leading-relaxed">
              Intelligent routing across multiple providers. When one hits capacity, 
              we seamlessly switch. Your emails always send.
            </p>
          </div>
          <div class="border-l-2 border-ink-900 pl-4 sm:pl-6 md:border-l-0 md:border-t-2 md:pl-0 md:pt-4 md:mt-0">
            <h3 class="text-xs sm:text-sm font-normal text-ink-500 uppercase tracking-wider mb-3 sm:mb-4">Simple Setup</h3>
            <p class="text-sm sm:text-base text-ink-700 leading-relaxed">
              Import your contacts, create your first campaign, send in minutes. 
              No complex configuration. Just results.
            </p>
          </div>
        </div>
      </div>
    </section>
    
    <div class="grid-line"></div>

    <!-- How It Works - minimal numbers, mobile responsive -->
    <section class="bg-paper py-16 sm:py-24 lg:py-32">
      <div class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 class="text-xl sm:text-2xl font-light text-ink-900 mb-12 sm:mb-16 text-center tracking-wide">
          How It Works
        </h2>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-8 sm:gap-12">
          <div class="border-l-2 border-ink-900 pl-4 sm:pl-6">
            <div class="text-ink-900 text-3xl sm:text-4xl font-light mb-4 sm:mb-6">01</div>
            <h3 class="text-xs sm:text-sm font-normal text-ink-500 uppercase tracking-wider mb-3 sm:mb-4">Import Your Contacts</h3>
            <p class="text-sm sm:text-base text-ink-700 leading-relaxed">
              Upload CSV or connect your data. Organize with lists and segments. 
              Ready in minutes.
            </p>
          </div>
          <div class="border-l-2 border-ink-900 pl-4 sm:pl-6 md:border-l-0 md:border-t-2 md:pl-0 md:pt-4 md:mt-0">
            <div class="text-ink-900 text-3xl sm:text-4xl font-light mb-4 sm:mb-6">02</div>
            <h3 class="text-xs sm:text-sm font-normal text-ink-500 uppercase tracking-wider mb-3 sm:mb-4">Create Your Campaign</h3>
            <p class="text-sm sm:text-base text-ink-700 leading-relaxed">
              Write your email, personalize with variables, schedule or send now. 
              Simple editor, powerful results.
            </p>
          </div>
          <div class="border-l-2 border-ink-900 pl-4 sm:pl-6 md:border-l-0 md:border-t-2 md:pl-0 md:pt-4 md:mt-0">
            <div class="text-ink-900 text-3xl sm:text-4xl font-light mb-4 sm:mb-6">03</div>
            <h3 class="text-xs sm:text-sm font-normal text-ink-500 uppercase tracking-wider mb-3 sm:mb-4">We Handle The Rest</h3>
            <p class="text-sm sm:text-base text-ink-700 leading-relaxed">
              Automatic routing, warmup protection, compliance, and delivery tracking. 
              You focus on your message.
            </p>
          </div>
        </div>
      </div>
    </section>
    
    <div class="grid-line"></div>

    <!-- Trust - minimal, mobile responsive -->
    <section class="bg-canvas py-16 sm:py-24 lg:py-32">
      <div class="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <h2 class="text-xl sm:text-2xl font-light text-ink-900 mb-6 sm:mb-8 tracking-wide">
          Built For Safety
        </h2>
        <p class="text-base sm:text-lg text-ink-600 leading-relaxed">
          Every email is compliant. Every send is protected. We monitor your domain health 
          and adjust automatically. No surprises, no reputation damage.
        </p>
      </div>
    </section>
    
    <div class="grid-line"></div>

    <!-- CTA - minimal, no bright colors, mobile responsive -->
    <section class="bg-ink-900 py-16 sm:py-20 lg:py-24">
      <div class="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <h2 class="text-xl sm:text-2xl font-light text-paper mb-4 sm:mb-6 tracking-wide">
          Start Sending Safely Today
        </h2>
        <p class="text-sm sm:text-base text-ink-300 mb-8 sm:mb-10">
          Create your account and send your first campaign in minutes. 
          No credit card required.
        </p>
        <router-link to="/register" class="btn bg-paper text-ink-900 border-paper">
          Get Started
        </router-link>
      </div>
    </section>

    <!-- Footer - minimal grid, mobile responsive -->
    <footer class="bg-paper border-t border-grid-medium py-12 sm:py-16">
      <div class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="grid grid-cols-2 md:grid-cols-4 gap-8 sm:gap-12">
          <div class="col-span-2 md:col-span-1">
            <h3 class="text-xs font-normal text-ink-500 uppercase tracking-wider mb-3 sm:mb-4">Followly</h3>
            <p class="text-xs sm:text-sm text-ink-600 leading-relaxed">
              Email automation that scales safely.
            </p>
          </div>
          <div>
            <h3 class="text-xs font-normal text-ink-500 uppercase tracking-wider mb-3 sm:mb-4">Product</h3>
            <ul class="space-y-2 text-xs sm:text-sm text-ink-600">
              <li><a href="#" class="hover:text-ink-900">Features</a></li>
              <li><a href="#" class="hover:text-ink-900">Pricing</a></li>
            </ul>
          </div>
          <div>
            <h3 class="text-xs font-normal text-ink-500 uppercase tracking-wider mb-3 sm:mb-4">Resources</h3>
            <ul class="space-y-2 text-xs sm:text-sm text-ink-600">
              <li><a href="#" class="hover:text-ink-900">Documentation</a></li>
              <li><a href="#" class="hover:text-ink-900">Compliance</a></li>
            </ul>
          </div>
          <div>
            <h3 class="text-xs font-normal text-ink-500 uppercase tracking-wider mb-3 sm:mb-4">Legal</h3>
            <ul class="space-y-2 text-xs sm:text-sm text-ink-600">
              <li><a href="#" class="hover:text-ink-900">Privacy</a></li>
              <li><a href="#" class="hover:text-ink-900">Terms</a></li>
            </ul>
          </div>
        </div>
        <div class="mt-8 sm:mt-12 pt-6 sm:pt-8 border-t border-grid-light text-center text-xs text-ink-500 tracking-wider">
          <p>&copy; 2024 FOLLOWLY. ALL RIGHTS RESERVED.</p>
        </div>
      </div>
    </footer>
  </div>
</template>

<script setup lang="ts">
// Landing page component
</script>

