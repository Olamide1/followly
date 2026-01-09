import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'landing',
      component: () => import('@/views/LandingPage.vue'),
    },
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/Login.vue'),
    },
    {
      path: '/register',
      name: 'register',
      component: () => import('@/views/Register.vue'),
    },
    {
      path: '/unsubscribe',
      name: 'unsubscribe',
      component: () => import('@/views/Unsubscribe.vue'),
      meta: { requiresAuth: false },
    },
    {
      path: '/preferences',
      name: 'preferences',
      component: () => import('@/views/Preferences.vue'),
      meta: { requiresAuth: false },
    },
    {
      path: '/app',
      component: () => import('@/layouts/AppLayout.vue'),
      meta: { requiresAuth: true },
      children: [
        {
          path: '',
          name: 'dashboard',
          component: () => import('@/views/Dashboard.vue'),
        },
        {
          path: 'contacts',
          name: 'contacts',
          component: () => import('@/views/Contacts.vue'),
        },
        {
          path: 'contacts/new',
          name: 'contact-new',
          component: () => import('@/views/ContactForm.vue'),
        },
        {
          path: 'contacts/:id',
          name: 'contact-edit',
          component: () => import('@/views/ContactForm.vue'),
        },
        {
          path: 'lists',
          name: 'lists',
          component: () => import('@/views/Lists.vue'),
        },
        {
          path: 'lists/new',
          name: 'list-new',
          component: () => import('@/views/ListForm.vue'),
        },
        {
          path: 'lists/:id',
          name: 'list-edit',
          component: () => import('@/views/ListForm.vue'),
        },
        {
          path: 'campaigns',
          name: 'campaigns',
          component: () => import('@/views/Campaigns.vue'),
        },
        {
          path: 'campaigns/new',
          name: 'campaign-new',
          component: () => import('@/views/CampaignForm.vue'),
        },
        {
          path: 'campaigns/:id',
          name: 'campaign-edit',
          component: () => import('@/views/CampaignForm.vue'),
        },
        // DISABLED: Temporarily commented out
        // {
        //   path: 'automations',
        //   name: 'automations',
        //   component: () => import('@/views/Automations.vue'),
        // },
        // {
        //   path: 'automations/new',
        //   name: 'automation-new',
        //   component: () => import('@/views/AutomationForm.vue'),
        // },
        // {
        //   path: 'automations/:id',
        //   name: 'automation-edit',
        //   component: () => import('@/views/AutomationForm.vue'),
        // },
        {
          path: 'analytics',
          name: 'analytics',
          component: () => import('@/views/Analytics.vue'),
        },
        {
          path: 'settings',
          name: 'settings',
          component: () => import('@/views/Settings.vue'),
        },
      ],
    },
  ],
})

router.beforeEach(async (to, _from, next) => {
  const authStore = useAuthStore()
  
  // Always sync token from localStorage first to ensure we have the latest value
  const tokenFromStorage = authStore.syncToken()
  
  // If we have a token but no user data, initialize auth first
  // This ensures user data is loaded before checking auth state
  if (tokenFromStorage && !authStore.user && !authStore.isLoading) {
    try {
      await authStore.initializeAuth()
    } catch (error) {
      // Token might be invalid, but don't block navigation
      // The auth check below will handle redirecting if needed
    }
  }
  
  // Wait for auth initialization to complete if it's in progress
  if (authStore.isLoading) {
    // Wait a bit for auth to initialize (max 2 seconds)
    let attempts = 0
    while (authStore.isLoading && attempts < 20) {
      await new Promise(resolve => setTimeout(resolve, 100))
      attempts++
    }
  }
  
  // Check authentication after initialization
  // Use token from storage for the check to ensure accuracy
  const hasToken = !!localStorage.getItem('token')
  if (to.meta.requiresAuth && !hasToken) {
    next({ name: 'login' })
  } else if ((to.name === 'login' || to.name === 'register') && hasToken) {
    next({ name: 'dashboard' })
  } else {
    next()
  }
})

export default router

