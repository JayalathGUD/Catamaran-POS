import React, { useEffect, useMemo, useState } from 'react'
import { formatLKR } from '../data/demoData'
import {
  MenuCategory,
  MenuFilterCategory,
  MenuFilterStatus,
  MenuItem,
  NavigationPage
} from '../types'
import {
  IconAlertTriangle,
  IconBox,
  IconCheck,
  IconChevronRight,
  IconCoffee,
  IconEdit,
  IconInfo,
  IconPlus,
  IconPower,
  IconRotateCcw,
  IconSearch,
  IconSparkles,
  IconSurfLessons,
  IconUtensils,
  IconX
} from './Icons'

interface MenuManagementProps {
  onNavigate: (page: NavigationPage) => void
}

interface FormState {
  id: string
  name: string
  category: MenuCategory
  code: string
  price: string
  costPrice: string
  stockTracking: boolean
  isActive: boolean
  description: string
}

interface FormErrors {
  name?: string
  category?: string
  code?: string
  price?: string
  costPrice?: string
}

const INITIAL_FORM: FormState = {
  id: '',
  name: '',
  category: 'Food',
  code: '',
  price: '',
  costPrice: '',
  stockTracking: false,
  isActive: true,
  description: ''
}

interface ApiMenuItem {
  _id?: string
  id?: string
  name?: string
  category?: string
  sellingPrice?: number
  price?: number
  costPrice?: number
  code?: string
  stockTracking?: boolean
  isActive?: boolean
  description?: string
  inventoryItemId?: string
  currentStock?: number
  createdAt?: string
  updatedAt?: string
}

const API_BASE_URL = 'http://127.0.0.1:5000/api/menu'

function mapApiToMenuItem(item: ApiMenuItem): MenuItem {
  return {
    id: String(item._id || item.id || ''),
    name: String(item.name || ''),
    category: (item.category || 'Food') as MenuCategory,
    price: typeof item.sellingPrice === 'number' ? item.sellingPrice : Number(item.price || 0),
    costPrice: typeof item.costPrice === 'number' ? item.costPrice : 0,
    code: String(item.code || '').toUpperCase(),
    stockTracking: Boolean(item.stockTracking),
    isActive: item.isActive !== false,
    description: item.description ? String(item.description) : undefined,
    inventoryItemId: item.inventoryItemId ? String(item.inventoryItemId) : undefined,
    currentStock: typeof item.currentStock === 'number' ? item.currentStock : undefined,
    createdAt: item.createdAt ? String(item.createdAt) : undefined
  }
}

export const MenuManagement: React.FC<MenuManagementProps> = ({ onNavigate }) => {
  // Live products state connected to Express / MongoDB Atlas backend
  const [products, setProducts] = useState<MenuItem[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState<boolean>(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [isTogglingStatus, setIsTogglingStatus] = useState<boolean>(false)

  // Filters State
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [categoryFilter, setCategoryFilter] = useState<MenuFilterCategory>('All')
  const [statusFilter, setStatusFilter] = useState<MenuFilterStatus>('All')
  const [stockTrackingFilter, setStockTrackingFilter] = useState<'All' | 'Tracked' | 'Untracked'>(
    'All'
  )

  // Sorting
  const [sortField, setSortField] = useState<
    'name' | 'category' | 'price' | 'costPrice' | 'margin'
  >('name')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')

  // Pagination
  const [currentPageNum, setCurrentPageNum] = useState<number>(1)
  const [pageSize, setPageSize] = useState<number>(10)

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false)
  const [editingProduct, setEditingProduct] = useState<MenuItem | null>(null)
  const [formData, setFormData] = useState<FormState>(INITIAL_FORM)
  const [formErrors, setFormErrors] = useState<FormErrors>({})
  const [touchedFields, setTouchedFields] = useState<Record<string, boolean>>({})

  // Deactivation confirmation dialog state
  const [deactivatingProduct, setDeactivatingProduct] = useState<MenuItem | null>(null)

  // Toast message
  const [toast, setToast] = useState<string | null>(null)

  const showToast = (message: string): void => {
    setToast(message)
    setTimeout(() => {
      setToast((curr) => (curr === message ? null : curr))
    }, 4000)
  }

  // Load menu items from backend API on mount
  const fetchMenuItems = async (): Promise<void> => {
    setIsLoading(true)
    setFetchError(null)
    try {
      const res = await fetch(API_BASE_URL)
      if (!res.ok) {
        throw new Error(`Server returned HTTP ${res.status}: ${res.statusText}`)
      }
      const data = (await res.json()) as ApiMenuItem[]
      if (!Array.isArray(data)) {
        throw new Error('Invalid data format received from server')
      }
      setProducts(data.map(mapApiToMenuItem))
    } catch (err: unknown) {
      console.error('Failed to load menu items:', err)
      const errorMsg =
        err instanceof Error
          ? err.message
          : 'Could not connect to backend server at http://127.0.0.1:5000'
      setFetchError(errorMsg)
      showToast('Failed to load menu items from MongoDB Atlas.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    let ignore = false

    async function loadInitial(): Promise<void> {
      try {
        const res = await fetch(API_BASE_URL)
        if (!res.ok) {
          throw new Error(`Server returned HTTP ${res.status}: ${res.statusText}`)
        }
        const data = (await res.json()) as ApiMenuItem[]
        if (!Array.isArray(data)) {
          throw new Error('Invalid data format received from server')
        }
        if (!ignore) {
          setProducts(data.map(mapApiToMenuItem))
        }
      } catch (err: unknown) {
        if (!ignore) {
          console.error('Failed to load menu items:', err)
          const errorMsg =
            err instanceof Error
              ? err.message
              : 'Could not connect to backend server at http://127.0.0.1:5000'
          setFetchError(errorMsg)
          showToast('Failed to load menu items from MongoDB Atlas.')
        }
      } finally {
        if (!ignore) {
          setIsLoading(false)
        }
      }
    }

    loadInitial()

    return () => {
      ignore = true
    }
  }, [])

  // Summary Metrics Calculation
  const metrics = useMemo(() => {
    const total = products.length
    const active = products.filter((p) => p.isActive).length
    const inactive = total - active
    const stockTracked = products.filter((p) => p.stockTracking).length

    // Weighted/Average margin of active items
    const activeWithValidPrices = products.filter((p) => p.isActive && p.price > 0)
    const totalSelling = activeWithValidPrices.reduce((acc, p) => acc + p.price, 0)
    const totalCost = activeWithValidPrices.reduce((acc, p) => acc + p.costPrice, 0)
    const avgMarginPercent =
      totalSelling > 0 ? (((totalSelling - totalCost) / totalSelling) * 100).toFixed(1) : '0.0'

    return {
      total,
      active,
      inactive,
      stockTracked,
      avgMarginPercent
    }
  }, [products])

  // Category counts
  const categoryCounts = useMemo(() => {
    return {
      All: products.length,
      Food: products.filter((p) => p.category === 'Food').length,
      Drinks: products.filter((p) => p.category === 'Drinks').length,
      'Surf Lessons': products.filter((p) => p.category === 'Surf Lessons').length,
      'Other Services': products.filter((p) => p.category === 'Other Services').length
    }
  }, [products])

  // Filtered & Sorted Products
  const filteredProducts = useMemo(() => {
    return products
      .filter((p) => {
        // Search query
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim()
          const nameMatch = p.name.toLowerCase().includes(q)
          const codeMatch = p.code.toLowerCase().includes(q)
          const descMatch = p.description ? p.description.toLowerCase().includes(q) : false
          if (!nameMatch && !codeMatch && !descMatch) return false
        }

        // Category filter
        if (categoryFilter !== 'All' && p.category !== categoryFilter) {
          return false
        }

        // Status filter
        if (statusFilter === 'Active' && !p.isActive) return false
        if (statusFilter === 'Inactive' && p.isActive) return false

        // Stock tracking filter
        if (stockTrackingFilter === 'Tracked' && !p.stockTracking) return false
        if (stockTrackingFilter === 'Untracked' && p.stockTracking) return false

        return true
      })
      .sort((a, b) => {
        let cmp = 0
        if (sortField === 'name') {
          cmp = a.name.localeCompare(b.name)
        } else if (sortField === 'category') {
          cmp = a.category.localeCompare(b.category)
        } else if (sortField === 'price') {
          cmp = a.price - b.price
        } else if (sortField === 'costPrice') {
          cmp = a.costPrice - b.costPrice
        } else if (sortField === 'margin') {
          const marginA = a.price > 0 ? (a.price - a.costPrice) / a.price : 0
          const marginB = b.price > 0 ? (b.price - b.costPrice) / b.price : 0
          cmp = marginA - marginB
        }
        return sortOrder === 'asc' ? cmp : -cmp
      })
  }, [
    products,
    searchQuery,
    categoryFilter,
    statusFilter,
    stockTrackingFilter,
    sortField,
    sortOrder
  ])

  // Pagination slice
  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / pageSize))
  const paginatedProducts = useMemo(() => {
    const start = (currentPageNum - 1) * pageSize
    return filteredProducts.slice(start, start + pageSize)
  }, [filteredProducts, currentPageNum, pageSize])

  const handleSort = (field: 'name' | 'category' | 'price' | 'costPrice' | 'margin'): void => {
    if (sortField === field) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortOrder('asc')
    }
    setCurrentPageNum(1)
  }

  const handleResetFilters = (): void => {
    setSearchQuery('')
    setCategoryFilter('All')
    setStatusFilter('All')
    setStockTrackingFilter('All')
    setCurrentPageNum(1)
    showToast('Filters reset to default view.')
  }

  // Auto-generate code prefix based on category
  const generateNextCode = (category: MenuCategory): string => {
    const prefixMap: Record<MenuCategory, string> = {
      Food: 'F',
      Drinks: 'D',
      'Surf Lessons': 'L',
      'Other Services': 'S'
    }
    const prefix = prefixMap[category] || 'P'
    const categoryProducts = products.filter((p) => p.category === category)
    let maxNum = 0
    categoryProducts.forEach((p) => {
      const match = p.code.match(new RegExp(`^${prefix}(\\d+)$`, 'i'))
      if (match) {
        const n = parseInt(match[1], 10)
        if (!isNaN(n) && n > maxNum) maxNum = n
      }
    })
    const nextNum = maxNum > 0 ? maxNum + 1 : categoryProducts.length + 1
    return `${prefix}${nextNum < 10 ? '0' + nextNum : nextNum}`
  }

  // Open modal for Adding
  const handleOpenAddModal = (): void => {
    setEditingProduct(null)
    setFormData({
      ...INITIAL_FORM,
      code: generateNextCode('Food')
    })
    setFormErrors({})
    setTouchedFields({})
    setSubmitError(null)
    setIsModalOpen(true)
  }

  // Open modal for Editing
  const handleOpenEditModal = (product: MenuItem): void => {
    setEditingProduct(product)
    setFormData({
      id: product.id,
      name: product.name,
      category: product.category,
      code: product.code,
      price: product.price.toString(),
      costPrice: product.costPrice.toString(),
      stockTracking: product.stockTracking,
      isActive: product.isActive,
      description: product.description || ''
    })
    setFormErrors({})
    setTouchedFields({})
    setSubmitError(null)
    setIsModalOpen(true)
  }

  // Form field change handler
  const handleFieldChange = (field: keyof FormState, value: string | boolean): void => {
    let nextCategory = formData.category
    setFormData((prev) => {
      const next = { ...prev, [field]: value }
      if (field === 'category' && !editingProduct) {
        next.code = generateNextCode(value as MenuCategory)
      }
      return next
    })

    if (field === 'category') {
      nextCategory = value as MenuCategory
    }

    setTouchedFields((prev) => ({ ...prev, [field]: true }))
    setSubmitError(null)

    // Validate on change
    validateField(field, value, nextCategory)
  }

  const validateField = (
    field: keyof FormState,
    value: string | boolean,
    currentCategory = formData.category
  ): void => {
    const errors = { ...formErrors }

    if (field === 'name' || field === 'category') {
      const nameToCheck = field === 'name' ? String(value).trim() : formData.name.trim()
      if (!nameToCheck) {
        errors.name = 'Product name is required'
      } else {
        const isDuplicate = products.some(
          (p) =>
            p.id !== formData.id &&
            p.category === currentCategory &&
            p.name.trim().toLowerCase() === nameToCheck.toLowerCase()
        )
        if (isDuplicate) {
          errors.name = `A product named "${nameToCheck}" already exists in the ${currentCategory} category.`
        } else {
          delete errors.name
        }
      }
    }

    if (field === 'code') {
      const strVal = String(value).trim().toUpperCase()
      if (!strVal) {
        errors.code = 'Item code / SKU is required'
      } else {
        const isDuplicateCode = products.some(
          (p) => p.id !== formData.id && p.code.trim().toUpperCase() === strVal
        )
        if (isDuplicateCode) {
          errors.code = `Product code "${strVal}" is already in use.`
        } else {
          delete errors.code
        }
      }
    }

    if (field === 'price') {
      const numVal = parseFloat(String(value))
      if (isNaN(numVal) || numVal <= 0) {
        errors.price = 'Selling price must be greater than Rs. 0.00'
      } else {
        delete errors.price
      }
    }

    if (field === 'costPrice') {
      const numVal = parseFloat(String(value))
      if (isNaN(numVal) || numVal < 0) {
        errors.costPrice = 'Cost price cannot be negative'
      } else {
        delete errors.costPrice
      }
    }

    setFormErrors(errors)
  }

  const validateAll = (): boolean => {
    const errors: FormErrors = {}
    const nameVal = formData.name.trim()
    if (!nameVal) {
      errors.name = 'Product name is required'
    } else {
      const isDuplicate = products.some(
        (p) =>
          p.id !== formData.id &&
          p.category === formData.category &&
          p.name.trim().toLowerCase() === nameVal.toLowerCase()
      )
      if (isDuplicate) {
        errors.name = `A product named "${nameVal}" already exists in the ${formData.category} category.`
      }
    }

    const codeVal = formData.code.trim().toUpperCase()
    if (!codeVal) {
      errors.code = 'Item code / SKU is required'
    } else {
      const isDuplicateCode = products.some(
        (p) => p.id !== formData.id && p.code.trim().toUpperCase() === codeVal
      )
      if (isDuplicateCode) {
        errors.code = `Product code "${codeVal}" is already in use.`
      }
    }

    const numPrice = parseFloat(formData.price)
    if (isNaN(numPrice) || numPrice <= 0) {
      errors.price = 'Selling price must be greater than Rs. 0.00'
    }
    const numCost = parseFloat(formData.costPrice)
    if (isNaN(numCost) || numCost < 0) {
      errors.costPrice = 'Cost price cannot be negative'
    }

    setFormErrors(errors)
    setTouchedFields({
      name: true,
      code: true,
      price: true,
      costPrice: true,
      category: true
    })

    return Object.keys(errors).length === 0
  }

  // Save / Update Product via Backend API (POST /api/menu or PUT /api/menu/:id)
  const handleSaveProduct = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    if (isSaving) return
    if (!validateAll()) return

    const numPrice = parseFloat(formData.price)
    const numCost = parseFloat(formData.costPrice)
    const cleanCode = formData.code.trim().toUpperCase()

    const payload = {
      name: formData.name.trim(),
      category: formData.category,
      sellingPrice: numPrice,
      costPrice: numCost,
      code: cleanCode,
      stockTracking: Boolean(formData.stockTracking),
      isActive: Boolean(formData.isActive),
      description: formData.description.trim()
    }

    setIsSaving(true)
    setSubmitError(null)

    try {
      if (editingProduct) {
        // PUT /api/menu/:id
        const res = await fetch(`${API_BASE_URL}/${editingProduct.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        })

        const data = await res.json()

        if (!res.ok) {
          if (res.status === 409) {
            setFormErrors((prev) => ({
              ...prev,
              code: data.message || 'This menu item code already exists in MongoDB Atlas'
            }))
            setSubmitError(data.message || 'This menu item code already exists.')
            return
          }
          throw new Error(data.message || `Failed to update product (HTTP ${res.status})`)
        }

        const updated = mapApiToMenuItem(data)
        setProducts((prev) => prev.map((p) => (p.id === editingProduct.id ? updated : p)))
        showToast(`Updated "${updated.name}" in database.`)
        setIsModalOpen(false)
      } else {
        // POST /api/menu
        const res = await fetch(API_BASE_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        })

        const data = await res.json()

        if (!res.ok) {
          if (res.status === 409) {
            setFormErrors((prev) => ({
              ...prev,
              code: data.message || 'This menu item code already exists in MongoDB Atlas'
            }))
            setSubmitError(data.message || 'This menu item code already exists.')
            return
          }
          throw new Error(data.message || `Failed to create product (HTTP ${res.status})`)
        }

        const created = mapApiToMenuItem(data)
        setProducts((prev) => [created, ...prev])
        showToast(`Added new product "${created.name}" to MongoDB Atlas.`)
        setIsModalOpen(false)
      }
    } catch (err: unknown) {
      console.error('Error saving menu item:', err)
      const msg = err instanceof Error ? err.message : 'Network error occurred while saving.'
      setSubmitError(msg)
      showToast(`Save failed: ${msg}`)
    } finally {
      setIsSaving(false)
    }
  }

  // Confirm Deactivation via Backend API (PATCH /api/menu/:id/status)
  const handleConfirmDeactivate = async (): Promise<void> => {
    if (!deactivatingProduct || isTogglingStatus) return

    setIsTogglingStatus(true)
    try {
      const res = await fetch(`${API_BASE_URL}/${deactivatingProduct.id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ isActive: false })
      })

      const data = (await res.json()) as ApiMenuItem & { message?: string }
      if (!res.ok) {
        throw new Error(data.message || 'Failed to deactivate menu item')
      }

      const updated = mapApiToMenuItem(data)
      setProducts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))
      showToast(`"${updated.name}" is now deactivated in database.`)
      setDeactivatingProduct(null)
    } catch (err: unknown) {
      console.error('Error deactivating product:', err)
      const msg = err instanceof Error ? err.message : 'Network error'
      showToast(`Deactivation failed: ${msg}`)
    } finally {
      setIsTogglingStatus(false)
    }
  }

  // Quick Reactivate via Backend API (PATCH /api/menu/:id/status)
  const handleReactivate = async (product: MenuItem): Promise<void> => {
    try {
      const res = await fetch(`${API_BASE_URL}/${product.id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ isActive: true })
      })

      const data = (await res.json()) as ApiMenuItem & { message?: string }
      if (!res.ok) {
        throw new Error(data.message || 'Failed to reactivate menu item')
      }

      const updated = mapApiToMenuItem(data)
      setProducts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))
      showToast(`"${updated.name}" has been reactivated in database.`)
    } catch (err: unknown) {
      console.error('Error reactivating product:', err)
      const msg = err instanceof Error ? err.message : 'Network error'
      showToast(`Reactivation failed: ${msg}`)
    }
  }

  // Margin calculation helper for form preview
  const previewSelling = parseFloat(formData.price) || 0
  const previewCost = parseFloat(formData.costPrice) || 0
  const previewProfit = previewSelling - previewCost
  const previewMargin =
    previewSelling > 0 ? ((previewProfit / previewSelling) * 100).toFixed(1) : null

  return (
    <div className="menu-management-container">
      {/* Toast Notification */}
      {toast && (
        <div className="dashboard-toast" role="status">
          <IconInfo size={16} />
          <span>{toast}</span>
          <button
            type="button"
            className="toast-close"
            onClick={() => setToast(null)}
            aria-label="Close notification"
          >
            <IconX size={14} />
          </button>
        </div>
      )}

      {/* Header Panel */}
      <section className="menu-mgmt-header">
        <div className="header-meta">
          <div className="header-top-row">
            <button
              type="button"
              className="pos-back-link"
              onClick={() => onNavigate('Dashboard')}
              title="Return to Dashboard"
            >
              <IconChevronRight size={13} style={{ transform: 'rotate(180deg)' }} />
              <span>Dashboard</span>
            </button>
            <span className="crumb-separator">/</span>
            <span className="pos-kicker">🍽️ Cafe, Bar &amp; Surf Packages Catalogue</span>
            <div
              className="demo-notice-badge"
              style={
                fetchError
                  ? { backgroundColor: '#fef2f2', borderColor: '#fecaca', color: '#991b1b' }
                  : { backgroundColor: '#f0fdf4', borderColor: '#bbf7d0', color: '#166534' }
              }
            >
              <span
                className="demo-pulse-dot"
                style={fetchError ? { backgroundColor: '#ef4444' } : { backgroundColor: '#22c55e' }}
              />
              <span>{fetchError ? 'DATABASE OFFLINE' : 'MONGODB ATLAS · CONNECTED'}</span>
            </div>
          </div>
          <h1 className="dashboard-heading">Menu Management</h1>
          <p className="dashboard-subheading">
            Manage cafe food, drinks, surf coaching packages, and beach merchandise catalogue
          </p>
        </div>

        {/* Quick Header Actions */}
        <div className="header-quick-actions">
          <button
            type="button"
            className="btn-action btn-action-outline"
            onClick={fetchMenuItems}
            disabled={isLoading}
            title="Reload items from MongoDB Atlas"
          >
            <IconRotateCcw
              size={14}
              style={isLoading ? { animation: 'spin 1s linear infinite' } : undefined}
            />
            <span>{isLoading ? 'Loading...' : 'Refresh'}</span>
          </button>
          <button
            type="button"
            className="btn-action btn-action-outline"
            onClick={() => onNavigate('POS Billing')}
            title="Switch to POS counter terminal"
          >
            <IconCoffee size={15} />
            <span>Open POS Terminal</span>
          </button>
          <button
            type="button"
            className="btn-action btn-action-primary"
            onClick={handleOpenAddModal}
            title="Create a new menu product"
          >
            <IconPlus size={16} />
            <span>Add Product</span>
          </button>
        </div>
      </section>

      {/* Business Rules & Architecture Guidance Banner */}
      <section className="menu-rules-banner" aria-label="Business Rules">
        <div className="rules-banner-icon">
          <IconInfo size={18} />
        </div>
        <div className="rules-banner-content">
          <div className="rules-banner-title">
            <strong>Catamaran Surf Club Catalog Architecture:</strong>
          </div>
          <div className="rules-banner-items">
            <span className="rules-pill">
              <strong>Surf Lessons:</strong> Billable coaching services configured with fixed
              session rates.
            </span>
            <span className="rules-pill">
              <strong>Surfboard Rentals:</strong> Tracked on separate equipment fleet screen
              (Surfboard Rentals) with real-time check-in timers.
            </span>
            <span className="rules-pill">
              <strong>King Coconut & Goods:</strong> Flagged for stock tracking. Kitchen meals do
              not track raw recipe deductions.
            </span>
          </div>
        </div>
      </section>

      {/* Summary KPI Cards */}
      <section className="menu-metrics-grid">
        <div className="menu-metric-card">
          <div className="metric-header">
            <span className="metric-label">Total Catalog Items</span>
            <span className="metric-icon-wrap icon-teal">
              <IconBox size={16} />
            </span>
          </div>
          <div className="metric-value-row">
            <span className="metric-number">{metrics.total}</span>
            <span className="metric-subtext">across 4 categories</span>
          </div>
        </div>

        <div className="menu-metric-card">
          <div className="metric-header">
            <span className="metric-label">Active POS Items</span>
            <span className="metric-icon-wrap icon-green">
              <IconCheck size={16} />
            </span>
          </div>
          <div className="metric-value-row">
            <span className="metric-number">{metrics.active}</span>
            <span className="metric-tag tag-success">Visible on POS</span>
          </div>
        </div>

        <div className="menu-metric-card">
          <div className="metric-header">
            <span className="metric-label">Inactive / Seasonal</span>
            <span className="metric-icon-wrap icon-amber">
              <IconPower size={16} />
            </span>
          </div>
          <div className="metric-value-row">
            <span className="metric-number">{metrics.inactive}</span>
            <span className="metric-subtext">hidden from counter</span>
          </div>
        </div>

        <div className="menu-metric-card">
          <div className="metric-header">
            <span className="metric-label">Stock-Tracked Goods</span>
            <span className="metric-icon-wrap icon-blue">
              <IconBox size={16} />
            </span>
          </div>
          <div className="metric-value-row">
            <span className="metric-number">{metrics.stockTracked}</span>
            <span className="metric-subtext">Coconuts, wax, rashguards</span>
          </div>
        </div>

        <div className="menu-metric-card">
          <div className="metric-header">
            <span className="metric-label">Avg. Gross Margin</span>
            <span className="metric-icon-wrap icon-teal">
              <IconSparkles size={16} />
            </span>
          </div>
          <div className="metric-value-row">
            <span className="metric-number">{metrics.avgMarginPercent}%</span>
            <span className="metric-tag tag-info">Target &gt; 60%</span>
          </div>
        </div>
      </section>

      {/* Main Catalog Workspace */}
      <section className="menu-main-card">
        {/* Category Tabs */}
        <div className="menu-category-tabs">
          <button
            type="button"
            className={`menu-tab-btn ${categoryFilter === 'All' ? 'active' : ''}`}
            onClick={() => {
              setCategoryFilter('All')
              setCurrentPageNum(1)
            }}
          >
            <span>All Categories</span>
            <span className="tab-badge">{categoryCounts.All}</span>
          </button>
          <button
            type="button"
            className={`menu-tab-btn ${categoryFilter === 'Food' ? 'active' : ''}`}
            onClick={() => {
              setCategoryFilter('Food')
              setCurrentPageNum(1)
            }}
          >
            <IconUtensils size={14} />
            <span>Food</span>
            <span className="tab-badge">{categoryCounts.Food}</span>
          </button>
          <button
            type="button"
            className={`menu-tab-btn ${categoryFilter === 'Drinks' ? 'active' : ''}`}
            onClick={() => {
              setCategoryFilter('Drinks')
              setCurrentPageNum(1)
            }}
          >
            <IconCoffee size={14} />
            <span>Drinks</span>
            <span className="tab-badge">{categoryCounts.Drinks}</span>
          </button>
          <button
            type="button"
            className={`menu-tab-btn ${categoryFilter === 'Surf Lessons' ? 'active' : ''}`}
            onClick={() => {
              setCategoryFilter('Surf Lessons')
              setCurrentPageNum(1)
            }}
          >
            <IconSurfLessons size={14} />
            <span>Surf Lessons</span>
            <span className="tab-badge">{categoryCounts['Surf Lessons']}</span>
          </button>
          <button
            type="button"
            className={`menu-tab-btn ${categoryFilter === 'Other Services' ? 'active' : ''}`}
            onClick={() => {
              setCategoryFilter('Other Services')
              setCurrentPageNum(1)
            }}
          >
            <IconSparkles size={14} />
            <span>Other Services</span>
            <span className="tab-badge">{categoryCounts['Other Services']}</span>
          </button>
        </div>

        {/* Filter & Search Bar */}
        <div className="menu-filter-bar">
          {/* Search Box */}
          <div className="menu-search-box">
            <IconSearch size={16} className="search-icon" />
            <input
              type="text"
              placeholder="Search by name, code (e.g. F01, D01), or ingredients..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value)
                setCurrentPageNum(1)
              }}
              className="menu-search-input"
            />
            {searchQuery && (
              <button
                type="button"
                className="search-clear-btn"
                onClick={() => setSearchQuery('')}
                title="Clear search"
              >
                <IconX size={14} />
              </button>
            )}
          </div>

          {/* Status Filter */}
          <div className="menu-filter-item">
            <label htmlFor="status-select" className="filter-label">
              Status:
            </label>
            <select
              id="status-select"
              className="menu-select"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as MenuFilterStatus)
                setCurrentPageNum(1)
              }}
            >
              <option value="All">All Statuses</option>
              <option value="Active">Active Only</option>
              <option value="Inactive">Inactive Only</option>
            </select>
          </div>

          {/* Stock Tracking Filter */}
          <div className="menu-filter-item">
            <label htmlFor="stock-select" className="filter-label">
              Stock Control:
            </label>
            <select
              id="stock-select"
              className="menu-select"
              value={stockTrackingFilter}
              onChange={(e) => {
                setStockTrackingFilter(e.target.value as 'All' | 'Tracked' | 'Untracked')
                setCurrentPageNum(1)
              }}
            >
              <option value="All">All Stock Types</option>
              <option value="Tracked">Stock Tracked</option>
              <option value="Untracked">Service / Kitchen</option>
            </select>
          </div>

          {/* Clear Filters Button */}
          {(searchQuery ||
            categoryFilter !== 'All' ||
            statusFilter !== 'All' ||
            stockTrackingFilter !== 'All') && (
            <button
              type="button"
              className="btn-action btn-action-outline btn-sm"
              onClick={handleResetFilters}
              title="Reset all search filters"
            >
              <IconRotateCcw size={13} />
              <span>Reset</span>
            </button>
          )}

          <div className="menu-count-indicator">
            Showing <strong>{filteredProducts.length}</strong> of {products.length} products
          </div>
        </div>

        {/* Product Table */}
        <div className="menu-table-wrapper">
          <table className="menu-table">
            <thead>
              <tr>
                <th
                  className="th-sortable col-product"
                  onClick={() => handleSort('name')}
                  title="Sort by Product Name"
                >
                  <div className="th-content">
                    <span>Product Name &amp; Code</span>
                    {sortField === 'name' && (
                      <span className="sort-arrow">{sortOrder === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </div>
                </th>
                <th
                  className="th-sortable col-category"
                  onClick={() => handleSort('category')}
                  title="Sort by Category"
                >
                  <div className="th-content">
                    <span>Category</span>
                    {sortField === 'category' && (
                      <span className="sort-arrow">{sortOrder === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </div>
                </th>
                <th
                  className="th-sortable col-numeric"
                  onClick={() => handleSort('price')}
                  title="Sort by Selling Price"
                >
                  <div className="th-content th-right">
                    <span>Selling Price (LKR)</span>
                    {sortField === 'price' && (
                      <span className="sort-arrow">{sortOrder === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </div>
                </th>
                <th
                  className="th-sortable col-numeric"
                  onClick={() => handleSort('costPrice')}
                  title="Sort by Cost Price"
                >
                  <div className="th-content th-right">
                    <span>Cost Price (LKR)</span>
                    {sortField === 'costPrice' && (
                      <span className="sort-arrow">{sortOrder === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </div>
                </th>
                <th
                  className="th-sortable col-margin"
                  onClick={() => handleSort('margin')}
                  title="Sort by Gross Margin"
                >
                  <div className="th-content th-right">
                    <span>Est. Margin</span>
                    {sortField === 'margin' && (
                      <span className="sort-arrow">{sortOrder === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </div>
                </th>
                <th className="col-stock">
                  <span>Stock Tracking</span>
                </th>
                <th className="col-status">
                  <span>Status</span>
                </th>
                <th className="col-actions th-right">
                  <span>Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="menu-table-empty">
                    <div className="empty-state-box">
                      <div className="empty-state-icon">
                        <IconRotateCcw
                          size={32}
                          style={{
                            animation: 'spin 1s linear infinite',
                            color: 'var(--teal-primary, #0d9488)'
                          }}
                        />
                      </div>
                      <h3 className="empty-state-title">Loading Catalog from MongoDB...</h3>
                      <p className="empty-state-desc">
                        Fetching live menu items from Express backend at {API_BASE_URL}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : fetchError ? (
                <tr>
                  <td colSpan={8} className="menu-table-empty">
                    <div className="empty-state-box">
                      <div className="empty-state-icon" style={{ color: '#ef4444' }}>
                        <IconAlertTriangle size={32} />
                      </div>
                      <h3 className="empty-state-title">Failed to Connect to Database</h3>
                      <p className="empty-state-desc">{fetchError}</p>
                      <div className="empty-state-actions">
                        <button
                          type="button"
                          className="btn-action btn-action-primary btn-sm"
                          onClick={fetchMenuItems}
                        >
                          <IconRotateCcw size={13} />
                          <span>Retry Connection</span>
                        </button>
                      </div>
                    </div>
                  </td>
                </tr>
              ) : paginatedProducts.length === 0 ? (
                <tr>
                  <td colSpan={8} className="menu-table-empty">
                    <div className="empty-state-box">
                      <div className="empty-state-icon">
                        <IconSearch size={32} />
                      </div>
                      <h3 className="empty-state-title">
                        {products.length === 0
                          ? 'No menu items in database yet'
                          : 'No products match your criteria'}
                      </h3>
                      <p className="empty-state-desc">
                        {products.length === 0
                          ? 'Get started by creating your first product in MongoDB Atlas.'
                          : 'Try adjusting your search query, clearing category filters, or add a new product.'}
                      </p>
                      <div className="empty-state-actions">
                        {products.length > 0 && (
                          <button
                            type="button"
                            className="btn-action btn-action-outline btn-sm"
                            onClick={handleResetFilters}
                          >
                            <IconRotateCcw size={13} />
                            <span>Clear Filters</span>
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn-action btn-action-primary btn-sm"
                          onClick={handleOpenAddModal}
                        >
                          <IconPlus size={13} />
                          <span>Add New Product</span>
                        </button>
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedProducts.map((product) => {
                  const profit = product.price - product.costPrice
                  const marginPercent =
                    product.price > 0 ? ((profit / product.price) * 100).toFixed(0) : '0'
                  const isHighMargin = parseFloat(marginPercent) >= 60
                  const isLowMargin = parseFloat(marginPercent) < 40

                  return (
                    <tr
                      key={product.id}
                      className={`menu-row ${!product.isActive ? 'row-inactive' : ''}`}
                    >
                      {/* Product Name & Code */}
                      <td className="col-product">
                        <div className="product-identity">
                          <div className="product-title-line">
                            <span className="product-name">{product.name}</span>
                            <span className="product-code-pill">{product.code}</span>
                          </div>
                          {product.description && (
                            <div className="product-desc-snippet">{product.description}</div>
                          )}
                        </div>
                      </td>

                      {/* Category */}
                      <td className="col-category">
                        <span
                          className={`category-pill cat-${product.category
                            .toLowerCase()
                            .replace(/\s+/g, '-')}`}
                        >
                          {product.category === 'Food' && <IconUtensils size={12} />}
                          {product.category === 'Drinks' && <IconCoffee size={12} />}
                          {product.category === 'Surf Lessons' && <IconSurfLessons size={12} />}
                          {product.category === 'Other Services' && <IconSparkles size={12} />}
                          <span>{product.category}</span>
                        </span>
                      </td>

                      {/* Selling Price */}
                      <td className="col-numeric text-right">
                        <span className="price-selling">{formatLKR(product.price)}</span>
                      </td>

                      {/* Cost Price */}
                      <td className="col-numeric text-right">
                        <span className="price-cost">{formatLKR(product.costPrice)}</span>
                      </td>

                      {/* Margin */}
                      <td className="col-margin text-right">
                        <div className="margin-indicator">
                          <span
                            className={`margin-pill ${
                              isHighMargin
                                ? 'margin-high'
                                : isLowMargin
                                  ? 'margin-low'
                                  : 'margin-mid'
                            }`}
                          >
                            {marginPercent}%
                          </span>
                          <span className="profit-subtext">+{formatLKR(profit)}</span>
                        </div>
                      </td>

                      {/* Stock Tracking */}
                      <td className="col-stock">
                        {product.stockTracking ? (
                          <div
                            style={{
                              display: 'inline-flex',
                              flexDirection: 'column',
                              gap: '4px',
                              alignItems: 'flex-start'
                            }}
                          >
                            <span
                              className="stock-tracking-badge tracked"
                              title="Physical inventory deduction enabled"
                            >
                              <span className="tracking-dot" />
                              <IconBox size={13} />
                              <span>Tracked</span>
                            </span>
                            {typeof product.currentStock === 'number' && (
                              <span
                                style={{
                                  fontSize: '11px',
                                  fontWeight: 600,
                                  padding: '1px 6px',
                                  borderRadius: '10px',
                                  backgroundColor:
                                    product.currentStock > 5
                                      ? 'rgba(16, 185, 129, 0.12)'
                                      : product.currentStock > 0
                                        ? 'rgba(245, 158, 11, 0.15)'
                                        : 'rgba(239, 68, 68, 0.12)',
                                  color:
                                    product.currentStock > 5
                                      ? '#059669'
                                      : product.currentStock > 0
                                        ? '#d97706'
                                        : '#dc2626',
                                  border: `1px solid ${
                                    product.currentStock > 5
                                      ? 'rgba(16, 185, 129, 0.25)'
                                      : product.currentStock > 0
                                        ? 'rgba(245, 158, 11, 0.3)'
                                        : 'rgba(239, 68, 68, 0.25)'
                                  }`
                                }}
                              >
                                {product.currentStock} in stock
                              </span>
                            )}
                          </div>
                        ) : (
                          <span
                            className="stock-tracking-badge untracked"
                            title="Non-tracked or service item"
                          >
                            <span className="tracking-dot-muted" />
                            <span>Service / Kitchen</span>
                          </span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="col-status">
                        {product.isActive ? (
                          <span className="status-badge status-active">
                            <span className="status-dot green" />
                            <span>Active</span>
                          </span>
                        ) : (
                          <span className="status-badge status-inactive">
                            <span className="status-dot grey" />
                            <span>Inactive</span>
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="col-actions text-right">
                        <div className="action-buttons-group">
                          <button
                            type="button"
                            className="btn-icon-action"
                            onClick={() => handleOpenEditModal(product)}
                            title={`Edit ${product.name}`}
                            aria-label={`Edit ${product.name}`}
                          >
                            <IconEdit size={15} />
                            <span>Edit</span>
                          </button>

                          {product.isActive ? (
                            <button
                              type="button"
                              className="btn-icon-action btn-icon-deactivate"
                              onClick={() => setDeactivatingProduct(product)}
                              title={`Deactivate ${product.name}`}
                              aria-label={`Deactivate ${product.name}`}
                            >
                              <IconPower size={14} />
                              <span>Deactivate</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="btn-icon-action btn-icon-activate"
                              onClick={() => handleReactivate(product)}
                              title={`Reactivate ${product.name}`}
                              aria-label={`Reactivate ${product.name}`}
                            >
                              <IconCheck size={14} />
                              <span>Reactivate</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Table Pagination Footer */}
        {filteredProducts.length > 0 && (
          <div className="menu-table-footer">
            <div className="footer-left">
              <span>Rows per page:</span>
              <select
                className="page-size-select"
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value))
                  setCurrentPageNum(1)
                }}
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
              </select>
              <span className="footer-page-info">
                Page <strong>{currentPageNum}</strong> of {totalPages}
              </span>
            </div>

            <div className="footer-pagination">
              <button
                type="button"
                className="btn-action btn-action-outline btn-sm"
                onClick={() => setCurrentPageNum((p) => Math.max(1, p - 1))}
                disabled={currentPageNum <= 1}
              >
                Previous
              </button>
              <button
                type="button"
                className="btn-action btn-action-outline btn-sm"
                onClick={() => setCurrentPageNum((p) => Math.min(totalPages, p + 1))}
                disabled={currentPageNum >= totalPages}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </section>

      {/* ============================================================ */}
      {/* ADD / EDIT PRODUCT MODAL                                      */}
      {/* ============================================================ */}
      {isModalOpen && (
        <div className="modal-backdrop" onClick={() => !isSaving && setIsModalOpen(false)}>
          <div
            className="modal-card menu-modal-card"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="menu-modal-title"
          >
            {/* Modal Header */}
            <div className="modal-header">
              <div className="modal-header-meta">
                <span className="modal-subtitle">
                  {editingProduct ? 'Update Product Details' : 'New Catalog Item'}
                </span>
                <h2 id="menu-modal-title" className="modal-title">
                  {editingProduct ? `Edit Product: ${editingProduct.name}` : 'Add Product to Menu'}
                </h2>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => !isSaving && setIsModalOpen(false)}
                aria-label="Close modal"
                disabled={isSaving}
              >
                <IconX size={18} />
              </button>
            </div>

            {/* Modal Body Form */}
            <form onSubmit={handleSaveProduct} className="menu-form" noValidate>
              <div className="modal-body-scrollable">
                {/* Submit Error Banner */}
                {submitError && (
                  <div
                    className="form-error-banner"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '10px 14px',
                      backgroundColor: '#fef2f2',
                      border: '1px solid #fecaca',
                      borderRadius: 'var(--radius-md, 8px)',
                      color: '#b91c1c',
                      fontSize: '12px',
                      fontWeight: 600,
                      marginBottom: '14px'
                    }}
                  >
                    <IconAlertTriangle size={16} />
                    <span>{submitError}</span>
                  </div>
                )}

                {/* Product Name */}
                <div className="form-group">
                  <label htmlFor="form-prod-name" className="form-label">
                    Product Name <span className="required-star">*</span>
                  </label>
                  <input
                    id="form-prod-name"
                    type="text"
                    className={`form-input ${
                      touchedFields.name && formErrors.name ? 'input-error' : ''
                    }`}
                    placeholder="e.g. Seafood Fried Rice, Fresh King Coconut, Beginner Lesson"
                    value={formData.name}
                    onChange={(e) => handleFieldChange('name', e.target.value)}
                    autoFocus
                    disabled={isSaving}
                  />
                  {touchedFields.name && formErrors.name && (
                    <div className="form-error-msg">{formErrors.name}</div>
                  )}
                </div>

                {/* Category & Item Code */}
                <div className="form-row-2col">
                  <div className="form-group">
                    <label htmlFor="form-prod-category" className="form-label">
                      Category <span className="required-star">*</span>
                    </label>
                    <select
                      id="form-prod-category"
                      className="form-select"
                      value={formData.category}
                      onChange={(e) =>
                        handleFieldChange('category', e.target.value as MenuCategory)
                      }
                      disabled={isSaving}
                    >
                      <option value="Food">Food (Kitchen &amp; Restaurant)</option>
                      <option value="Drinks">Drinks (Beverage Bar)</option>
                      <option value="Surf Lessons">Surf Lessons (Coaching Service)</option>
                      <option value="Other Services">Other Services (Retail &amp; Merch)</option>
                    </select>
                    <div className="form-hint">
                      {formData.category === 'Surf Lessons' &&
                        'Surf lessons are configured as billable coaching items.'}
                      {formData.category === 'Food' &&
                        'Prepared in cafe kitchen without individual ingredient tracking.'}
                    </div>
                  </div>

                  <div className="form-group">
                    <label htmlFor="form-prod-code" className="form-label">
                      Item Code / SKU <span className="required-star">*</span>
                    </label>
                    <input
                      id="form-prod-code"
                      type="text"
                      className={`form-input text-uppercase ${
                        touchedFields.code && formErrors.code ? 'input-error' : ''
                      }`}
                      placeholder="e.g. F09, D10, L06"
                      value={formData.code}
                      onChange={(e) => handleFieldChange('code', e.target.value.toUpperCase())}
                      disabled={isSaving}
                    />
                    {touchedFields.code && formErrors.code && (
                      <div className="form-error-msg">{formErrors.code}</div>
                    )}
                    <div className="form-hint">Unique shortcode stored in MongoDB Atlas</div>
                  </div>
                </div>

                {/* Pricing: Selling Price & Cost Price */}
                <div className="form-row-2col">
                  <div className="form-group">
                    <label htmlFor="form-prod-price" className="form-label">
                      Selling Price (LKR) <span className="required-star">*</span>
                    </label>
                    <div
                      className={`input-prefix-box ${
                        touchedFields.price && formErrors.price ? 'input-error' : ''
                      }`}
                    >
                      <span className="input-prefix">Rs.</span>
                      <input
                        id="form-prod-price"
                        type="number"
                        step="10"
                        min="1"
                        className="form-input-prefixed"
                        placeholder="0.00"
                        value={formData.price}
                        onChange={(e) => handleFieldChange('price', e.target.value)}
                        disabled={isSaving}
                      />
                    </div>
                    {touchedFields.price && formErrors.price && (
                      <div className="form-error-msg">{formErrors.price}</div>
                    )}
                  </div>

                  <div className="form-group">
                    <label htmlFor="form-prod-cost" className="form-label">
                      Cost Price (LKR) <span className="required-star">*</span>
                    </label>
                    <div
                      className={`input-prefix-box ${
                        touchedFields.costPrice && formErrors.costPrice ? 'input-error' : ''
                      }`}
                    >
                      <span className="input-prefix">Rs.</span>
                      <input
                        id="form-prod-cost"
                        type="number"
                        step="10"
                        min="0"
                        className="form-input-prefixed"
                        placeholder="0.00"
                        value={formData.costPrice}
                        onChange={(e) => handleFieldChange('costPrice', e.target.value)}
                        disabled={isSaving}
                      />
                    </div>
                    {touchedFields.costPrice && formErrors.costPrice && (
                      <div className="form-error-msg">{formErrors.costPrice}</div>
                    )}
                  </div>
                </div>

                {/* Real-time Margin & Profitability Live Preview */}
                {previewSelling > 0 && (
                  <div className="margin-live-card">
                    <div className="margin-live-row">
                      <span className="margin-live-label">Estimated Gross Profit:</span>
                      <span
                        className={`margin-live-val ${
                          previewProfit < 0 ? 'text-danger' : 'text-success'
                        }`}
                      >
                        {formatLKR(previewProfit)}
                      </span>
                    </div>
                    <div className="margin-live-row">
                      <span className="margin-live-label">Gross Margin %:</span>
                      <span
                        className={`margin-live-val ${
                          previewProfit < 0
                            ? 'text-danger'
                            : parseFloat(previewMargin || '0') >= 50
                              ? 'text-teal'
                              : 'text-amber'
                        }`}
                      >
                        {previewMargin}%
                      </span>
                    </div>
                    {previewProfit < 0 && (
                      <div className="margin-alert-danger">
                        <IconAlertTriangle size={14} />
                        <span>
                          Warning: Selling price is lower than cost price (Negative margin).
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* Stock Tracking Toggle */}
                <div className="form-toggle-card">
                  <div className="toggle-info">
                    <div className="toggle-title">
                      <IconBox size={16} />
                      <span>Stock Tracking Control</span>
                    </div>
                    <p className="toggle-desc">
                      Enable inventory tracking for count-based bar items &amp; retail products
                      (e.g. King Coconut, Wax, Leashes, Dry Bags). Keep disabled for kitchen dishes
                      and surf lessons.
                    </p>
                  </div>
                  <label className="switch-toggle" htmlFor="form-stock-tracking">
                    <input
                      id="form-stock-tracking"
                      type="checkbox"
                      checked={formData.stockTracking}
                      onChange={(e) => handleFieldChange('stockTracking', e.target.checked)}
                      disabled={isSaving}
                    />
                    <span className="slider round" />
                  </label>
                </div>

                {/* Active Status Toggle */}
                <div className="form-toggle-card">
                  <div className="toggle-info">
                    <div className="toggle-title">
                      <IconPower size={16} />
                      <span>Product Visibility Status</span>
                    </div>
                    <p className="toggle-desc">
                      Active products appear on POS billing cashier terminals. Inactive products are
                      temporarily hidden without deleting historical sales records.
                    </p>
                  </div>
                  <label className="switch-toggle" htmlFor="form-active-status">
                    <input
                      id="form-active-status"
                      type="checkbox"
                      checked={formData.isActive}
                      onChange={(e) => handleFieldChange('isActive', e.target.checked)}
                      disabled={isSaving}
                    />
                    <span className="slider round" />
                  </label>
                </div>

                {/* Description */}
                <div className="form-group">
                  <label htmlFor="form-prod-desc" className="form-label">
                    Description &amp; Ingredients / Notes (Optional)
                  </label>
                  <textarea
                    id="form-prod-desc"
                    className="form-textarea"
                    rows={2}
                    placeholder="e.g. Served with beach garden salad, lime, garlic aioli..."
                    value={formData.description}
                    onChange={(e) => handleFieldChange('description', e.target.value)}
                    disabled={isSaving}
                  />
                </div>

                {/* Database Persistence Notice */}
                <div
                  className="form-demo-disclaimer"
                  style={{
                    backgroundColor: '#f0fdf4',
                    borderColor: '#bbf7d0',
                    color: '#166534'
                  }}
                >
                  <IconInfo size={14} />
                  <span>
                    MONGODB ATLAS: Changes are saved directly to your live database at{' '}
                    <code>http://127.0.0.1:5000/api/menu</code>.
                  </span>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn-action btn-action-outline"
                  onClick={() => setIsModalOpen(false)}
                  disabled={isSaving}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-action btn-action-primary" disabled={isSaving}>
                  {isSaving ? (
                    <>
                      <IconRotateCcw size={16} style={{ animation: 'spin 1s linear infinite' }} />
                      <span>Saving to Database...</span>
                    </>
                  ) : (
                    <>
                      <IconCheck size={16} />
                      <span>{editingProduct ? 'Save Changes' : 'Create Product'}</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* DEACTIVATION CONFIRMATION DIALOG                              */}
      {/* ============================================================ */}
      {deactivatingProduct && (
        <div
          className="modal-backdrop"
          onClick={() => !isTogglingStatus && setDeactivatingProduct(null)}
        >
          <div
            className="modal-card deactivation-dialog-card"
            onClick={(e) => e.stopPropagation()}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="deactivate-dialog-title"
          >
            <div className="deactivate-dialog-header">
              <div className="dialog-warning-icon">
                <IconAlertTriangle size={24} />
              </div>
              <div>
                <h3 id="deactivate-dialog-title" className="dialog-title">
                  Deactivate Product?
                </h3>
                <p className="dialog-subtitle">
                  This product will be hidden from the active POS billing counter.
                </p>
              </div>
            </div>

            <div className="deactivate-product-summary">
              <div className="summary-row">
                <span className="summary-label">Product Name:</span>
                <strong className="summary-val">{deactivatingProduct.name}</strong>
              </div>
              <div className="summary-row">
                <span className="summary-label">Item Code:</span>
                <span className="product-code-pill">{deactivatingProduct.code}</span>
              </div>
              <div className="summary-row">
                <span className="summary-label">Category:</span>
                <span className="summary-val">{deactivatingProduct.category}</span>
              </div>
              <div className="summary-row">
                <span className="summary-label">Selling Price:</span>
                <span className="summary-val text-bold">
                  {formatLKR(deactivatingProduct.price)}
                </span>
              </div>
            </div>

            <p className="deactivate-explanation">
              Existing sales records and historical bills will remain intact. You can reactivate
              this item at any time from the Menu Management screen by filtering for Inactive items.
            </p>

            <div
              className="dialog-demo-note"
              style={{
                backgroundColor: '#f0fdf4',
                borderColor: '#bbf7d0',
                color: '#166534'
              }}
            >
              <IconInfo size={13} />
              <span>
                DATABASE UPDATE: The item status will be set to inactive in MongoDB Atlas.
              </span>
            </div>

            <div className="deactivate-actions">
              <button
                type="button"
                className="btn-action btn-action-outline"
                onClick={() => setDeactivatingProduct(null)}
                disabled={isTogglingStatus}
              >
                Keep Active
              </button>
              <button
                type="button"
                className="btn-action btn-action-danger"
                onClick={handleConfirmDeactivate}
                disabled={isTogglingStatus}
              >
                {isTogglingStatus ? (
                  <>
                    <IconRotateCcw size={14} style={{ animation: 'spin 1s linear infinite' }} />
                    <span>Updating Database...</span>
                  </>
                ) : (
                  <>
                    <IconPower size={14} />
                    <span>Confirm Deactivation</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
