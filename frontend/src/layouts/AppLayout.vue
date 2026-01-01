<template>
  <div class="min-h-screen bg-canvas relative z-10">
    <!-- Navigation - minimal, grid-aligned, mobile responsive -->
    <nav class="bg-paper border-b border-grid-medium">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="flex justify-between items-center h-16 sm:h-20">
          <div class="flex items-center space-x-8 sm:space-x-12 lg:space-x-16">
            <router-link to="/app" class="text-base sm:text-lg font-normal text-ink-900 tracking-wider">
              FOLLOWLY
            </router-link>
            <div class="hidden md:flex space-x-6 lg:space-x-8">
              <router-link
                v-for="item in navigation"
                :key="item.name"
                :to="item.to"
                class="nav-link"
                :class="{ active: isActiveRoute(item.to) }"
              >
                {{ item.name.toUpperCase() }}
              </router-link>
            </div>
          </div>
          <div class="flex items-center space-x-6 lg:space-x-8">
            <!-- User menu - minimal hover dropdown -->
            <div class="relative group">
              <button class="nav-link text-xs uppercase tracking-wider focus:outline-none border-b-2 border-transparent hover:border-ink-400">
                Account
              </button>
              <!-- Dropdown on hover - Agnes Martin style -->
              <div class="absolute right-0 top-full mt-2 bg-paper border border-grid-medium opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 min-w-[240px]">
                <div class="p-6 border-b border-grid-light">
                  <p class="text-xs text-ink-500 uppercase tracking-wider mb-3">Signed in as</p>
                  <p class="text-sm text-ink-900 break-words leading-relaxed" :title="authStore.user?.email">
                    {{ authStore.user?.email }}
                  </p>
                </div>
                <div class="p-4">
                  <button 
                    @click="handleLogout" 
                    class="w-full text-left text-xs text-ink-600 hover:text-ink-900 uppercase tracking-wider py-2 transition-colors"
                  >
                    Logout
                  </button>
                </div>
              </div>
            </div>
            <!-- Mobile menu button -->
            <button
              @click="mobileMenuOpen = !mobileMenuOpen"
              class="md:hidden btn btn-ghost text-xs px-3"
            >
              MENU
            </button>
          </div>
        </div>
        <!-- Mobile menu - Agnes Martin grid style -->
        <div
          v-if="mobileMenuOpen"
          class="md:hidden border-t border-grid-medium py-4 space-y-2"
        >
          <router-link
            v-for="item in navigation"
            :key="item.name"
            :to="item.to"
            @click="mobileMenuOpen = false"
            class="block nav-link border-l-2 border-transparent pl-4"
            :class="{ 'border-ink-900 text-ink-900': isActiveRoute(item.to) }"
          >
            {{ item.name.toUpperCase() }}
          </router-link>
        </div>
      </div>
    </nav>

    <!-- Main content - generous spacing, mobile responsive -->
    <main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 lg:py-16">
      <router-view />
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useRouter, useRoute } from 'vue-router'

const authStore = useAuthStore()
const router = useRouter()
const route = useRoute()
const mobileMenuOpen = ref(false)

const navigation = [
  { name: 'Dashboard', to: '/app' },
  { name: 'Contacts', to: '/app/contacts' },
  { name: 'Lists', to: '/app/lists' },
  { name: 'Campaigns', to: '/app/campaigns' },
  // { name: 'Automations', to: '/app/automations' }, // DISABLED: Temporarily commented out
  { name: 'Analytics', to: '/app/analytics' },
  { name: 'Settings', to: '/app/settings' },
]

function isActiveRoute(routePath: string): boolean {
  const currentPath = route.path
  
  // Dashboard should only be active when path is exactly /app or /app/
  if (routePath === '/app') {
    return currentPath === '/app' || currentPath === '/app/'
  }
  
  // For other routes, check if path starts with the route path
  return currentPath.startsWith(routePath)
}

function handleLogout() {
  authStore.logout()
  router.push('/login')
}
</script>

