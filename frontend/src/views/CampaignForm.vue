<template>
  <div>
    <div class="page-header">
      <h1 class="page-title">{{ isEdit ? 'Edit Campaign' : 'Create Campaign' }}</h1>
    </div>

    <div class="card max-w-4xl">
      <form @submit.prevent="handleSubmit" class="space-y-6 sm:space-y-8">
        <div>
          <label for="name" class="block text-xs font-normal text-ink-500 uppercase tracking-wider mb-3">
            Campaign Name *
          </label>
          <input id="name" v-model="form.name" type="text" required class="input" />
        </div>

        <div>
          <label for="type" class="block text-xs font-normal text-ink-500 uppercase tracking-wider mb-3">
            Type *
          </label>
          <select id="type" v-model="form.type" required class="input">
            <option value="broadcast">Broadcast</option>
            <option value="lifecycle">Lifecycle Sequence</option>
          </select>
        </div>

        <div>
          <label for="list_id" class="block text-xs font-normal text-ink-500 uppercase tracking-wider mb-3">
            List *
          </label>
          <select id="list_id" v-model="form.list_id" required class="input">
            <option value="">Select a list</option>
            <option v-for="list in lists" :key="list.id" :value="list.id">
              {{ list.name }}
            </option>
          </select>
        </div>

        <div>
          <label for="subject" class="block text-xs font-normal text-ink-500 uppercase tracking-wider mb-3">
            Subject *
          </label>
          <input
            id="subject"
            v-model="form.subject"
            type="text"
            required
            class="input"
            placeholder="Hello {{ name }}"
          />
        </div>

        <div>
          <label for="content" class="block text-xs font-normal text-ink-500 uppercase tracking-wider mb-3">
            Email Content *
          </label>
          
          <!-- Editor Toolbar -->
          <div class="mb-2 space-y-2">
            <!-- Formatting Row 1 -->
            <div class="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                @click="wrapSelection('strong', '</strong>')"
                class="text-xs px-3 py-1.5 border border-grid-medium bg-paper text-ink-700 hover:bg-ink-900 hover:text-paper hover:border-ink-900 uppercase tracking-wider transition-all"
                title="Bold"
              >
                Bold
              </button>
              <button
                type="button"
                @click="wrapSelection('em', '</em>')"
                class="text-xs px-3 py-1.5 border border-grid-medium bg-paper text-ink-700 hover:bg-ink-900 hover:text-paper hover:border-ink-900 uppercase tracking-wider transition-all"
                title="Italic"
              >
                Italic
              </button>
              <button
                type="button"
                @click="insertHeading(1)"
                class="text-xs px-3 py-1.5 border border-grid-medium bg-paper text-ink-700 hover:bg-ink-900 hover:text-paper hover:border-ink-900 uppercase tracking-wider transition-all"
                title="Heading 1"
              >
                H1
              </button>
              <button
                type="button"
                @click="insertHeading(2)"
                class="text-xs px-3 py-1.5 border border-grid-medium bg-paper text-ink-700 hover:bg-ink-900 hover:text-paper hover:border-ink-900 uppercase tracking-wider transition-all"
                title="Heading 2"
              >
                H2
              </button>
              <button
                type="button"
                @click="insertHeading(3)"
                class="text-xs px-3 py-1.5 border border-grid-medium bg-paper text-ink-700 hover:bg-ink-900 hover:text-paper hover:border-ink-900 uppercase tracking-wider transition-all"
                title="Heading 3"
              >
                H3
              </button>
            </div>
            
            <!-- Formatting Row 2 -->
            <div class="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                @click="insertList('ul')"
                class="text-xs px-3 py-1.5 border border-grid-medium bg-paper text-ink-700 hover:bg-ink-900 hover:text-paper hover:border-ink-900 uppercase tracking-wider transition-all"
                title="Bullet List"
              >
                Bullet List
              </button>
              <button
                type="button"
                @click="insertList('ol')"
                class="text-xs px-3 py-1.5 border border-grid-medium bg-paper text-ink-700 hover:bg-ink-900 hover:text-paper hover:border-ink-900 uppercase tracking-wider transition-all"
                title="Numbered List"
              >
                Numbered List
              </button>
              <button
                type="button"
                @click="insertLink"
                class="text-xs px-3 py-1.5 border border-grid-medium bg-paper text-ink-700 hover:bg-ink-900 hover:text-paper hover:border-ink-900 uppercase tracking-wider transition-all"
                title="Insert Link"
              >
                Insert Link
              </button>
              <button
                type="button"
                @click="insertImage"
                class="text-xs px-3 py-1.5 border border-grid-medium bg-paper text-ink-700 hover:bg-ink-900 hover:text-paper hover:border-ink-900 uppercase tracking-wider transition-all"
                title="Insert Image"
              >
                Insert Image
              </button>
              <button
                type="button"
              @click="togglePreview"
              class="text-xs px-3 py-1.5 border border-grid-medium bg-paper text-ink-700 hover:bg-ink-900 hover:text-paper hover:border-ink-900 uppercase tracking-wider transition-all"
            >
              {{ showPreview ? 'Hide Preview' : 'Show Preview' }}
            </button>
            </div>
          </div>

          <!-- WYSIWYG Editor -->
          <div v-if="!showPreview" class="relative">
            <div
              ref="editorDiv"
              contenteditable="true"
              @input="updateContentFromEditor"
              @paste="handlePaste"
              @blur="updateContentFromEditor"
              class="wysiwyg-editor input min-h-[300px] p-4 text-sm font-normal focus:outline-none focus:ring-1 focus:ring-ink-900"
              style="font-family: inherit;"
            ></div>
            <!-- Hidden input to store HTML for form submission -->
            <input
              type="hidden"
              v-model="form.content"
              required
            />
          </div>

          <!-- Preview -->
          <div v-else class="border border-grid-light bg-paper p-6 min-h-[300px]">
            <div class="text-xs text-ink-500 uppercase tracking-wider mb-4">Preview</div>
            <div 
              class="email-preview"
              v-html="previewContent"
            ></div>
          </div>

          <p class="mt-3 text-xs text-ink-600" v-pre>
            Use {{name}}, {{company}}, {{email}} for personalization. HTML is supported.
          </p>
        </div>

        <div>
          <label for="from_email" class="block text-xs font-normal text-ink-500 uppercase tracking-wider mb-3">
            From Email
          </label>
          <input id="from_email" v-model="form.from_email" type="email" class="input" />
        </div>

        <div>
          <label for="from_name" class="block text-xs font-normal text-ink-500 uppercase tracking-wider mb-3">
            From Name
          </label>
          <input id="from_name" v-model="form.from_name" type="text" class="input" />
        </div>

        <div v-if="error" class="text-ink-700 text-sm border-l-2 border-ink-900 pl-4">
          {{ error }}
        </div>

        <div class="flex flex-col sm:flex-row justify-end space-y-3 sm:space-y-0 sm:space-x-3 pt-4">
          <router-link to="/app/campaigns" class="btn w-full sm:w-auto text-center">Cancel</router-link>
          <button type="submit" :disabled="loading" class="btn btn-primary w-full sm:w-auto">
            {{ loading ? 'SAVING...' : 'SAVE' }}
          </button>
        </div>
      </form>
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
const lists = ref<any[]>([])
const showPreview = ref(false)
const editorDiv = ref<HTMLElement | null>(null)
const isUpdatingFromWatch = ref(false)

const previewContent = computed(() => {
  // When showing preview, get the latest content from editor
  if (showPreview.value && editorDiv.value) {
    const editorContent = editorContentToHtml()
    if (editorContent && editorContent.trim()) {
      return editorContent
    }
  }
  // Fallback to form content
  return form.value.content || '<p class="text-ink-500 italic">No content to preview</p>'
})

const form = ref({
  name: '',
  type: 'broadcast',
  subject: '',
  content: '',
  list_id: '',
  from_email: '',
  from_name: '',
})

// Convert editor content to HTML
function editorContentToHtml(): string {
  const editor = editorDiv.value
  if (!editor) return ''
  try {
    let html = editor.innerHTML.trim()
    // Clean up empty content
    if (!html || html === '<br>' || html === '<br/>' || html === '<p></p>' || html === '<div></div>') {
      return ''
    }
    // Ensure we have valid HTML structure
    return html
  } catch (error) {
    console.error('Error converting editor content to HTML:', error)
    return form.value.content || ''
  }
}

// Update form.content from editor
function updateContentFromEditor() {
  if (editorDiv.value && !isUpdatingFromWatch.value) {
    try {
      isUpdatingFromWatch.value = true
      const html = editorContentToHtml()
      // Only update if content actually changed
      if (html !== form.value.content) {
        form.value.content = html
      }
    } catch (error) {
      console.error('Error updating content from editor:', error)
    } finally {
      // Reset flag after a brief delay to allow watch to process
      setTimeout(() => {
        isUpdatingFromWatch.value = false
      }, 10)
    }
  }
}

// Sanitize HTML for email compatibility
function sanitizeHtml(html: string): string {
  // Create a temporary div to parse and clean HTML
  const tempDiv = document.createElement('div')
  tempDiv.innerHTML = html

  // Remove dangerous elements
  const dangerousElements = tempDiv.querySelectorAll('script, style, iframe, object, embed, form, input, button')
  dangerousElements.forEach(el => el.remove())

  // Remove dangerous attributes but keep safe ones
  const allElements = tempDiv.querySelectorAll('*')
  allElements.forEach(el => {
    // Remove event handlers (onclick, onerror, etc.)
    Array.from(el.attributes).forEach(attr => {
      if (attr.name.startsWith('on')) {
        el.removeAttribute(attr.name)
      }
    })

    // Keep safe attributes, remove others
    const safeAttrs = ['href', 'src', 'alt', 'title', 'width', 'height', 'class', 'id', 'style']
    const attributes = Array.from(el.attributes)
    attributes.forEach(attr => {
      if (!safeAttrs.includes(attr.name.toLowerCase())) {
        el.removeAttribute(attr.name)
      }
    })
  })

  // Clean up inline styles - keep only email-safe styles
  allElements.forEach(el => {
    if (el instanceof HTMLElement && el.style) {
      const allowedStyles: string[] = []
      const style = el.style

      // Keep font-weight for bold
      if (style.fontWeight && (style.fontWeight === 'bold' || parseInt(style.fontWeight) >= 700)) {
        allowedStyles.push('font-weight: bold')
      }

      // Keep font-style for italic
      if (style.fontStyle === 'italic') {
        allowedStyles.push('font-style: italic')
      }

      // Keep text-decoration for underline
      if (style.textDecoration && style.textDecoration.includes('underline')) {
        allowedStyles.push('text-decoration: underline')
      }

      // Keep color (for links and text)
      if (style.color) {
        allowedStyles.push(`color: ${style.color}`)
      }

      // Keep background-color (for highlighting)
      if (style.backgroundColor && style.backgroundColor !== 'transparent') {
        allowedStyles.push(`background-color: ${style.backgroundColor}`)
      }

      // Keep text-align
      if (style.textAlign) {
        allowedStyles.push(`text-align: ${style.textAlign}`)
      }

      // Keep font-size (for headings and emphasis)
      if (style.fontSize) {
        allowedStyles.push(`font-size: ${style.fontSize}`)
      }

      // Keep margin and padding (for spacing)
      if (style.margin) {
        allowedStyles.push(`margin: ${style.margin}`)
      }
      if (style.padding) {
        allowedStyles.push(`padding: ${style.padding}`)
      }

      // Apply only allowed styles
      if (allowedStyles.length > 0) {
        el.setAttribute('style', allowedStyles.join('; '))
      } else {
        el.removeAttribute('style')
      }
    }
  })

  return tempDiv.innerHTML
}

// Handle paste events - preserve formatting
function handlePaste(e: ClipboardEvent) {
  e.preventDefault()
  
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return

  const range = selection.getRangeAt(0)
  range.deleteContents()

  // Try to get HTML first (preserves formatting)
  let html = e.clipboardData?.getData('text/html') || ''
  const plainText = e.clipboardData?.getData('text/plain') || ''

  if (html && html.trim()) {
    // Sanitize the HTML to remove dangerous content
    html = sanitizeHtml(html)
    
    // Create a temporary container to parse the HTML
    const tempDiv = document.createElement('div')
    tempDiv.innerHTML = html

    // Convert to document fragment for safe insertion
    const fragment = document.createDocumentFragment()
    while (tempDiv.firstChild) {
      fragment.appendChild(tempDiv.firstChild)
    }

    // Insert the fragment
    range.insertNode(fragment)

    // Move cursor to end of inserted content
    range.setStartAfter(fragment.lastChild || fragment)
    range.collapse(false)
    selection.removeAllRanges()
    selection.addRange(range)
  } else if (plainText) {
    // Fallback to plain text if no HTML available
    // Preserve line breaks by converting \n to paragraphs
    const lines = plainText.split('\n')
    if (lines.length > 1) {
      // Multiple lines - create paragraphs
      const textFragment = document.createDocumentFragment()
      lines.forEach((line) => {
        const p = document.createElement('p')
        p.textContent = line.trim() || '\u00A0' // Non-breaking space for empty lines
        textFragment.appendChild(p)
      })
      range.insertNode(textFragment)
      // Move cursor to end of last paragraph
      const lastP = textFragment.querySelector('p:last-child')
      if (lastP) {
        const newRange = document.createRange()
        newRange.setStartAfter(lastP)
        newRange.collapse(true)
        selection.removeAllRanges()
        selection.addRange(newRange)
      } else {
        range.collapse(false)
        selection.removeAllRanges()
        selection.addRange(range)
      }
    } else {
      // Single line - just insert text
      range.insertNode(document.createTextNode(plainText))
      range.collapse(false)
      selection.removeAllRanges()
      selection.addRange(range)
    }
  }
  
  updateContentFromEditor()
}

// Execute command on editor
function execCommand(command: string, value?: string) {
  document.execCommand(command, false, value)
  updateContentFromEditor()
  if (editorDiv.value) {
    editorDiv.value.focus()
  }
}


function insertLink() {
  const editor = editorDiv.value
  if (!editor) return

  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return

  const range = selection.getRangeAt(0)
  const selectedText = selection.toString()

  // If text is selected, use it as link text
  if (selectedText && selectedText.trim()) {
    const url = prompt('Enter the URL for the link:', 'https://')
    if (!url || url === 'https://') return
    
    // Create link element
    const link = document.createElement('a')
    link.href = url
    link.textContent = selectedText.trim()
    link.style.color = '#000'
    link.style.textDecoration = 'underline'
    
    range.deleteContents()
    range.insertNode(link)
    updateContentFromEditor()
  } else {
    // No text selected - prompt for both URL and link text
    const url = prompt('Enter the URL for the link:', 'https://')
    if (!url || url === 'https://') return

    const linkText = prompt('Enter the text to display for the link:')
    if (!linkText || !linkText.trim()) {
      alert('Link text is required. Please enter text to display for the link.')
      return
    }

    // Create link element
    const link = document.createElement('a')
    link.href = url
    link.textContent = linkText.trim()
    link.style.color = '#000'
    link.style.textDecoration = 'underline'
    
    range.insertNode(link)
    // Move cursor after link
    range.setStartAfter(link)
    range.collapse(true)
    selection.removeAllRanges()
    selection.addRange(range)
    updateContentFromEditor()
  }
}

function insertImage() {
  const editor = editorDiv.value
  if (!editor) return

  const imageUrl = prompt('Enter the image URL:')
  if (!imageUrl) return

  const altText = prompt('Enter alt text for the image (optional):') || ''
  const widthInput = prompt('Enter image width in pixels (optional, e.g., 600):') || ''
  const width = widthInput ? parseInt(widthInput, 10) : undefined
  
  const selection = window.getSelection()
  if (selection && selection.rangeCount > 0) {
    const range = selection.getRangeAt(0)
    const img = document.createElement('img')
    img.src = imageUrl
    if (altText) img.alt = altText
    if (width && !isNaN(width)) {
      img.setAttribute('width', width.toString())
    }
    img.style.maxWidth = '100%'
    img.style.height = 'auto'
    img.style.display = 'block'
    img.style.marginTop = '1rem'
    img.style.marginBottom = '1rem'
    
    range.insertNode(img)
    // Move cursor after image
    range.setStartAfter(img)
    range.collapse(true)
    selection.removeAllRanges()
    selection.addRange(range)
    updateContentFromEditor()
  } else {
    // No selection, insert at end
    const img = document.createElement('img')
    img.src = imageUrl
    if (altText) img.alt = altText
    if (width && !isNaN(width)) {
      img.setAttribute('width', width.toString())
    }
    img.style.maxWidth = '100%'
    img.style.height = 'auto'
    img.style.display = 'block'
    img.style.marginTop = '1rem'
    img.style.marginBottom = '1rem'
    editor.appendChild(img)
    updateContentFromEditor()
  }
}

function togglePreview() {
  // Save content before switching to preview
  if (!showPreview.value && editorDiv.value) {
    // Force update content from editor immediately
    try {
      const html = editorContentToHtml()
      if (html || html === '') {
        isUpdatingFromWatch.value = true
        form.value.content = html
        // Small delay to ensure content is saved
        setTimeout(() => {
          isUpdatingFromWatch.value = false
          showPreview.value = true
        }, 100)
      } else {
        showPreview.value = true
      }
    } catch (error) {
      console.error('Error saving content before preview:', error)
      showPreview.value = true
    }
  } else {
    // Switching back to editor
    showPreview.value = false
    // When going back to editor, ensure content is synced
    setTimeout(() => {
      if (editorDiv.value) {
        try {
          isUpdatingFromWatch.value = true
          // Use form.content if available, otherwise get from editor
          const contentToShow = form.value.content || editorContentToHtml() || ''
          editorDiv.value.innerHTML = contentToShow
          setTimeout(() => {
            isUpdatingFromWatch.value = false
          }, 100)
        } catch (error) {
          console.error('Error restoring content to editor:', error)
          isUpdatingFromWatch.value = false
        }
      }
    }, 50)
  }
}

function wrapSelection(openTag: string, closeTag: string) {
  if (openTag === 'strong') {
    execCommand('bold')
  } else if (openTag === 'em') {
    execCommand('italic')
  } else {
    // For other tags, use execCommand with formatBlock or insertHTML
    const selection = window.getSelection()
    if (selection && selection.rangeCount > 0 && selection.toString().trim()) {
      const range = selection.getRangeAt(0)
      const selectedText = selection.toString()
      const wrapped = `<${openTag}>${selectedText}</${closeTag.replace('</', '')}>`
      range.deleteContents()
      const div = document.createElement('div')
      div.innerHTML = wrapped
      const fragment = document.createDocumentFragment()
      while (div.firstChild) {
        fragment.appendChild(div.firstChild)
      }
      range.insertNode(fragment)
      updateContentFromEditor()
    }
  }
}

function insertHeading(level: number) {
  const editor = editorDiv.value
  if (!editor) return

  const selection = window.getSelection()
  if (selection && selection.rangeCount > 0) {
    const range = selection.getRangeAt(0)
    const selectedText = selection.toString()
    
    if (selectedText.trim()) {
      // Wrap selected text
      const heading = document.createElement(`h${level}`)
      heading.textContent = selectedText
      range.deleteContents()
      range.insertNode(heading)
      updateContentFromEditor()
    } else {
      // Insert new heading
      const heading = document.createElement(`h${level}`)
      heading.textContent = 'Heading'
      range.insertNode(heading)
      // Select "Heading" text for easy editing
      const newRange = document.createRange()
      newRange.selectNodeContents(heading)
      selection.removeAllRanges()
      selection.addRange(newRange)
      updateContentFromEditor()
    }
  } else {
    // No selection, insert at end
    const heading = document.createElement(`h${level}`)
    heading.textContent = 'Heading'
    editor.appendChild(heading)
    // Select the text
    const range = document.createRange()
    range.selectNodeContents(heading)
    const sel = window.getSelection()
    sel?.removeAllRanges()
    sel?.addRange(range)
    updateContentFromEditor()
  }
}

function insertList(type: 'ul' | 'ol') {
  const editor = editorDiv.value
  if (!editor) return

  const selection = window.getSelection()
  if (selection && selection.rangeCount > 0) {
    const range = selection.getRangeAt(0)
    const selectedText = selection.toString()
    
    if (selectedText.trim()) {
      // Convert selected lines to list items
      const lines = selectedText.trim().split('\n').filter(line => line.trim())
      const list = document.createElement(type)
      lines.forEach(line => {
        const li = document.createElement('li')
        li.textContent = line.trim()
        list.appendChild(li)
      })
      range.deleteContents()
      range.insertNode(list)
      updateContentFromEditor()
    } else {
      // Insert new list with sample items
      const list = document.createElement(type)
      for (let i = 1; i <= 3; i++) {
        const li = document.createElement('li')
        li.textContent = `Item ${i}`
        list.appendChild(li)
      }
      range.insertNode(list)
      // Select first item
      const firstLi = list.querySelector('li')
      if (firstLi) {
        const newRange = document.createRange()
        newRange.selectNodeContents(firstLi)
        selection.removeAllRanges()
        selection.addRange(newRange)
      }
      updateContentFromEditor()
    }
  } else {
    // No selection, insert at end
    const list = document.createElement(type)
    for (let i = 1; i <= 3; i++) {
      const li = document.createElement('li')
      li.textContent = `Item ${i}`
      list.appendChild(li)
    }
    editor.appendChild(list)
    // Select first item
    const firstLi = list.querySelector('li')
    if (firstLi) {
      const range = document.createRange()
      range.selectNodeContents(firstLi)
      const sel = window.getSelection()
      sel?.removeAllRanges()
      sel?.addRange(range)
    }
    updateContentFromEditor()
  }
}

onMounted(async () => {
  // Load lists
  try {
    const listsResponse = await api.get('/lists')
    lists.value = listsResponse.data.lists
  } catch (err) {
    console.error('Failed to load lists:', err)
  }

  // Load campaign if editing
  if (isEdit.value) {
    try {
      const response = await api.get(`/campaigns/${route.params.id}`)
      const campaignData = {
        ...response.data.campaign,
        list_id: response.data.campaign.list_id?.toString() || '',
      }
      Object.assign(form.value, campaignData)
      // Load HTML content into editor after DOM is ready
      setTimeout(() => {
        if (editorDiv.value) {
          isUpdatingFromWatch.value = true
          // Ensure content is loaded into editor
          if (campaignData.content && campaignData.content.trim()) {
            editorDiv.value.innerHTML = campaignData.content
          } else {
            editorDiv.value.innerHTML = ''
          }
          setTimeout(() => {
            isUpdatingFromWatch.value = false
          }, 100)
        }
      }, 150)
    } catch (err) {
      console.error('Failed to load campaign:', err)
    }
  } else {
    // For new campaigns, ensure editor is initialized
    setTimeout(() => {
      if (editorDiv.value && !form.value.content) {
        editorDiv.value.innerHTML = ''
      }
    }, 100)
  }
})

// Watch for content changes and sync to editor (only when loading from backend)
watch(() => form.value.content, (newContent) => {
  if (editorDiv.value && !isUpdatingFromWatch.value && !showPreview.value) {
    const currentContent = editorDiv.value.innerHTML.trim()
    const newContentTrimmed = (newContent || '').trim()
    
    // Only update if different and not currently updating from editor
    // Also check if editor is actually empty (to avoid overwriting user input)
    if (newContentTrimmed && currentContent !== newContentTrimmed) {
      // Only sync if editor is empty or content is significantly different
      if (!currentContent || currentContent === '<br>' || currentContent === '<p></p>') {
        try {
          isUpdatingFromWatch.value = true
          editorDiv.value.innerHTML = newContent || ''
          setTimeout(() => {
            isUpdatingFromWatch.value = false
          }, 50)
        } catch (error) {
          console.error('Error syncing content to editor:', error)
          isUpdatingFromWatch.value = false
        }
      }
    }
  }
}, { immediate: false }) // Don't run immediately to avoid clearing on mount

async function handleSubmit() {
  loading.value = true
  error.value = ''

  // Ensure content is saved from editor before submitting
  if (editorDiv.value && !showPreview.value) {
    const html = editorContentToHtml()
    if (html !== form.value.content) {
      form.value.content = html
    }
  }

  // Validate list is selected
  if (!form.value.list_id || form.value.list_id === '') {
    error.value = 'Please select a list for this campaign'
    loading.value = false
    return
  }

  // Validate content exists
  if (!form.value.content || !form.value.content.trim()) {
    error.value = 'Please add email content'
    loading.value = false
    return
  }

  try {
    const payload = {
      ...form.value,
      list_id: parseInt(form.value.list_id),
    }

    if (isEdit.value) {
      await api.put(`/campaigns/${route.params.id}`, payload)
    } else {
      await api.post('/campaigns', payload)
    }
    router.push('/app/campaigns')
  } catch (err: any) {
    error.value = err.response?.data?.error || 'Failed to save campaign'
  } finally {
    loading.value = false
  }
}
</script>

