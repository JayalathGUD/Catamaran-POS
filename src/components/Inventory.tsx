import React, { useEffect, useMemo, useState } from 'react'
import { formatLKR } from '../data/demoData'
import {
  deleteInventoryItem,
  getInventoryItems,
  getStockMovements,
  recordStockMovement,
  updateInventoryItemStatus
} from '../services/api'
import {
  InventoryItem,
  NavigationPage,
  StockMovement,
  StockMovementType,
  StockStatus
} from '../types'
import {
  IconAlertTriangle,
  IconBox,
  IconCheck,
  IconChevronRight,
  IconClock,
  IconCoffee,
  IconEdit,
  IconHistory,
  IconInfo,
  IconMinus,
  IconPlus,
  IconPower,
  IconReceipt,
  IconRotateCcw,
  IconSearch,
  IconSliders,
  IconSparkles,
  IconTrash,
  IconTruck,
  IconX
} from './Icons'

interface InventoryProps {
  onNavigate: (page: NavigationPage) => void
}

type InventoryTab = 'stock' | 'movements'

interface PurchaseFormData {
  productId: string
  quantity: string
  unitCost: string
  supplier: string
  reference: string
  date: string
  notes: string
}

interface AdjustmentFormData {
  productId: string
  type: 'Increase' | 'Decrease'
  quantity: string
  reason: string
  notes: string
}

interface WastageFormData {
  productId: string
  quantity: string
  reason: string
  date: string
  notes: string
  confirmed: boolean
}

const FALLBACK_INVENTORY_ITEM: InventoryItem = {
  id: '',
  productId: '',
  productName: 'No Item Selected',
  category: 'Drinks',
  code: '-',
  currentQuantity: 0,
  reorderThreshold: 0,
  unit: 'Units',
  unitCost: 0,
  sellingPrice: 0
}

export const Inventory: React.FC<InventoryProps> = ({ onNavigate }) => {
  // Live state for inventory items from MongoDB Atlas
  const [items, setItems] = useState<InventoryItem[]>([])

  // Live state for stock movements from MongoDB Atlas
  const [movements, setMovements] = useState<StockMovement[]>([])

  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [isSaving, setIsSaving] = useState<boolean>(false)

  // Active Tab
  const [activeTab, setActiveTab] = useState<InventoryTab>('stock')

  // Stock Table Filters
  const [stockSearch, setStockSearch] = useState<string>('')
  const [categoryFilter, setCategoryFilter] = useState<'All' | 'Drinks' | 'Other Services'>('All')
  const [statusFilter, setStatusFilter] = useState<'All' | StockStatus>('All')
  const [activeStatusFilter, setActiveStatusFilter] = useState<'All' | 'Active' | 'Archived'>('Active')

  // Stock Table Sorting
  const [stockSortField, setStockSortField] = useState<
    'name' | 'quantity' | 'threshold' | 'cost' | 'value' | 'status'
  >('status')
  const [stockSortOrder, setStockSortOrder] = useState<'asc' | 'desc'>('asc')

  // Action/Delete Modal State
  const [itemForAction, setItemForAction] = useState<InventoryItem | null>(null)
  const [actionModalType, setActionModalType] = useState<'manage' | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<boolean>(false)

  // Movement Log Filters
  const [movementSearch, setMovementSearch] = useState<string>('')
  const [movementTypeFilter, setMovementTypeFilter] = useState<'All' | StockMovementType>('All')
  const [movementProductFilter, setMovementProductFilter] = useState<string>('All')

  // Modals state
  const [isPurchaseModalOpen, setIsPurchaseModalOpen] = useState<boolean>(false)
  const [purchaseForm, setPurchaseForm] = useState<PurchaseFormData>({
    productId: '',
    quantity: '10',
    unitCost: '0',
    supplier: '',
    reference: 'PO-2026-092',
    date: new Date().toISOString().split('T')[0],
    notes: ''
  })
  const [purchaseErrors, setPurchaseErrors] = useState<Record<string, string>>({})

  const [isAdjustmentModalOpen, setIsAdjustmentModalOpen] = useState<boolean>(false)
  const [adjustmentForm, setAdjustmentForm] = useState<AdjustmentFormData>({
    productId: '',
    type: 'Increase',
    quantity: '1',
    reason: 'Physical count discrepancy',
    notes: ''
  })
  const [adjustmentErrors, setAdjustmentErrors] = useState<Record<string, string>>({})

  const [isWastageModalOpen, setIsWastageModalOpen] = useState<boolean>(false)
  const [wastageForm, setWastageForm] = useState<WastageFormData>({
    productId: '',
    quantity: '1',
    reason: 'Expired / spoiled',
    date: new Date().toISOString().split('T')[0],
    notes: '',
    confirmed: false
  })
  const [wastageErrors, setWastageErrors] = useState<Record<string, string>>({})

  // Toast Notification
  const [toast, setToast] = useState<string | null>(null)

  const showToast = (message: string): void => {
    setToast(message)
    setTimeout(() => {
      setToast((curr) => (curr === message ? null : curr))
    }, 4500)
  }

  // Load inventory items and stock movements from MongoDB Atlas
  const loadData = async (): Promise<void> => {
    try {
      setIsLoading(true)
      const [invData, movData] = await Promise.all([
        getInventoryItems({ status: 'all', includeArchived: true }),
        getStockMovements()
      ])
      setItems(invData)
      setMovements(movData)
    } catch (err: unknown) {
      console.error('Failed to load inventory data:', err)
      const msg = err instanceof Error ? err.message : 'Failed to connect to Inventory API'
      showToast(`Database error: ${msg}`)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    let ignore = false
    async function initLoad(): Promise<void> {
      try {
        setIsLoading(true)
        const [invData, movData] = await Promise.all([
          getInventoryItems({ status: 'all', includeArchived: true }),
          getStockMovements()
        ])
        if (!ignore) {
          setItems(invData)
          setMovements(movData)
        }
      } catch (err: unknown) {
        if (!ignore) {
          console.error('Failed to load inventory data:', err)
          const msg = err instanceof Error ? err.message : 'Failed to connect to Inventory API'
          showToast(`Database error: ${msg}`)
        }
      } finally {
        if (!ignore) {
          setIsLoading(false)
        }
      }
    }
    initLoad()
    return () => {
      ignore = true
    }
  }, [])

  const handleConfirmDelete = async (item: InventoryItem): Promise<void> => {
    setActionLoading(true)
    setActionError(null)
    try {
      const res = await deleteInventoryItem(item.id)
      showToast(res.message || `Deleted "${item.productName}"`)
      setItemForAction(null)
      setActionModalType(null)
      await loadData()
    } catch (err: unknown) {
      console.error('Failed to delete item:', err)
      const msg = err instanceof Error ? err.message : 'Failed to delete inventory item'
      setActionError(msg)
      showToast(msg)
    } finally {
      setActionLoading(false)
    }
  }

  const handleArchiveToggle = async (item: InventoryItem, archive: boolean): Promise<void> => {
    setActionLoading(true)
    setActionError(null)
    try {
      await updateInventoryItemStatus(item.id, { isArchived: archive, isActive: !archive })
      showToast(`"${item.productName}" has been ${archive ? 'archived' : 'reactivated'}.`)
      setItemForAction(null)
      setActionModalType(null)
      await loadData()
    } catch (err: unknown) {
      console.error('Failed to update item status:', err)
      const msg = err instanceof Error ? err.message : 'Failed to update item status'
      setActionError(msg)
      showToast(msg)
    } finally {
      setActionLoading(false)
    }
  }

  // Stock Status Helper
  const getItemStatus = (quantity: number, threshold: number): StockStatus => {
    if (quantity === 0) return 'Out of Stock'
    if (quantity <= threshold) return 'Low Stock'
    return 'In Stock'
  }

  // Summary Metrics Calculation (based on active items)
  const metrics = useMemo(() => {
    const activeItems = items.filter((item) => !item.isArchived && item.isActive !== false)
    const totalTracked = activeItems.length
    const lowStockCount = activeItems.filter(
      (item) => item.currentQuantity > 0 && item.currentQuantity <= item.reorderThreshold
    ).length
    const outOfStockCount = activeItems.filter((item) => item.currentQuantity === 0).length
    const inStockCount = totalTracked - lowStockCount - outOfStockCount

    const totalValuation = activeItems.reduce(
      (acc, item) => acc + item.currentQuantity * item.unitCost,
      0
    )
    const totalRetailValue = activeItems.reduce(
      (acc, item) => acc + item.currentQuantity * item.sellingPrice,
      0
    )

    return {
      totalTracked,
      lowStockCount,
      outOfStockCount,
      inStockCount,
      totalValuation,
      totalRetailValue
    }
  }, [items])

  // Filtered & Sorted Stock Items
  const filteredStockItems = useMemo(() => {
    return items
      .filter((item) => {
        // Active / Archived filter
        if (activeStatusFilter === 'Active' && (item.isArchived || item.isActive === false)) {
          return false
        }
        if (activeStatusFilter === 'Archived' && !item.isArchived && item.isActive !== false) {
          return false
        }

        // Search
        if (stockSearch.trim()) {
          const q = stockSearch.toLowerCase().trim()
          const matchName = item.productName.toLowerCase().includes(q)
          const matchCode = item.code.toLowerCase().includes(q)
          const matchSupplier = item.supplier ? item.supplier.toLowerCase().includes(q) : false
          if (!matchName && !matchCode && !matchSupplier) return false
        }

        // Category
        if (categoryFilter !== 'All' && item.category !== categoryFilter) {
          return false
        }

        // Status
        const status = getItemStatus(item.currentQuantity, item.reorderThreshold)
        if (statusFilter !== 'All' && status !== statusFilter) {
          return false
        }

        return true
      })
      .sort((a, b) => {
        let cmp = 0
        if (stockSortField === 'name') {
          cmp = a.productName.localeCompare(b.productName)
        } else if (stockSortField === 'quantity') {
          cmp = a.currentQuantity - b.currentQuantity
        } else if (stockSortField === 'threshold') {
          cmp = a.reorderThreshold - b.reorderThreshold
        } else if (stockSortField === 'cost') {
          cmp = a.unitCost - b.unitCost
        } else if (stockSortField === 'value') {
          cmp = a.currentQuantity * a.unitCost - b.currentQuantity * b.unitCost
        } else if (stockSortField === 'status') {
          // Out of Stock (0) -> Low Stock (1) -> In Stock (2)
          const rank = (it: InventoryItem): number => {
            if (it.currentQuantity === 0) return 0
            if (it.currentQuantity <= it.reorderThreshold) return 1
            return 2
          }
          cmp = rank(a) - rank(b)
        }
        return stockSortOrder === 'asc' ? cmp : -cmp
      })
  }, [items, stockSearch, categoryFilter, statusFilter, stockSortField, stockSortOrder])

  // Filtered Movements
  const filteredMovements = useMemo(() => {
    return movements.filter((mov) => {
      if (movementSearch.trim()) {
        const q = movementSearch.toLowerCase().trim()
        const matchProd = mov.productName.toLowerCase().includes(q)
        const matchCode = mov.productCode.toLowerCase().includes(q)
        const matchReason = mov.reason.toLowerCase().includes(q)
        const matchUser = mov.performedBy.toLowerCase().includes(q)
        if (!matchProd && !matchCode && !matchReason && !matchUser) return false
      }

      if (movementTypeFilter !== 'All' && mov.type !== movementTypeFilter) {
        return false
      }

      if (movementProductFilter !== 'All' && mov.productId !== movementProductFilter) {
        return false
      }

      return true
    })
  }, [movements, movementSearch, movementTypeFilter, movementProductFilter])

  const handleStockSort = (
    field: 'name' | 'quantity' | 'threshold' | 'cost' | 'value' | 'status'
  ): void => {
    if (stockSortField === field) {
      setStockSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setStockSortField(field)
      setStockSortOrder('asc')
    }
  }

  const handleResetStockFilters = (): void => {
    setStockSearch('')
    setCategoryFilter('All')
    setStatusFilter('All')
    setActiveStatusFilter('Active')
    showToast('Stock view filters reset to default.')
  }

  const handleResetMovementFilters = (): void => {
    setMovementSearch('')
    setMovementTypeFilter('All')
    setMovementProductFilter('All')
    showToast('Movement history filters reset to default.')
  }

  // Quick Action Modal Openers with Pre-selection
  const openPurchaseModal = (targetProductId?: string): void => {
    if (items.length === 0) {
      showToast(
        'No inventory items found. Add products with Stock Tracking in Menu Management first.'
      )
      return
    }
    const selectedProd = targetProductId
      ? items.find((i) => i.productId === targetProductId) || items[0]
      : items[0]

    setPurchaseForm({
      productId: selectedProd.productId,
      quantity: '20',
      unitCost: String(selectedProd.unitCost),
      supplier: selectedProd.supplier || '',
      reference: `PO-2026-${Date.now().toString().slice(-3)}`,
      date: new Date().toISOString().split('T')[0],
      notes: ''
    })
    setPurchaseErrors({})
    setIsPurchaseModalOpen(true)
  }

  const openAdjustmentModal = (targetProductId?: string): void => {
    if (items.length === 0) {
      showToast(
        'No inventory items found. Add products with Stock Tracking in Menu Management first.'
      )
      return
    }
    const selectedProd = targetProductId
      ? items.find((i) => i.productId === targetProductId) || items[0]
      : items[0]

    setAdjustmentForm({
      productId: selectedProd.productId,
      type: 'Increase',
      quantity: '1',
      reason: 'Physical count discrepancy',
      notes: ''
    })
    setAdjustmentErrors({})
    setIsAdjustmentModalOpen(true)
  }

  const openWastageModal = (targetProductId?: string): void => {
    if (items.length === 0) {
      showToast(
        'No inventory items found. Add products with Stock Tracking in Menu Management first.'
      )
      return
    }
    const selectedProd = targetProductId
      ? items.find((i) => i.productId === targetProductId) || items[0]
      : items[0]

    setWastageForm({
      productId: selectedProd.productId,
      quantity: '1',
      reason: 'Expired / spoiled',
      date: new Date().toISOString().split('T')[0],
      notes: '',
      confirmed: false
    })
    setWastageErrors({})
    setIsWastageModalOpen(true)
  }

  // Handle Purchase Submission to MongoDB Atlas
  const handleSavePurchase = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()

    const errors: Record<string, string> = {}
    const qty = parseInt(purchaseForm.quantity, 10)
    const cost = parseFloat(purchaseForm.unitCost)

    if (isNaN(qty) || qty <= 0) {
      errors.quantity = 'Quantity received must be a positive integer (> 0)'
    }
    if (isNaN(cost) || cost < 0) {
      errors.unitCost = 'Unit cost cannot be negative'
    }
    if (!purchaseForm.date) {
      errors.date = 'Purchase date is required'
    }

    if (Object.keys(errors).length > 0) {
      setPurchaseErrors(errors)
      return
    }

    const targetItem = items.find((i) => i.productId === purchaseForm.productId)
    if (!targetItem) return

    try {
      setIsSaving(true)
      const res = await recordStockMovement({
        itemId: targetItem.productId,
        type: 'Purchase',
        quantityChange: qty,
        unitCost: cost > 0 ? cost : targetItem.unitCost,
        reason: purchaseForm.reference.trim()
          ? `${purchaseForm.reference.trim()} (${purchaseForm.supplier.trim() || 'Direct Supplier'})`
          : 'Stock Purchase Delivery',
        performedBy: 'Store Manager',
        notes: purchaseForm.notes.trim() || undefined
      })

      // Update state with server response
      setItems((prev) =>
        prev.map((i) =>
          i.productId === targetItem.productId
            ? {
                ...i,
                currentQuantity: res.item.currentQuantity,
                unitCost: cost > 0 ? cost : i.unitCost,
                supplier: purchaseForm.supplier.trim() || i.supplier,
                lastRestockedAt: purchaseForm.date
              }
            : i
        )
      )
      setMovements((prev) => [res.movement, ...prev])
      setIsPurchaseModalOpen(false)
      showToast(
        `Received +${qty} ${targetItem.unit} of "${targetItem.productName}". Saved to MongoDB Atlas.`
      )
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to record purchase'
      showToast(`Error: ${msg}`)
    } finally {
      setIsSaving(false)
    }
  }

  // Handle Adjustment Submission to MongoDB Atlas
  const handleSaveAdjustment = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()

    const errors: Record<string, string> = {}
    const qty = parseInt(adjustmentForm.quantity, 10)
    const targetItem = items.find((i) => i.productId === adjustmentForm.productId)

    if (!targetItem) return

    if (isNaN(qty) || qty <= 0) {
      errors.quantity = 'Adjustment quantity must be greater than zero'
    } else if (adjustmentForm.type === 'Decrease' && qty > targetItem.currentQuantity) {
      errors.quantity = `Cannot decrease by ${qty}. Current stock is only ${targetItem.currentQuantity} ${targetItem.unit}.`
    }

    if (!adjustmentForm.reason.trim()) {
      errors.reason = 'Please select or provide an adjustment reason'
    }

    if (Object.keys(errors).length > 0) {
      setAdjustmentErrors(errors)
      return
    }

    const delta = adjustmentForm.type === 'Increase' ? qty : -qty

    try {
      setIsSaving(true)
      const res = await recordStockMovement({
        itemId: targetItem.productId,
        type: 'Adjustment',
        quantityChange: delta,
        reason: `${adjustmentForm.reason} (${adjustmentForm.type})`,
        performedBy: 'Shift Supervisor Audit',
        notes: adjustmentForm.notes.trim() || undefined
      })

      setItems((prev) =>
        prev.map((i) =>
          i.productId === targetItem.productId
            ? { ...i, currentQuantity: res.item.currentQuantity }
            : i
        )
      )
      setMovements((prev) => [res.movement, ...prev])
      setIsAdjustmentModalOpen(false)
      showToast(
        `Stock adjusted by ${delta > 0 ? '+' : ''}${delta} ${targetItem.unit} for "${targetItem.productName}". Saved to MongoDB Atlas.`
      )
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to record adjustment'
      showToast(`Error: ${msg}`)
    } finally {
      setIsSaving(false)
    }
  }

  // Handle Wastage Submission to MongoDB Atlas
  const handleSaveWastage = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()

    const errors: Record<string, string> = {}
    const qty = parseInt(wastageForm.quantity, 10)
    const targetItem = items.find((i) => i.productId === wastageForm.productId)

    if (!targetItem) return

    if (isNaN(qty) || qty <= 0) {
      errors.quantity = 'Wastage quantity must be greater than zero'
    } else if (qty > targetItem.currentQuantity) {
      errors.quantity = `Wastage (${qty}) cannot exceed current stock of ${targetItem.currentQuantity} ${targetItem.unit}.`
    }

    if (!wastageForm.confirmed) {
      errors.confirmed = 'Please confirm the stock write-off checkbox before proceeding.'
    }

    if (Object.keys(errors).length > 0) {
      setWastageErrors(errors)
      return
    }

    try {
      setIsSaving(true)
      const res = await recordStockMovement({
        itemId: targetItem.productId,
        type: 'Wastage',
        quantityChange: -qty,
        unitCost: targetItem.unitCost,
        reason: wastageForm.reason,
        performedBy: 'Kasun (Bar / Inventory Supervisor)',
        notes: wastageForm.notes.trim() || undefined
      })

      setItems((prev) =>
        prev.map((i) =>
          i.productId === targetItem.productId
            ? { ...i, currentQuantity: res.item.currentQuantity }
            : i
        )
      )
      setMovements((prev) => [res.movement, ...prev])
      setIsWastageModalOpen(false)
      showToast(
        `Recorded wastage of ${qty} ${targetItem.unit} for "${targetItem.productName}". Saved to MongoDB Atlas.`
      )
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to record wastage'
      showToast(`Error: ${msg}`)
    } finally {
      setIsSaving(false)
    }
  }

  // Selected item in Purchase Modal (for dynamic cost update)
  const currentPurchaseTarget = useMemo(() => {
    return (
      items.find((i) => i.productId === purchaseForm.productId) ||
      items[0] ||
      FALLBACK_INVENTORY_ITEM
    )
  }, [items, purchaseForm.productId])

  // Selected item in Adjustment Modal
  const currentAdjustmentTarget = useMemo(() => {
    return (
      items.find((i) => i.productId === adjustmentForm.productId) ||
      items[0] ||
      FALLBACK_INVENTORY_ITEM
    )
  }, [items, adjustmentForm.productId])

  // Selected item in Wastage Modal
  const currentWastageTarget = useMemo(() => {
    return (
      items.find((i) => i.productId === wastageForm.productId) ||
      items[0] ||
      FALLBACK_INVENTORY_ITEM
    )
  }, [items, wastageForm.productId])

  return (
    <div className="inventory-container">
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
      <section className="inventory-header">
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
            <span className="pos-kicker">Stock & Warehouse Control</span>
            <div className="demo-notice-badge">
              <span className="demo-pulse-dot" style={{ backgroundColor: '#10b981' }} />
              <span>MONGODB ATLAS · LIVE INVENTORY</span>
            </div>
          </div>
          <h1 className="dashboard-heading">Inventory Management</h1>
          <p className="dashboard-subheading">
            Monitor physical stock quantities, receive supplier purchases, record adjustments, and
            audit wastage
          </p>
        </div>

        {/* Action Buttons */}
        <div className="header-quick-actions">
          <button
            type="button"
            className="btn-action btn-action-outline"
            onClick={() => openAdjustmentModal()}
            title="Perform manual audit recount"
            disabled={isLoading || isSaving}
          >
            <IconSliders size={15} />
            <span>Adjust Stock</span>
          </button>
          <button
            type="button"
            className="btn-action btn-action-outline btn-outline-danger"
            onClick={() => openWastageModal()}
            title="Log spoiled, expired, or damaged items"
            disabled={isLoading || isSaving}
          >
            <IconTrash size={15} />
            <span>Log Wastage</span>
          </button>
          <button
            type="button"
            className="btn-action btn-action-primary"
            onClick={() => openPurchaseModal()}
            title="Receive delivery from supplier"
            disabled={isLoading || isSaving}
          >
            <IconTruck size={16} />
            <span>Receive Purchase</span>
          </button>
          <button
            type="button"
            className="btn-action btn-action-outline"
            onClick={loadData}
            title="Sync inventory with MongoDB Atlas"
            disabled={isLoading}
          >
            <IconRotateCcw size={15} />
            <span>{isLoading ? 'Syncing...' : 'Refresh'}</span>
          </button>
        </div>
      </section>

      {/* Business Rules & Inventory Scope Guidance */}
      <section className="inventory-rules-banner" aria-label="Business Rules">
        <div className="rules-banner-icon">
          <IconInfo size={18} />
        </div>
        <div className="rules-banner-content">
          <div className="rules-banner-title">
            <strong>Catamaran Surf Club Inventory Scope & Rules:</strong>
          </div>
          <div className="rules-banner-items">
            <span className="rules-pill">
              <strong>Stock-Tracked Goods Only:</strong> Physical bar and retail items (Fresh King
              Coconut, Mineral Water, Surf Wax, Leashes, Sunblock, Rashguards).
            </span>
            <span className="rules-pill">
              <strong>Surf Lessons Excluded:</strong> Lessons are billable coaching sessions without
              inventory quantities.
            </span>
            <span className="rules-pill">
              <strong>Surfboard Fleet:</strong> Managed exclusively on the Surfboard Rentals screen
              with real-time return timers.
            </span>
            <span className="rules-pill">
              <strong>No Ingredient Tracking:</strong> Simple product-level counts; cafe dishes do
              not deduct raw kitchen recipes.
            </span>
          </div>
        </div>
      </section>

      {/* Overview KPI Cards */}
      <section className="inventory-metrics-grid">
        <div className="inv-metric-card">
          <div className="metric-header">
            <span className="metric-label">Tracked Products</span>
            <span className="metric-icon-wrap icon-teal">
              <IconBox size={16} />
            </span>
          </div>
          <div className="metric-value-row">
            <span className="metric-number">{metrics.totalTracked}</span>
            <span className="metric-subtext">{metrics.inStockCount} healthy stock</span>
          </div>
        </div>

        <div className="inv-metric-card">
          <div className="metric-header">
            <span className="metric-label">Low Stock Alerts</span>
            <span className="metric-icon-wrap icon-amber">
              <IconAlertTriangle size={16} />
            </span>
          </div>
          <div className="metric-value-row">
            <span className="metric-number text-amber">{metrics.lowStockCount}</span>
            <span className="metric-tag tag-warning">Below Threshold</span>
          </div>
        </div>

        <div className="inv-metric-card">
          <div className="metric-header">
            <span className="metric-label">Out of Stock</span>
            <span className="metric-icon-wrap icon-rose">
              <IconX size={16} />
            </span>
          </div>
          <div className="metric-value-row">
            <span className="metric-number text-danger">{metrics.outOfStockCount}</span>
            <span className="metric-tag tag-danger">Restock Needed</span>
          </div>
        </div>

        <div className="inv-metric-card">
          <div className="metric-header">
            <span className="metric-label">Stock Valuation (Cost)</span>
            <span className="metric-icon-wrap icon-teal">
              <IconCheck size={16} />
            </span>
          </div>
          <div className="metric-value-row">
            <span className="metric-number text-primary">{formatLKR(metrics.totalValuation)}</span>
            <span className="metric-subtext">Est. COGS on hand</span>
          </div>
        </div>

        <div className="inv-metric-card">
          <div className="metric-header">
            <span className="metric-label">Potential Sales Value</span>
            <span className="metric-icon-wrap icon-blue">
              <IconSparkles size={16} />
            </span>
          </div>
          <div className="metric-value-row">
            <span className="metric-number text-teal">{formatLKR(metrics.totalRetailValue)}</span>
            <span className="metric-subtext">At retail prices</span>
          </div>
        </div>
      </section>

      {/* Main Workspace Card with Tabs */}
      <section className="inventory-main-card">
        {/* Navigation Tabs */}
        <div className="inventory-tabs-row">
          <button
            type="button"
            className={`inv-tab-btn ${activeTab === 'stock' ? 'active' : ''}`}
            onClick={() => setActiveTab('stock')}
          >
            <IconBox size={15} />
            <span>Current Stock Levels</span>
            <span className="tab-badge">{items.length}</span>
          </button>

          <button
            type="button"
            className={`inv-tab-btn ${activeTab === 'movements' ? 'active' : ''}`}
            onClick={() => setActiveTab('movements')}
          >
            <IconHistory size={15} />
            <span>Stock Movement Log</span>
            <span className="tab-badge">{movements.length}</span>
          </button>
        </div>

        {/* ============================================================ */}
        {/* TAB 1: CURRENT STOCK TABLE                                    */}
        {/* ============================================================ */}
        {activeTab === 'stock' && (
          <div className="tab-content-area">
            {/* Filter Bar */}
            <div className="inventory-filter-bar">
              {/* Search Box */}
              <div className="inv-search-box">
                <IconSearch size={16} className="search-icon" />
                <input
                  type="text"
                  placeholder="Search item name, code (D01, S03), or supplier..."
                  value={stockSearch}
                  onChange={(e) => setStockSearch(e.target.value)}
                  className="inv-search-input"
                />
                {stockSearch && (
                  <button
                    type="button"
                    className="search-clear-btn"
                    onClick={() => setStockSearch('')}
                    title="Clear search"
                  >
                    <IconX size={14} />
                  </button>
                )}
              </div>

              {/* Category Filter */}
              <div className="inv-filter-group">
                <label htmlFor="cat-filter" className="filter-label">
                  Category:
                </label>
                <select
                  id="cat-filter"
                  className="inv-select"
                  value={categoryFilter}
                  onChange={(e) =>
                    setCategoryFilter(e.target.value as 'All' | 'Drinks' | 'Other Services')
                  }
                >
                  <option value="All">All Categories</option>
                  <option value="Drinks">Drinks</option>
                  <option value="Other Services">Other Services (Retail)</option>
                </select>
              </div>

              {/* Status Filter */}
              <div className="inv-filter-group">
                <label htmlFor="status-filter" className="filter-label">
                  Stock Status:
                </label>
                <select
                  id="status-filter"
                  className="inv-select"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as 'All' | StockStatus)}
                >
                  <option value="All">All Statuses</option>
                  <option value="In Stock">In Stock</option>
                  <option value="Low Stock">Low Stock Alert</option>
                  <option value="Out of Stock">Out of Stock</option>
                </select>
              </div>

              {/* Record Lifecycle Filter */}
              <div className="inv-filter-group">
                <label htmlFor="record-lifecycle-filter" className="filter-label">
                  Record Filter:
                </label>
                <select
                  id="record-lifecycle-filter"
                  className="inv-select"
                  value={activeStatusFilter}
                  onChange={(e) =>
                    setActiveStatusFilter(e.target.value as 'All' | 'Active' | 'Archived')
                  }
                >
                  <option value="Active">Active Only</option>
                  <option value="Archived">Archived Only</option>
                  <option value="All">All Records</option>
                </select>
              </div>

              {/* Reset Filters */}
              {(stockSearch ||
                categoryFilter !== 'All' ||
                statusFilter !== 'All' ||
                activeStatusFilter !== 'Active') && (
                <button
                  type="button"
                  className="btn-action btn-action-outline btn-sm"
                  onClick={handleResetStockFilters}
                  title="Reset filters"
                >
                  <IconRotateCcw size={13} />
                  <span>Reset</span>
                </button>
              )}

              <div className="inv-count-indicator">
                Showing <strong>{filteredStockItems.length}</strong> of {items.length} tracked items
              </div>
            </div>

            {/* Current Stock Table */}
            <div className="inv-table-wrapper">
              <table className="inv-table">
                <thead>
                  <tr>
                    <th
                      className="th-sortable col-product"
                      onClick={() => handleStockSort('name')}
                      title="Sort by Product Name"
                    >
                      <div className="th-content">
                        <span>Product Name & SKU</span>
                        {stockSortField === 'name' && (
                          <span className="sort-arrow">{stockSortOrder === 'asc' ? '↑' : '↓'}</span>
                        )}
                      </div>
                    </th>
                    <th className="col-category">Category</th>
                    <th
                      className="th-sortable col-numeric"
                      onClick={() => handleStockSort('quantity')}
                      title="Sort by Current Quantity"
                    >
                      <div className="th-content th-right">
                        <span>Current Stock</span>
                        {stockSortField === 'quantity' && (
                          <span className="sort-arrow">{stockSortOrder === 'asc' ? '↑' : '↓'}</span>
                        )}
                      </div>
                    </th>
                    <th
                      className="th-sortable col-numeric"
                      onClick={() => handleStockSort('threshold')}
                      title="Sort by Reorder Threshold"
                    >
                      <div className="th-content th-right">
                        <span>Reorder Point</span>
                        {stockSortField === 'threshold' && (
                          <span className="sort-arrow">{stockSortOrder === 'asc' ? '↑' : '↓'}</span>
                        )}
                      </div>
                    </th>
                    <th
                      className="th-sortable col-numeric"
                      onClick={() => handleStockSort('cost')}
                      title="Sort by Unit Cost"
                    >
                      <div className="th-content th-right">
                        <span>Unit Cost</span>
                        {stockSortField === 'cost' && (
                          <span className="sort-arrow">{stockSortOrder === 'asc' ? '↑' : '↓'}</span>
                        )}
                      </div>
                    </th>
                    <th
                      className="th-sortable col-numeric"
                      onClick={() => handleStockSort('value')}
                      title="Sort by Stock Valuation"
                    >
                      <div className="th-content th-right">
                        <span>Est. Stock Value</span>
                        {stockSortField === 'value' && (
                          <span className="sort-arrow">{stockSortOrder === 'asc' ? '↑' : '↓'}</span>
                        )}
                      </div>
                    </th>
                    <th
                      className="th-sortable col-status"
                      onClick={() => handleStockSort('status')}
                      title="Sort by Status"
                    >
                      <div className="th-content">
                        <span>Stock Status</span>
                        {stockSortField === 'status' && (
                          <span className="sort-arrow">{stockSortOrder === 'asc' ? '↑' : '↓'}</span>
                        )}
                      </div>
                    </th>
                    <th className="col-actions th-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStockItems.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="inv-table-empty">
                        <div className="empty-state-box">
                          <div className="empty-state-icon">
                            <IconBox size={32} />
                          </div>
                          <h3 className="empty-state-title">No matching inventory items</h3>
                          <p className="empty-state-desc">
                            Adjust your search terms or filter selection.
                          </p>
                          <button
                            type="button"
                            className="btn-action btn-action-outline btn-sm"
                            onClick={handleResetStockFilters}
                          >
                            <IconRotateCcw size={13} />
                            <span>Clear Filters</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredStockItems.map((item) => {
                      const status = getItemStatus(item.currentQuantity, item.reorderThreshold)
                      const stockValue = item.currentQuantity * item.unitCost

                      return (
                        <tr
                          key={item.id}
                          className={`inv-row ${
                            status === 'Out of Stock'
                              ? 'row-out-of-stock'
                              : status === 'Low Stock'
                                ? 'row-low-stock'
                                : ''
                          }`}
                        >
                          {/* Product Identity */}
                          <td className="col-product">
                            <div className="product-identity">
                              <div className="product-title-line">
                                <span className="product-name">{item.productName}</span>
                                <span className="product-code-pill">{item.code}</span>
                              </div>
                              {item.supplier && (
                                <div className="product-supplier-snippet">
                                  <span>Supplier: {item.supplier}</span>
                                </div>
                              )}
                            </div>
                          </td>

                          {/* Category */}
                          <td className="col-category">
                            <span
                              className={`category-pill cat-${item.category
                                .toLowerCase()
                                .replace(/\s+/g, '-')}`}
                            >
                              {item.category === 'Drinks' ? (
                                <IconCoffee size={12} />
                              ) : (
                                <IconSparkles size={12} />
                              )}
                              <span>{item.category}</span>
                            </span>
                          </td>

                          {/* Current Stock */}
                          <td className="col-numeric text-right">
                            <div className="stock-qty-cell">
                              <span
                                className={`stock-qty-num ${
                                  item.currentQuantity === 0
                                    ? 'qty-zero'
                                    : item.currentQuantity <= item.reorderThreshold
                                      ? 'qty-low'
                                      : 'qty-healthy'
                                }`}
                              >
                                {item.currentQuantity}
                              </span>
                              <span className="stock-unit-label">{item.unit}</span>
                            </div>
                          </td>

                          {/* Reorder Point */}
                          <td className="col-numeric text-right">
                            <span className="threshold-val">
                              {item.reorderThreshold} {item.unit}
                            </span>
                          </td>

                          {/* Unit Cost */}
                          <td className="col-numeric text-right">
                            <span className="unit-cost-val">{formatLKR(item.unitCost)}</span>
                          </td>

                          {/* Est. Stock Value */}
                          <td className="col-numeric text-right">
                            <span className="stock-value-val">{formatLKR(stockValue)}</span>
                          </td>

                          {/* Status Badge */}
                          <td className="col-status">
                            {item.isArchived || item.isActive === false ? (
                              <span
                                className="status-badge"
                                style={{
                                  backgroundColor: '#f3f4f6',
                                  color: '#4b5563',
                                  border: '1px solid #d1d5db'
                                }}
                              >
                                <span
                                  className="status-dot"
                                  style={{ backgroundColor: '#9ca3af' }}
                                />
                                <span>Archived</span>
                              </span>
                            ) : (
                              <>
                                {status === 'In Stock' && (
                                  <span className="status-badge status-active">
                                    <span className="status-dot green" />
                                    <span>In Stock</span>
                                  </span>
                                )}
                                {status === 'Low Stock' && (
                                  <span className="status-badge status-warning">
                                    <span className="status-dot amber" />
                                    <span>Low Stock</span>
                                  </span>
                                )}
                                {status === 'Out of Stock' && (
                                  <span className="status-badge status-danger">
                                    <span className="status-dot red" />
                                    <span>Out of Stock</span>
                                  </span>
                                )}
                              </>
                            )}
                          </td>

                          {/* Actions */}
                          <td className="col-actions text-right">
                            <div className="action-buttons-group">
                              {!item.isArchived && item.isActive !== false ? (
                                <>
                                  <button
                                    type="button"
                                    className="btn-icon-action btn-icon-purchase"
                                    onClick={() => openPurchaseModal(item.productId)}
                                    title={`Receive purchase delivery for ${item.productName}`}
                                  >
                                    <IconTruck size={13} />
                                    <span>Receive</span>
                                  </button>
                                  <button
                                    type="button"
                                    className="btn-icon-action"
                                    onClick={() => openAdjustmentModal(item.productId)}
                                    title={`Adjust stock recount for ${item.productName}`}
                                  >
                                    <IconSliders size={13} />
                                    <span>Adjust</span>
                                  </button>
                                  <button
                                    type="button"
                                    className="btn-icon-action"
                                    onClick={() => openWastageModal(item.productId)}
                                    title={`Record damaged or expired stock for ${item.productName}`}
                                  >
                                    <IconAlertTriangle size={13} />
                                    <span>Wastage</span>
                                  </button>
                                  <button
                                    type="button"
                                    className="btn-icon-action btn-icon-deactivate"
                                    onClick={() => {
                                      setItemForAction(item)
                                      setActionModalType('manage')
                                      setActionError(null)
                                    }}
                                    title={`Delete or archive ${item.productName}`}
                                  >
                                    <IconTrash size={13} />
                                    <span>Manage</span>
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    className="btn-icon-action btn-icon-purchase"
                                    onClick={() => handleArchiveToggle(item, false)}
                                    title={`Reactivate ${item.productName} for active inventory`}
                                  >
                                    <IconCheck size={13} />
                                    <span>Reactivate</span>
                                  </button>
                                  <button
                                    type="button"
                                    className="btn-icon-action btn-icon-deactivate"
                                    onClick={() => {
                                      setItemForAction(item)
                                      setActionModalType('manage')
                                      setActionError(null)
                                    }}
                                    title={`Permanently delete ${item.productName}`}
                                  >
                                    <IconTrash size={13} />
                                    <span>Delete</span>
                                  </button>
                                </>
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

            {/* Quick Helper Footer */}
            <div className="inv-table-footer">
              <div className="footer-left">
                <span className="footer-hint">
                  <strong>Restock Recommendation:</strong> Items marked with yellow or red badges
                  are recommended for PO replenishment before peak weekend surf rush.
                </span>
              </div>
              <div className="footer-right">
                <button
                  type="button"
                  className="btn-action btn-action-outline btn-sm"
                  onClick={() => onNavigate('Menu Management')}
                >
                  <IconEdit size={13} />
                  <span>Configure Menu Tracking</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* TAB 2: STOCK MOVEMENT HISTORY                                 */}
        {/* ============================================================ */}
        {activeTab === 'movements' && (
          <div className="tab-content-area">
            {/* Movement Filter Bar */}
            <div className="inventory-filter-bar">
              {/* Search */}
              <div className="inv-search-box">
                <IconSearch size={16} className="search-icon" />
                <input
                  type="text"
                  placeholder="Search reference, reason, bill #, or logger..."
                  value={movementSearch}
                  onChange={(e) => setMovementSearch(e.target.value)}
                  className="inv-search-input"
                />
                {movementSearch && (
                  <button
                    type="button"
                    className="search-clear-btn"
                    onClick={() => setMovementSearch('')}
                    title="Clear search"
                  >
                    <IconX size={14} />
                  </button>
                )}
              </div>

              {/* Movement Type Filter */}
              <div className="inv-filter-group">
                <label htmlFor="mov-type-filter" className="filter-label">
                  Movement Type:
                </label>
                <select
                  id="mov-type-filter"
                  className="inv-select"
                  value={movementTypeFilter}
                  onChange={(e) =>
                    setMovementTypeFilter(e.target.value as 'All' | StockMovementType)
                  }
                >
                  <option value="All">All Types</option>
                  <option value="Purchase">Purchase Delivery (+)</option>
                  <option value="Sale">POS Sale (-)</option>
                  <option value="Adjustment">Adjustment recount (±)</option>
                  <option value="Wastage">Wastage / Spoilage (-)</option>
                </select>
              </div>

              {/* Product Filter */}
              <div className="inv-filter-group">
                <label htmlFor="mov-prod-filter" className="filter-label">
                  Product:
                </label>
                <select
                  id="mov-prod-filter"
                  className="inv-select"
                  value={movementProductFilter}
                  onChange={(e) => setMovementProductFilter(e.target.value)}
                >
                  <option value="All">All Tracked Products</option>
                  {items.map((i) => (
                    <option key={i.productId} value={i.productId}>
                      {i.productName} ({i.code})
                    </option>
                  ))}
                </select>
              </div>

              {/* Reset */}
              {(movementSearch ||
                movementTypeFilter !== 'All' ||
                movementProductFilter !== 'All') && (
                <button
                  type="button"
                  className="btn-action btn-action-outline btn-sm"
                  onClick={handleResetMovementFilters}
                  title="Reset filters"
                >
                  <IconRotateCcw size={13} />
                  <span>Reset</span>
                </button>
              )}

              <div className="inv-count-indicator">
                Showing <strong>{filteredMovements.length}</strong> movements
              </div>
            </div>

            {/* Movement Table */}
            <div className="inv-table-wrapper">
              <table className="inv-table">
                <thead>
                  <tr>
                    <th className="col-time">Date & Time</th>
                    <th className="col-product">Product & SKU</th>
                    <th className="col-mov-type">Type</th>
                    <th className="col-numeric text-right">Quantity Change</th>
                    <th className="col-numeric text-right">Balance After</th>
                    <th className="col-reason">Reason / Reference</th>
                    <th className="col-author">Logged By</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMovements.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="inv-table-empty">
                        <div className="empty-state-box">
                          <div className="empty-state-icon">
                            <IconHistory size={32} />
                          </div>
                          <h3 className="empty-state-title">No stock movements found</h3>
                          <p className="empty-state-desc">
                            No movements match your current search or movement type filter.
                          </p>
                          <button
                            type="button"
                            className="btn-action btn-action-outline btn-sm"
                            onClick={handleResetMovementFilters}
                          >
                            <IconRotateCcw size={13} />
                            <span>Clear Filters</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredMovements.map((mov) => {
                      const isPositive = mov.quantityChange > 0
                      const isWastage = mov.type === 'Wastage'
                      const isSale = mov.type === 'Sale'

                      return (
                        <tr key={mov.id} className="inv-row">
                          {/* Date & Time */}
                          <td className="col-time">
                            <div className="movement-time-cell">
                              <IconClock size={13} className="time-icon" />
                              <span>{mov.timestamp}</span>
                            </div>
                          </td>

                          {/* Product */}
                          <td className="col-product">
                            <div className="product-title-line">
                              <span className="product-name">{mov.productName}</span>
                              <span className="product-code-pill">{mov.productCode}</span>
                            </div>
                          </td>

                          {/* Movement Type */}
                          <td className="col-mov-type">
                            <span className={`mov-type-badge mov-${mov.type.toLowerCase()}`}>
                              {mov.type === 'Purchase' && <IconTruck size={12} />}
                              {mov.type === 'Sale' && <IconReceipt size={12} />}
                              {mov.type === 'Adjustment' && <IconSliders size={12} />}
                              {mov.type === 'Wastage' && <IconTrash size={12} />}
                              <span>{mov.type}</span>
                            </span>
                          </td>

                          {/* Quantity Change */}
                          <td className="col-numeric text-right">
                            <span
                              className={`mov-qty-change ${
                                isPositive
                                  ? 'qty-plus'
                                  : isWastage
                                    ? 'qty-minus-wastage'
                                    : isSale
                                      ? 'qty-minus-sale'
                                      : 'qty-minus'
                              }`}
                            >
                              {isPositive ? `+${mov.quantityChange}` : mov.quantityChange}
                            </span>
                          </td>

                          {/* Balance After */}
                          <td className="col-numeric text-right">
                            <span className="balance-after-pill">{mov.balanceAfter}</span>
                          </td>

                          {/* Reason / Reference */}
                          <td className="col-reason">
                            <div className="movement-reason-cell">
                              <span className="reason-text">{mov.reason}</span>
                              {mov.notes && (
                                <span className="notes-text" title={mov.notes}>
                                  Note: {mov.notes}
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Logged By */}
                          <td className="col-author">
                            <span className="author-name">{mov.performedBy}</span>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Movements Footer */}
            <div className="inv-table-footer">
              <span className="footer-hint">
                <IconInfo size={14} />
                <span>
                  MongoDB Atlas Audit Log: All inventory movements (sales, deliveries, recounts, and
                  write-offs) are tracked securely in the database.
                </span>
              </span>
            </div>
          </div>
        )}
      </section>

      {/* ============================================================ */}
      {/* MODAL 1: STOCK PURCHASE MODAL                                */}
      {/* ============================================================ */}
      {isPurchaseModalOpen && (
        <div className="modal-backdrop" onClick={() => setIsPurchaseModalOpen(false)}>
          <div
            className="modal-card inv-modal-card"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="purchase-modal-title"
          >
            <div className="modal-header">
              <div className="modal-header-meta">
                <span className="modal-subtitle">Supplier Restock Delivery</span>
                <h2 id="purchase-modal-title" className="modal-title">
                  Receive Stock Purchase
                </h2>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setIsPurchaseModalOpen(false)}
                aria-label="Close modal"
              >
                <IconX size={18} />
              </button>
            </div>

            <form onSubmit={handleSavePurchase} className="inv-form" noValidate>
              <div className="modal-body-scrollable">
                {/* Product Select */}
                <div className="form-group">
                  <label htmlFor="purchase-prod-select" className="form-label">
                    Stock-Tracked Product <span className="required-star">*</span>
                  </label>
                  <select
                    id="purchase-prod-select"
                    className="form-select"
                    value={purchaseForm.productId}
                    onChange={(e) => {
                      const selectedId = e.target.value
                      const it = items.find((i) => i.productId === selectedId)
                      setPurchaseForm((prev) => ({
                        ...prev,
                        productId: selectedId,
                        unitCost: it ? String(it.unitCost) : prev.unitCost,
                        supplier: it?.supplier || prev.supplier
                      }))
                    }}
                  >
                    {items.map((i) => (
                      <option key={i.productId} value={i.productId}>
                        {i.productName} ({i.code}) — Current stock: {i.currentQuantity} {i.unit}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Current Stock Preview Callout */}
                <div className="stock-preview-callout">
                  <div className="preview-stat">
                    <span className="stat-label">Current Stock:</span>
                    <strong className="stat-value">
                      {currentPurchaseTarget.currentQuantity} {currentPurchaseTarget.unit}
                    </strong>
                  </div>
                  <div className="preview-stat">
                    <span className="stat-label">Reorder Threshold:</span>
                    <span className="stat-value">
                      {currentPurchaseTarget.reorderThreshold} {currentPurchaseTarget.unit}
                    </span>
                  </div>
                  <div className="preview-stat">
                    <span className="stat-label">Selling Price:</span>
                    <span className="stat-value">
                      {formatLKR(currentPurchaseTarget.sellingPrice)}
                    </span>
                  </div>
                </div>

                {/* Quantity & Unit Cost */}
                <div className="form-row-2col">
                  <div className="form-group">
                    <label htmlFor="purchase-qty" className="form-label">
                      Quantity Received ({currentPurchaseTarget.unit}){' '}
                      <span className="required-star">*</span>
                    </label>
                    <input
                      id="purchase-qty"
                      type="number"
                      step="1"
                      min="1"
                      className={`form-input ${purchaseErrors.quantity ? 'input-error' : ''}`}
                      placeholder="e.g. 20"
                      value={purchaseForm.quantity}
                      onChange={(e) =>
                        setPurchaseForm((prev) => ({ ...prev, quantity: e.target.value }))
                      }
                      autoFocus
                    />
                    {purchaseErrors.quantity && (
                      <div className="form-error-msg">{purchaseErrors.quantity}</div>
                    )}
                  </div>

                  <div className="form-group">
                    <label htmlFor="purchase-cost" className="form-label">
                      Unit Cost (LKR) <span className="required-star">*</span>
                    </label>
                    <div
                      className={`input-prefix-box ${
                        purchaseErrors.unitCost ? 'input-error' : ''
                      }`}
                    >
                      <span className="input-prefix">Rs.</span>
                      <input
                        id="purchase-cost"
                        type="number"
                        step="10"
                        min="0"
                        className="form-input-prefixed"
                        placeholder="0.00"
                        value={purchaseForm.unitCost}
                        onChange={(e) =>
                          setPurchaseForm((prev) => ({ ...prev, unitCost: e.target.value }))
                        }
                      />
                    </div>
                    {purchaseErrors.unitCost && (
                      <div className="form-error-msg">{purchaseErrors.unitCost}</div>
                    )}
                  </div>
                </div>

                {/* Total Cost Live Calculation */}
                {parseInt(purchaseForm.quantity, 10) > 0 &&
                  parseFloat(purchaseForm.unitCost) >= 0 && (
                    <div className="margin-live-card">
                      <div className="margin-live-row">
                        <span className="margin-live-label">Total Purchase Invoiced:</span>
                        <strong className="margin-live-val text-primary">
                          {formatLKR(
                            parseInt(purchaseForm.quantity, 10) * parseFloat(purchaseForm.unitCost)
                          )}
                        </strong>
                      </div>
                      <div className="margin-live-row">
                        <span className="margin-live-label">New Stock Balance After Delivery:</span>
                        <strong className="margin-live-val text-success">
                          {currentPurchaseTarget.currentQuantity +
                            parseInt(purchaseForm.quantity, 10)}{' '}
                          {currentPurchaseTarget.unit}
                        </strong>
                      </div>
                    </div>
                  )}

                {/* Supplier & Reference */}
                <div className="form-row-2col">
                  <div className="form-group">
                    <label htmlFor="purchase-supplier" className="form-label">
                      Supplier / Vendor (Optional)
                    </label>
                    <input
                      id="purchase-supplier"
                      type="text"
                      className="form-input"
                      placeholder="e.g. Southern Palms Agro"
                      value={purchaseForm.supplier}
                      onChange={(e) =>
                        setPurchaseForm((prev) => ({ ...prev, supplier: e.target.value }))
                      }
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="purchase-ref" className="form-label">
                      PO # / Invoice Reference (Optional)
                    </label>
                    <input
                      id="purchase-ref"
                      type="text"
                      className="form-input text-uppercase"
                      placeholder="e.g. PO-2026-092"
                      value={purchaseForm.reference}
                      onChange={(e) =>
                        setPurchaseForm((prev) => ({
                          ...prev,
                          reference: e.target.value.toUpperCase()
                        }))
                      }
                    />
                  </div>
                </div>

                {/* Purchase Date & Notes */}
                <div className="form-row-2col">
                  <div className="form-group">
                    <label htmlFor="purchase-date" className="form-label">
                      Delivery Date <span className="required-star">*</span>
                    </label>
                    <input
                      id="purchase-date"
                      type="date"
                      className="form-input"
                      value={purchaseForm.date}
                      onChange={(e) =>
                        setPurchaseForm((prev) => ({ ...prev, date: e.target.value }))
                      }
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="purchase-notes" className="form-label">
                      Delivery Notes / Batch (Optional)
                    </label>
                    <input
                      id="purchase-notes"
                      type="text"
                      className="form-input"
                      placeholder="e.g. Inspected 3 crates fresh harvest"
                      value={purchaseForm.notes}
                      onChange={(e) =>
                        setPurchaseForm((prev) => ({ ...prev, notes: e.target.value }))
                      }
                    />
                  </div>
                </div>

                <div className="form-demo-disclaimer">
                  <IconInfo size={14} />
                  <span>
                    DEMO ACTION: Stock increase and purchase log entries will be preserved in your
                    local React session.
                  </span>
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn-action btn-action-outline"
                  onClick={() => setIsPurchaseModalOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-action btn-action-primary">
                  <IconCheck size={16} />
                  <span>Confirm Receipt & Update Stock</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL 2: STOCK ADJUSTMENT MODAL                              */}
      {/* ============================================================ */}
      {isAdjustmentModalOpen && (
        <div className="modal-backdrop" onClick={() => setIsAdjustmentModalOpen(false)}>
          <div
            className="modal-card inv-modal-card"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="adj-modal-title"
          >
            <div className="modal-header">
              <div className="modal-header-meta">
                <span className="modal-subtitle">Inventory Audit Recount</span>
                <h2 id="adj-modal-title" className="modal-title">
                  Stock Adjustment
                </h2>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setIsAdjustmentModalOpen(false)}
                aria-label="Close modal"
              >
                <IconX size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveAdjustment} className="inv-form" noValidate>
              <div className="modal-body-scrollable">
                {/* Product Select */}
                <div className="form-group">
                  <label htmlFor="adj-prod-select" className="form-label">
                    Stock-Tracked Product <span className="required-star">*</span>
                  </label>
                  <select
                    id="adj-prod-select"
                    className="form-select"
                    value={adjustmentForm.productId}
                    onChange={(e) =>
                      setAdjustmentForm((prev) => ({ ...prev, productId: e.target.value }))
                    }
                  >
                    {items.map((i) => (
                      <option key={i.productId} value={i.productId}>
                        {i.productName} ({i.code}) — System stock: {i.currentQuantity} {i.unit}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Adjustment Direction Toggle */}
                <div className="form-group">
                  <label className="form-label">
                    Adjustment Direction <span className="required-star">*</span>
                  </label>
                  <div className="direction-toggle-row">
                    <button
                      type="button"
                      className={`direction-btn btn-inc ${
                        adjustmentForm.type === 'Increase' ? 'active' : ''
                      }`}
                      onClick={() => setAdjustmentForm((prev) => ({ ...prev, type: 'Increase' }))}
                    >
                      <IconPlus size={16} />
                      <span>Increase Stock (+)</span>
                    </button>
                    <button
                      type="button"
                      className={`direction-btn btn-dec ${
                        adjustmentForm.type === 'Decrease' ? 'active' : ''
                      }`}
                      onClick={() => setAdjustmentForm((prev) => ({ ...prev, type: 'Decrease' }))}
                    >
                      <IconMinus size={16} />
                      <span>Decrease Stock (-)</span>
                    </button>
                  </div>
                </div>

                {/* Quantity */}
                <div className="form-group">
                  <label htmlFor="adj-qty" className="form-label">
                    Adjustment Quantity ({currentAdjustmentTarget.unit}){' '}
                    <span className="required-star">*</span>
                  </label>
                  <input
                    id="adj-qty"
                    type="number"
                    step="1"
                    min="1"
                    className={`form-input ${adjustmentErrors.quantity ? 'input-error' : ''}`}
                    placeholder="e.g. 3"
                    value={adjustmentForm.quantity}
                    onChange={(e) =>
                      setAdjustmentForm((prev) => ({ ...prev, quantity: e.target.value }))
                    }
                    autoFocus
                  />
                  {adjustmentErrors.quantity && (
                    <div className="form-error-msg">{adjustmentErrors.quantity}</div>
                  )}
                </div>

                {/* Live Balance Calculation & Non-Negative Validation */}
                {parseInt(adjustmentForm.quantity, 10) > 0 && (
                  <div className="margin-live-card">
                    <div className="margin-live-row">
                      <span className="margin-live-label">Current System Quantity:</span>
                      <strong>
                        {currentAdjustmentTarget.currentQuantity} {currentAdjustmentTarget.unit}
                      </strong>
                    </div>
                    <div className="margin-live-row">
                      <span className="margin-live-label">Adjusted Balance:</span>
                      <strong
                        className={`margin-live-val ${
                          adjustmentForm.type === 'Decrease' &&
                          parseInt(adjustmentForm.quantity, 10) >
                            currentAdjustmentTarget.currentQuantity
                            ? 'text-danger'
                            : 'text-primary'
                        }`}
                      >
                        {adjustmentForm.type === 'Increase'
                          ? currentAdjustmentTarget.currentQuantity +
                            parseInt(adjustmentForm.quantity, 10)
                          : currentAdjustmentTarget.currentQuantity -
                            parseInt(adjustmentForm.quantity, 10)}{' '}
                        {currentAdjustmentTarget.unit}
                      </strong>
                    </div>
                    {adjustmentForm.type === 'Decrease' &&
                      parseInt(adjustmentForm.quantity, 10) >
                        currentAdjustmentTarget.currentQuantity && (
                        <div className="margin-alert-danger">
                          <IconAlertTriangle size={14} />
                          <span>
                            Error: Decrease cannot exceed current stock (
                            {currentAdjustmentTarget.currentQuantity} units). Inventory cannot be
                            negative.
                          </span>
                        </div>
                      )}
                  </div>
                )}

                {/* Required Reason */}
                <div className="form-group">
                  <label htmlFor="adj-reason" className="form-label">
                    Reason for Adjustment <span className="required-star">*</span>
                  </label>
                  <select
                    id="adj-reason"
                    className="form-select"
                    value={adjustmentForm.reason}
                    onChange={(e) =>
                      setAdjustmentForm((prev) => ({ ...prev, reason: e.target.value }))
                    }
                  >
                    <option value="Physical count discrepancy">
                      Physical audit discrepancy / recount
                    </option>
                    <option value="Found unrecorded stock">
                      Found unrecorded stock in back store
                    </option>
                    <option value="Supplier quantity delivery correction">
                      Supplier quantity delivery correction
                    </option>
                    <option value="Stock transfer between bar & retail">
                      Stock transfer between bar & retail
                    </option>
                    <option value="Audit write-off / recount correction">
                      Audit write-off / recount correction
                    </option>
                  </select>
                </div>

                {/* Notes */}
                <div className="form-group">
                  <label htmlFor="adj-notes" className="form-label">
                    Auditor Notes (Optional)
                  </label>
                  <textarea
                    id="adj-notes"
                    rows={2}
                    className="form-textarea"
                    placeholder="e.g. Conducted during Sunday evening manager shift audit"
                    value={adjustmentForm.notes}
                    onChange={(e) =>
                      setAdjustmentForm((prev) => ({ ...prev, notes: e.target.value }))
                    }
                  />
                </div>

                <div className="form-demo-disclaimer">
                  <IconInfo size={14} />
                  <span>
                    DEMO ACTION: Stock adjustment will be applied in local state and recorded in the
                    movement log.
                  </span>
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn-action btn-action-outline"
                  onClick={() => setIsAdjustmentModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-action btn-action-primary"
                  disabled={
                    adjustmentForm.type === 'Decrease' &&
                    parseInt(adjustmentForm.quantity, 10) > currentAdjustmentTarget.currentQuantity
                  }
                >
                  <IconCheck size={16} />
                  <span>Confirm Adjustment</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL 3: WASTAGE MODAL                                        */}
      {/* ============================================================ */}
      {isWastageModalOpen && (
        <div className="modal-backdrop" onClick={() => setIsWastageModalOpen(false)}>
          <div
            className="modal-card inv-modal-card"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="wastage-modal-title"
          >
            <div className="modal-header">
              <div className="modal-header-meta">
                <span className="modal-subtitle">Spoilage & Damage Write-Off</span>
                <h2 id="wastage-modal-title" className="modal-title">
                  Record Stock Wastage
                </h2>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setIsWastageModalOpen(false)}
                aria-label="Close modal"
              >
                <IconX size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveWastage} className="inv-form" noValidate>
              <div className="modal-body-scrollable">
                {/* Product Select */}
                <div className="form-group">
                  <label htmlFor="wastage-prod-select" className="form-label">
                    Stock-Tracked Product <span className="required-star">*</span>
                  </label>
                  <select
                    id="wastage-prod-select"
                    className="form-select"
                    value={wastageForm.productId}
                    onChange={(e) =>
                      setWastageForm((prev) => ({ ...prev, productId: e.target.value }))
                    }
                  >
                    {items.map((i) => (
                      <option key={i.productId} value={i.productId}>
                        {i.productName} ({i.code}) — In stock: {i.currentQuantity} {i.unit}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Quantity Wasted */}
                <div className="form-row-2col">
                  <div className="form-group">
                    <label htmlFor="wastage-qty" className="form-label">
                      Quantity Wasted ({currentWastageTarget.unit}){' '}
                      <span className="required-star">*</span>
                    </label>
                    <input
                      id="wastage-qty"
                      type="number"
                      step="1"
                      min="1"
                      className={`form-input ${wastageErrors.quantity ? 'input-error' : ''}`}
                      placeholder="e.g. 2"
                      value={wastageForm.quantity}
                      onChange={(e) =>
                        setWastageForm((prev) => ({ ...prev, quantity: e.target.value }))
                      }
                      autoFocus
                    />
                    {wastageErrors.quantity && (
                      <div className="form-error-msg">{wastageErrors.quantity}</div>
                    )}
                  </div>

                  <div className="form-group">
                    <label htmlFor="wastage-date" className="form-label">
                      Incident Date <span className="required-star">*</span>
                    </label>
                    <input
                      id="wastage-date"
                      type="date"
                      className="form-input"
                      value={wastageForm.date}
                      onChange={(e) =>
                        setWastageForm((prev) => ({ ...prev, date: e.target.value }))
                      }
                    />
                  </div>
                </div>

                {/* Financial Cost Impact Calculation */}
                {parseInt(wastageForm.quantity, 10) > 0 && (
                  <div className="margin-live-card">
                    <div className="margin-live-row">
                      <span className="margin-live-label">Cost Write-off Impact:</span>
                      <strong className="margin-live-val text-danger">
                        {formatLKR(
                          parseInt(wastageForm.quantity, 10) * currentWastageTarget.unitCost
                        )}
                      </strong>
                    </div>
                    <div className="margin-live-row">
                      <span className="margin-live-label">Stock Balance After Write-Off:</span>
                      <strong
                        className={`margin-live-val ${
                          parseInt(wastageForm.quantity, 10) > currentWastageTarget.currentQuantity
                            ? 'text-danger'
                            : 'text-amber'
                        }`}
                      >
                        {Math.max(
                          0,
                          currentWastageTarget.currentQuantity - parseInt(wastageForm.quantity, 10)
                        )}{' '}
                        {currentWastageTarget.unit}
                      </strong>
                    </div>
                  </div>
                )}

                {/* Reason Select */}
                <div className="form-group">
                  <label htmlFor="wastage-reason" className="form-label">
                    Primary Reason <span className="required-star">*</span>
                  </label>
                  <select
                    id="wastage-reason"
                    className="form-select"
                    value={wastageForm.reason}
                    onChange={(e) =>
                      setWastageForm((prev) => ({ ...prev, reason: e.target.value }))
                    }
                  >
                    <option value="Expired / spoiled">
                      Expired / spoiled (e.g. fermented or sour coconuts)
                    </option>
                    <option value="Damaged / broken packaging">
                      Damaged / broken packaging (e.g. dropped bottles)
                    </option>
                    <option value="Heat damaged / melted wax">
                      Heat damaged / melted wax under tropical sun
                    </option>
                    <option value="Contaminated / unsellable">Contaminated / unsellable</option>
                    <option value="Customer sample / tester write-off">
                      Customer sample / sunblock tester write-off
                    </option>
                  </select>
                </div>

                {/* Notes */}
                <div className="form-group">
                  <label htmlFor="wastage-notes" className="form-label">
                    Incident Notes (Optional)
                  </label>
                  <textarea
                    id="wastage-notes"
                    rows={2}
                    className="form-textarea"
                    placeholder="e.g. Coconuts found cracked and leaking upon morning opening"
                    value={wastageForm.notes}
                    onChange={(e) => setWastageForm((prev) => ({ ...prev, notes: e.target.value }))}
                  />
                </div>

                {/* Confirmation Checkbox for Stock-Reducing Action */}
                <div className="confirmation-checkbox-card">
                  <label className="checkbox-row" htmlFor="wastage-confirm-check">
                    <input
                      id="wastage-confirm-check"
                      type="checkbox"
                      checked={wastageForm.confirmed}
                      onChange={(e) =>
                        setWastageForm((prev) => ({ ...prev, confirmed: e.target.checked }))
                      }
                    />
                    <span className="checkbox-text">
                      I confirm that these items are damaged, expired, or unsellable and must be
                      permanently deducted from physical stock inventory.
                    </span>
                  </label>
                  {wastageErrors.confirmed && (
                    <div className="form-error-msg">{wastageErrors.confirmed}</div>
                  )}
                </div>

                <div className="form-demo-disclaimer">
                  <IconInfo size={14} />
                  <span>
                    DEMO ACTION: This write-off is simulated in local React state for your current
                    session.
                  </span>
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn-action btn-action-outline"
                  onClick={() => setIsWastageModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-action btn-action-danger"
                  disabled={
                    parseInt(wastageForm.quantity, 10) > currentWastageTarget.currentQuantity ||
                    !wastageForm.confirmed
                  }
                >
                  <IconTrash size={15} />
                  <span>Confirm Stock Wastage</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL 4: MANAGE (DELETE / ARCHIVE) INVENTORY ITEM             */}
      {/* ============================================================ */}
      {actionModalType === 'manage' && itemForAction && (
        <div
          className="modal-backdrop"
          onClick={() => !actionLoading && setItemForAction(null)}
        >
          <div
            className="modal-card inv-modal-card"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '520px' }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="manage-modal-title"
          >
            <div className="modal-header">
              <div className="modal-header-meta">
                <span className="modal-subtitle">Inventory Management</span>
                <h2 id="manage-modal-title" className="modal-title">
                  Manage Item
                </h2>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => !actionLoading && setItemForAction(null)}
                aria-label="Close modal"
              >
                <IconX size={18} />
              </button>
            </div>

            <div className="modal-body-scrollable" style={{ padding: '20px' }}>
              <div
                style={{
                  padding: '14px',
                  backgroundColor: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  marginBottom: '16px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>
                    {itemForAction.productName}
                  </span>
                  <span className="product-code-pill">{itemForAction.code}</span>
                </div>
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                  <span>Category: <strong>{itemForAction.category}</strong></span>
                  <span>Current Stock: <strong>{itemForAction.currentQuantity} {itemForAction.unit}</strong></span>
                  <span>Unit Cost: <strong>{formatLKR(itemForAction.unitCost)}</strong></span>
                  <span>Status: <strong>{itemForAction.isArchived || itemForAction.isActive === false ? 'Archived' : 'Active'}</strong></span>
                </div>
              </div>

              {itemForAction.code === 'F01' ? (
                <div
                  style={{
                    padding: '12px 14px',
                    borderRadius: '8px',
                    backgroundColor: '#eff6ff',
                    border: '1px solid #bfdbfe',
                    color: '#1e40af',
                    fontSize: '13px',
                    display: 'flex',
                    gap: '10px',
                    alignItems: 'flex-start',
                    marginBottom: '16px'
                  }}
                >
                  <IconInfo size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
                  <div>
                    <strong>Protected System Item:</strong> Code <code>F01</code> is reserved for Surf Lesson complimentary King Coconut issuance. It cannot be deleted.
                  </div>
                </div>
              ) : (
                <div
                  style={{
                    padding: '12px 14px',
                    borderRadius: '8px',
                    backgroundColor: '#fef2f2',
                    border: '1px solid #fecaca',
                    color: '#991b1b',
                    fontSize: '13px',
                    display: 'flex',
                    gap: '10px',
                    alignItems: 'flex-start',
                    marginBottom: '16px'
                  }}
                >
                  <IconAlertTriangle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
                  <div>
                    <strong>Audit Safety Protection:</strong> Items with existing sales bills or stock movement history cannot be permanently deleted. Instead, <em>archive</em> the item to hide it from active sales while preserving audit history.
                  </div>
                </div>
              )}

              {actionError && (
                <div
                  style={{
                    padding: '12px 14px',
                    borderRadius: '8px',
                    backgroundColor: '#fef2f2',
                    border: '1px solid #f87171',
                    color: '#b91c1c',
                    fontSize: '13px',
                    marginBottom: '16px',
                    lineHeight: '1.4'
                  }}
                >
                  {actionError}
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {!itemForAction.isArchived && itemForAction.isActive !== false ? (
                  <button
                    type="button"
                    className="btn-action btn-action-outline"
                    style={{ justifyContent: 'center', padding: '12px' }}
                    onClick={() => handleArchiveToggle(itemForAction, true)}
                    disabled={actionLoading}
                  >
                    <IconPower size={15} />
                    <span>Archive Item (Preserves All History & Hides from Sales)</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn-action btn-action-primary"
                    style={{ justifyContent: 'center', padding: '12px' }}
                    onClick={() => handleArchiveToggle(itemForAction, false)}
                    disabled={actionLoading}
                  >
                    <IconCheck size={15} />
                    <span>Reactivate Item (Restore to Active Sales)</span>
                  </button>
                )}

                {itemForAction.code !== 'F01' && (
                  <button
                    type="button"
                    className="btn-action btn-action-danger"
                    style={{ justifyContent: 'center', padding: '12px' }}
                    onClick={() => handleConfirmDelete(itemForAction)}
                    disabled={actionLoading}
                  >
                    <IconTrash size={15} />
                    <span>{actionLoading ? 'Processing Deletion...' : 'Permanently Delete (Safe only if 0 history)'}</span>
                  </button>
                )}
              </div>
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="btn-action btn-action-outline"
                onClick={() => setItemForAction(null)}
                disabled={actionLoading}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
