import { usePosSettings } from '../utils/settingsStore'
import React, { useEffect, useMemo, useState } from 'react'
import { ProfessionalReceipt } from './ProfessionalReceipt'
import { formatLKR, formatLKRCompact } from '../data/demoData'
import {
  createBill,
  getBillById,
  getInventoryItems,
  getMenuItems,
  getOpenBills,
  payBill,
  updateBillStatus,
  updateOpenBillItems
} from '../services/api'
import {
  HistoryBill,
  NavigationPage,
  PosCartItem,
  PosCategory,
  PosOrderType,
  PosPaymentType,
  PosProduct
} from '../types'
import {
  IconAlertTriangle,
  IconCard,
  IconCash,
  IconCheck,
  IconChevronRight,
  IconClock,
  IconCoffee,
  IconInfo,
  IconMinus,
  IconPlus,
  IconPrinter,
  IconReceipt,
  IconRotateCcw,
  IconSearch,
  IconTrash,
  IconUtensils,
  IconX
} from './Icons'

interface PosBillingProps {
  onNavigate: (page: NavigationPage) => void
  activeOpenBillId?: string | null
  onClearActiveOpenBill?: () => void
  onOpenBillsChanged?: () => void
  externalCartItem?: { item: PosCartItem; customerName?: string } | null
  onClearExternalCartItem?: () => void
}

export const PosBilling: React.FC<PosBillingProps> = ({
  onNavigate,
  activeOpenBillId,
  onClearActiveOpenBill,
  onOpenBillsChanged,
  externalCartItem,
  onClearExternalCartItem
}) => {
  const { settings } = usePosSettings()
  // Live Products from MongoDB Atlas
  const [products, setProducts] = useState<PosProduct[]>([])
  const [inventoryMap, setInventoryMap] = useState<Map<string, number>>(new Map())
  const [isLoadingProducts, setIsLoadingProducts] = useState<boolean>(true)
  const [productError, setProductError] = useState<string | null>(null)

  // Active Open Bill Tab Context
  const [activeBill, setActiveBill] = useState<HistoryBill | null>(null)
  const [customerReference, setCustomerReference] = useState<string>('')
  const [showHoldModal, setShowHoldModal] = useState<boolean>(false)
  const [holdCustomerInput, setHoldCustomerInput] = useState<string>('')
  const [isHoldingBill, setIsHoldingBill] = useState<boolean>(false)
  const [openBillsCount, setOpenBillsCount] = useState<number>(0)
  const [isUpdatingOpenBill, setIsUpdatingOpenBill] = useState<boolean>(false)
  const [cancelOpenBillModal, setCancelOpenBillModal] = useState<boolean>(false)
  const [cancelReasonInput, setCancelReasonInput] = useState<string>(
    'Guest request / cancelled order'
  )
  const [isCancellingBill, setIsCancellingBill] = useState<boolean>(false)

  // POS State
  const [orderType, setOrderType] = useState<PosOrderType>('Dine-in')
  const [selectedCategory, setSelectedCategory] = useState<PosCategory>('All')
  const [searchQuery, setSearchQuery] = useState<string>('')
  // Start with an empty cart for real sales
  const [cart, setCart] = useState<PosCartItem[]>([])

  // Automatically load external cart item (transferred from Surfboard Rentals or Lessons)
  useEffect(() => {
    if (externalCartItem) {
      setCart((prev) => {
        const alreadyExists = prev.some((c) => c.product.id === externalCartItem.item.product.id)
        if (alreadyExists) return prev
        return [...prev, externalCartItem.item]
      })
      if (externalCartItem.customerName) {
        setCustomerReference(externalCartItem.customerName)
      }
      onClearExternalCartItem?.()
    }
  }, [externalCartItem, onClearExternalCartItem])
  const [discountInput, setDiscountInput] = useState<string>('0')
  const [serviceChargeEnabled, setServiceChargeEnabled] = useState<boolean>(true)
  const [serviceChargeRate, setServiceChargeRate] = useState<number>(10)
  const [paymentMethod, setPaymentMethod] = useState<PosPaymentType>('Cash')
  const [cashTendered, setCashTendered] = useState<string>('')
  const [validationError, setValidationError] = useState<string | null>(null)
  const [showReceiptModal, setShowReceiptModal] = useState<boolean>(false)
  const [receiptModalInitialView, setReceiptModalInitialView] = useState<'customer' | 'kitchen'>('customer')
  const [completedBillNumber, setCompletedBillNumber] = useState<string>('')
  const [settledBillData, setSettledBillData] = useState<{
    billNumber: string
    date?: string
    time?: string
    orderType: string
    customerName?: string
    cashier?: string
    paymentMethod: string
    items: Array<{ name: string; quantity: number; unitPrice: number; total: number; code?: string }>
    subtotal: number
    discount?: number
    serviceCharge?: number
    total: number
    amountTendered?: number
    changeDue?: number
  } | null>(null)
  const [isSubmittingBill, setIsSubmittingBill] = useState<boolean>(false)
  const [toast, setToast] = useState<string | null>(null)

  const showToast = (msg: string): void => {
    setToast(msg)
    setTimeout(() => {
      setToast((curr) => (curr === msg ? null : curr))
    }, 3800)
  }

  // Load menu items and live inventory stock from backend API
  const loadLiveMenu = async (): Promise<void> => {
    setIsLoadingProducts(true)
    setProductError(null)
    try {
      const [items, invItems] = await Promise.all([
        getMenuItems(),
        getInventoryItems({ status: 'active' }).catch(() => [])
      ])
      // Only show active items on POS
      const activeItems = items.filter((item) => item.isActive !== false)
      setProducts(activeItems)

      const invMap = new Map<string, number>()
      invItems.forEach((it) => {
        if (it.code) invMap.set(it.code.toUpperCase(), it.currentQuantity)
      })
      setInventoryMap(invMap)
    } catch (err: unknown) {
      console.error('Failed to load menu in POS:', err)
      const msg = err instanceof Error ? err.message : 'Could not load menu items'
      setProductError(msg)
      showToast('Could not load products from database.')
    } finally {
      setIsLoadingProducts(false)
    }
  }

  useEffect(() => {
    let ignore = false

    async function initLoad(): Promise<void> {
      try {
        const [items, invItems, openBills] = await Promise.all([
          getMenuItems(),
          getInventoryItems({ status: 'active' }).catch(() => []),
          getOpenBills().catch(() => [])
        ])
        if (!ignore) {
          const activeItems = items.filter((item) => item.isActive !== false)
          setProducts(activeItems)

          const invMap = new Map<string, number>()
          invItems.forEach((it) => {
            if (it.code) invMap.set(it.code.toUpperCase(), it.currentQuantity)
          })
          setInventoryMap(invMap)
          setOpenBillsCount(openBills.length)
        }
      } catch (err: unknown) {
        if (!ignore) {
          console.error('Failed to load menu in POS:', err)
          const msg = err instanceof Error ? err.message : 'Could not load menu items'
          setProductError(msg)
          showToast('Could not load products from database.')
        }
      } finally {
        if (!ignore) {
          setIsLoadingProducts(false)
        }
      }
    }

    initLoad()

    return () => {
      ignore = true
    }
  }, [])

  // Load active open bill whenever activeOpenBillId prop changes
  useEffect(() => {
    let ignore = false
    async function loadActiveBill(): Promise<void> {
      if (!activeOpenBillId) {
        setActiveBill(null)
        setCustomerReference('')
        return
      }
      try {
        const b = await getBillById(activeOpenBillId)
        if (!ignore && b) {
          setActiveBill(b)
          setCustomerReference(b.customerName || '')
          setOrderType(b.orderType || 'Dine-in')
          setDiscountInput(String(b.discount || 0))
          if (b.items && b.items.length > 0) {
            const mappedCart: PosCartItem[] = b.items.map((it, idx) => ({
              id: `cart-active-${idx}-${it.id || Date.now()}`,
              product: {
                id: `prod-active-${idx}`,
                name: it.name,
                category: 'Food',
                price: it.unitPrice,
                code: it.code || '',
                stockTracking: Boolean(it.code && inventoryMap.has(it.code.toUpperCase()))
              },
              quantity: it.quantity
            }))
            setCart(mappedCart)
            showToast(`Loaded Open Tab #${b.billNumber} (${b.customerName || 'No guest name'})`)
          }
        }
      } catch (err) {
        console.error('Failed to load active bill:', err)
        showToast('Could not load selected open bill')
      }
    }
    loadActiveBill()
    return () => {
      ignore = true
    }
  }, [activeOpenBillId])

  // Filter Products
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchesCategory = selectedCategory === 'All' || p.category === selectedCategory
      const matchesSearch =
        searchQuery.trim() === '' ||
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.description && p.description.toLowerCase().includes(searchQuery.toLowerCase()))
      return matchesCategory && matchesSearch
    })
  }, [products, selectedCategory, searchQuery])

  // Category counts
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {
      All: products.length,
      Food: 0,
      Drinks: 0,
      'Surf Lessons': 0,
      'Other Services': 0
    }
    products.forEach((p) => {
      if (counts[p.category] !== undefined) {
        counts[p.category]++
      }
    })
    return counts
  }, [products])

  // Cart Calculations
  const subtotal = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0)
  }, [cart])

  // Parse & Validate Discount
  const parsedDiscount = useMemo(() => {
    const num = parseFloat(discountInput.trim())
    if (isNaN(num)) return 0
    return num
  }, [discountInput])

  const discountError = useMemo(() => {
    if (discountInput.trim() === '') return null
    const num = parseFloat(discountInput.trim())
    if (isNaN(num)) return 'Discount must be a valid number'
    if (num < 0) return 'Discount cannot be negative'
    if (num > subtotal && subtotal > 0) {
      return `Discount cannot exceed subtotal (${formatLKRCompact(subtotal)})`
    }
    return null
  }, [discountInput, subtotal])

  const effectiveDiscount = discountError ? 0 : parsedDiscount

  // Service charge calculation (configurable)
  const serviceChargeAmount = useMemo(() => {
    if (!serviceChargeEnabled || subtotal === 0) return 0
    const taxableBase = Math.max(0, subtotal - effectiveDiscount)
    return Math.round((taxableBase * serviceChargeRate) / 100)
  }, [serviceChargeEnabled, serviceChargeRate, subtotal, effectiveDiscount])

  const finalTotal = useMemo(() => {
    const net = Math.max(0, subtotal - effectiveDiscount)
    return net + serviceChargeAmount
  }, [subtotal, effectiveDiscount, serviceChargeAmount])

  // Cash change calculation
  const tenderedAmount = parseFloat(cashTendered) || 0
  const changeDue = Math.max(0, tenderedAmount - finalTotal)

  // Cart operations
  const addToCart = (product: PosProduct): void => {
    const code = product.code ? product.code.toUpperCase().trim() : ''
    if (code && inventoryMap.has(code)) {
      const available = inventoryMap.get(code)!
      const alreadyOnActiveBill =
        activeBill?.items.find(
          (it) => (it.code && it.code.toUpperCase() === code) || it.name === product.name
        )?.quantity || 0
      const totalAllowed = available + alreadyOnActiveBill
      const inCart = cart.find((item) => item.product.id === product.id)?.quantity || 0

      if (inCart + 1 > totalAllowed) {
        showToast(
          totalAllowed <= 0
            ? `"${product.name}" is out of stock in inventory.`
            : `Cannot add more "${product.name}". Only ${totalAllowed} total available.`
        )
        return
      }
    }

    setCart((prev) => {
      const existing = prev.find((item) => item.product.id === product.id)
      if (existing) {
        return prev.map((item) =>
          item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
        )
      }
      return [...prev, { id: `cart-${Date.now()}-${product.id}`, product, quantity: 1 }]
    })
    setValidationError(null)
  }

  const updateQuantity = (productId: string, delta: number): void => {
    if (delta > 0) {
      const cartItem = cart.find((i) => i.product.id === productId)
      const code = cartItem?.product.code ? cartItem.product.code.toUpperCase().trim() : ''
      if (cartItem && code && inventoryMap.has(code)) {
        const available = inventoryMap.get(code)!
        const alreadyOnActiveBill =
          activeBill?.items.find(
            (it) => (it.code && it.code.toUpperCase() === code) || it.name === cartItem.product.name
          )?.quantity || 0
        const totalAllowed = available + alreadyOnActiveBill
        if (cartItem.quantity + delta > totalAllowed) {
          showToast(
            `Cannot add more "${cartItem.product.name}". Only ${totalAllowed} total available.`
          )
          return
        }
      }
    }

    setCart((prev) =>
      prev
        .map((item) => {
          if (item.product.id === productId) {
            const nextQty = item.quantity + delta
            return nextQty > 0 ? { ...item, quantity: nextQty } : null
          }
          return item
        })
        .filter((item): item is PosCartItem => item !== null)
    )
  }

  const removeItem = (productId: string): void => {
    setCart((prev) => prev.filter((item) => item.product.id !== productId))
  }

  const clearCart = (): void => {
    if (cart.length === 0) return
    setCart([])
    setDiscountInput('0')
    setCashTendered('')
    setValidationError(null)
    showToast('Cart cleared')
  }

  // Open Bill Workflow Actions
  const handleKeepAsOpenBill = (): void => {
    if (cart.length === 0) {
      setValidationError('Cannot hold bill: Cart is empty. Please add items from menu first.')
      return
    }
    if (discountError) {
      setValidationError(discountError)
      return
    }
    setHoldCustomerInput(customerReference || '')
    setShowHoldModal(true)
  }

  const handleConfirmHoldBill = async (): Promise<void> => {
    if (isHoldingBill) return
    setIsHoldingBill(true)
    setValidationError(null)
    try {
      const billData = {
        orderType,
        paymentMethod: 'Cash',
        customerName: holdCustomerInput.trim(),
        status: 'Open' as const,
        items: cart.map((i) => ({
          name: i.product.name,
          quantity: i.quantity,
          unitPrice: i.product.price,
          total: i.product.price * i.quantity,
          code: i.product.code
        })),
        subtotal,
        discount: effectiveDiscount,
        serviceCharge: serviceChargeAmount,
        total: finalTotal,
        cashier: settings.cashierName || 'Kasun P.'
      }

      const saved = await createBill(billData)
      showToast(
        `Order sent to Kitchen! Bill #${saved.billNumber} (${holdCustomerInput.trim() || 'Guest'})`
      )

      // Auto-open 58mm Kitchen Ticket (KOT) for thermal printout
      setSettledBillData({
        billNumber: saved.billNumber,
        date: saved.date,
        time: saved.time,
        orderType: saved.orderType,
        customerName: saved.customerName || holdCustomerInput.trim() || undefined,
        cashier: saved.cashier,
        paymentMethod: 'Pending (Open Tab)',
        items: saved.items.map((i) => ({
          name: i.name,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          total: i.total,
          code: i.code
        })),
        subtotal: saved.subtotal,
        discount: saved.discount,
        serviceCharge: saved.serviceCharge,
        total: saved.total,
        amountTendered: 0,
        changeDue: 0
      })
      setCompletedBillNumber(saved.billNumber)
      setReceiptModalInitialView('kitchen')
      setShowReceiptModal(true)

      setShowHoldModal(false)
      setHoldCustomerInput('')
      setCustomerReference('')
      setCart([])
      setDiscountInput('0')
      setCashTendered('')
      onOpenBillsChanged?.()
      getOpenBills()
        .then((b) => setOpenBillsCount(b.length))
        .catch(() => { })
      await loadLiveMenu().catch(() => { })
    } catch (err: unknown) {
      console.error('Failed to keep bill open:', err)
      const msg = err instanceof Error ? err.message : 'Could not save open bill'
      setValidationError(msg)
      showToast(msg)
    } finally {
      setIsHoldingBill(false)
    }
  }

  const handleUpdateOpenBill = async (): Promise<void> => {
    if (!activeBill) return
    if (cart.length === 0) {
      setValidationError('Open bill must contain at least one item.')
      return
    }
    if (discountError) {
      setValidationError(discountError)
      return
    }
    setIsUpdatingOpenBill(true)
    setValidationError(null)
    try {
      const updated = await updateOpenBillItems(activeBill.id, {
        items: cart.map((i) => ({
          name: i.product.name,
          quantity: i.quantity,
          unitPrice: i.product.price,
          total: i.product.price * i.quantity,
          code: i.product.code
        })),
        customerName: customerReference.trim(),
        discount: effectiveDiscount,
        serviceCharge: serviceChargeAmount,
        cashier: settings.cashierName || 'Kasun P.'
      })
      setActiveBill(updated)
      showToast(`Bill #${updated.billNumber} updated and kept OPEN!`)
      onOpenBillsChanged?.()
      getOpenBills()
        .then((b) => setOpenBillsCount(b.length))
        .catch(() => { })
      await loadLiveMenu().catch(() => { })
    } catch (err: unknown) {
      console.error('Failed to update open bill:', err)
      const msg = err instanceof Error ? err.message : 'Failed to update bill'
      setValidationError(msg)
      showToast(msg)
    } finally {
      setIsUpdatingOpenBill(false)
    }
  }

  const handleUpdateOpenBillAndPrintKot = async (): Promise<void> => {
    if (!activeBill) return
    if (cart.length === 0) {
      setValidationError('Open bill must contain at least one item.')
      return
    }
    if (discountError) {
      setValidationError(discountError)
      return
    }
    setIsUpdatingOpenBill(true)
    setValidationError(null)
    try {
      const updated = await updateOpenBillItems(activeBill.id, {
        items: cart.map((i) => ({
          name: i.product.name,
          quantity: i.quantity,
          unitPrice: i.product.price,
          total: i.product.price * i.quantity,
          code: i.product.code
        })),
        customerName: customerReference.trim(),
        discount: effectiveDiscount,
        serviceCharge: serviceChargeAmount,
        cashier: settings.cashierName || 'Kasun P.'
      })
      setActiveBill(updated)
      showToast(`Bill #${updated.billNumber} updated! Kitchen Ticket ready.`)
      onOpenBillsChanged?.()
      getOpenBills()
        .then((b) => setOpenBillsCount(b.length))
        .catch(() => { })
      await loadLiveMenu().catch(() => { })

      // Auto-open Kitchen Ticket KOT
      setSettledBillData({
        billNumber: updated.billNumber,
        date: updated.date,
        time: updated.time,
        orderType: updated.orderType,
        customerName: updated.customerName || customerReference.trim() || undefined,
        cashier: updated.cashier,
        paymentMethod: 'Pending (Open Tab)',
        items: updated.items.map((i) => ({
          name: i.name,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          total: i.total,
          code: i.code
        })),
        subtotal: updated.subtotal,
        discount: updated.discount,
        serviceCharge: updated.serviceCharge,
        total: updated.total,
        amountTendered: 0,
        changeDue: 0
      })
      setCompletedBillNumber(updated.billNumber)
      setReceiptModalInitialView('kitchen')
      setShowReceiptModal(true)
    } catch (err: unknown) {
      console.error('Failed to update open bill:', err)
      const msg = err instanceof Error ? err.message : 'Failed to update bill'
      setValidationError(msg)
      showToast(msg)
    } finally {
      setIsUpdatingOpenBill(false)
    }
  }

  const handleCancelOpenBill = async (): Promise<void> => {
    if (!activeBill) return
    setIsCancellingBill(true)
    try {
      await updateBillStatus(activeBill.id, 'Cancelled', cancelReasonInput)
      showToast(`Bill #${activeBill.billNumber} cancelled. Stock restored to inventory.`)
      setCancelOpenBillModal(false)
      setActiveBill(null)
      setCart([])
      setDiscountInput('0')
      setCashTendered('')
      setCustomerReference('')
      onClearActiveOpenBill?.()
      onOpenBillsChanged?.()
      getOpenBills()
        .then((b) => setOpenBillsCount(b.length))
        .catch(() => { })
      await loadLiveMenu().catch(() => { })
    } catch (err: unknown) {
      console.error('Failed to cancel bill:', err)
      showToast(err instanceof Error ? err.message : 'Could not cancel bill')
    } finally {
      setIsCancellingBill(false)
    }
  }

  const handleCompleteBill = async (): Promise<void> => {
    // Validate empty cart
    if (cart.length === 0) {
      setValidationError(
        'Cannot complete bill: Cart is empty. Please add items from the menu first.'
      )
      return
    }

    // Validate discount
    if (discountError) {
      setValidationError(discountError)
      return
    }

    if (isSubmittingBill) return
    setIsSubmittingBill(true)
    setValidationError(null)

    try {
      const finalTendered =
        paymentMethod === 'Cash'
          ? (tenderedAmount > 0 ? tenderedAmount : finalTotal)
          : finalTotal
      const finalChange = paymentMethod === 'Cash' ? Math.max(0, finalTendered - finalTotal) : 0

      if (activeBill) {
        // First sync any newly added/modified items on the open tab
        await updateOpenBillItems(activeBill.id, {
          items: cart.map((i) => ({
            name: i.product.name,
            quantity: i.quantity,
            unitPrice: i.product.price,
            total: i.product.price * i.quantity,
            code: i.product.code
          })),
          customerName: customerReference.trim(),
          discount: effectiveDiscount,
          serviceCharge: serviceChargeAmount,
          cashier: settings.cashierName || 'Kasun P.'
        })

        // Settle & pay the bill atomically
        const settled = await payBill(activeBill.id, {
          paymentMethod: paymentMethod === 'Cash' ? 'Cash' : 'Card (Visa/MC)',
          discount: effectiveDiscount,
          serviceCharge: serviceChargeAmount,
          cashier: settings.cashierName || 'Kasun P.',
          orderType,
          amountTendered: finalTendered,
          changeDue: finalChange
        })

        setSettledBillData({
          billNumber: settled.billNumber,
          date: settled.date,
          time: settled.time,
          orderType: settled.orderType,
          customerName: customerReference.trim() || undefined,
          cashier: settled.cashier,
          paymentMethod: settled.paymentMethod,
          items: cart.map((i) => ({
            name: i.product.name,
            quantity: i.quantity,
            unitPrice: i.product.price,
            total: i.product.price * i.quantity,
            code: i.product.code
          })),
          subtotal,
          discount: effectiveDiscount,
          serviceCharge: serviceChargeAmount,
          total: finalTotal,
          amountTendered: finalTendered,
          changeDue: finalChange
        })
        setCompletedBillNumber(settled.billNumber)
        setReceiptModalInitialView('customer')
        setShowReceiptModal(true)
        showToast(`Bill #${settled.billNumber} settled and closed successfully!`)
        setActiveBill(null)
        onClearActiveOpenBill?.()
        onOpenBillsChanged?.()
        getOpenBills()
          .then((b) => setOpenBillsCount(b.length))
          .catch(() => { })
      } else {
        const billData = {
          orderType,
          paymentMethod: paymentMethod === 'Cash' ? 'Cash' : 'Card (Visa/MC)',
          customerName: customerReference.trim(),
          items: cart.map((i) => ({
            name: i.product.name,
            quantity: i.quantity,
            unitPrice: i.product.price,
            total: i.product.price * i.quantity,
            code: i.product.code
          })),
          subtotal,
          discount: effectiveDiscount,
          serviceCharge: serviceChargeAmount,
          total: finalTotal,
          amountTendered: finalTendered,
          changeDue: finalChange,
          cashier: settings.cashierName || 'Kasun P.'
        }

        const savedBill = await createBill(billData)
        setSettledBillData({
          billNumber: savedBill.billNumber,
          date: savedBill.date,
          time: savedBill.time,
          orderType: savedBill.orderType,
          customerName: customerReference.trim() || undefined,
          cashier: savedBill.cashier,
          paymentMethod: savedBill.paymentMethod,
          items: cart.map((i) => ({
            name: i.product.name,
            quantity: i.quantity,
            unitPrice: i.product.price,
            total: i.product.price * i.quantity,
            code: i.product.code
          })),
          subtotal,
          discount: effectiveDiscount,
          serviceCharge: serviceChargeAmount,
          total: finalTotal,
          amountTendered: finalTendered,
          changeDue: finalChange
        })
        setCompletedBillNumber(savedBill.billNumber)
        setReceiptModalInitialView('customer')
        setShowReceiptModal(true)
        showToast(`Bill #${savedBill.billNumber} settled and saved to database!`)
      }

      // Refresh menu and live inventory stock immediately
      await loadLiveMenu().catch(() => { })
    } catch (err: unknown) {
      console.error('Failed to settle bill:', err)
      const msg = err instanceof Error ? err.message : 'Failed to save bill to database'
      setValidationError(msg)
      showToast(msg)
    } finally {
      setIsSubmittingBill(false)
    }
  }

  const handleOpenKitchenBill = (): void => {
    if (cart.length === 0) {
      showToast('Cannot generate Kitchen Bill: Cart is empty. Please add items first.')
      return
    }
    const billNum =
      activeBill?.billNumber ||
      completedBillNumber ||
      `KOT-${new Date().getHours()}${String(new Date().getMinutes()).padStart(2, '0')}`
    setSettledBillData({
      billNumber: billNum,
      orderType,
      customerName: customerReference.trim() || undefined,
      cashier: settings.cashierName || 'Kasun P.',
      paymentMethod: paymentMethod === 'Cash' ? 'Cash' : 'Card (Visa/MC)',
      items: cart.map((i) => ({
        name: i.product.name,
        quantity: i.quantity,
        unitPrice: i.product.price,
        total: i.product.price * i.quantity,
        code: i.product.code
      })),
      subtotal,
      discount: effectiveDiscount,
      serviceCharge: serviceChargeAmount,
      total: finalTotal,
      amountTendered:
        paymentMethod === 'Cash' ? (tenderedAmount > 0 ? tenderedAmount : finalTotal) : finalTotal,
      changeDue: paymentMethod === 'Cash' ? changeDue : 0
    })
    setCompletedBillNumber(billNum)
    setReceiptModalInitialView('kitchen')
    setShowReceiptModal(true)
  }

  const handleNewSale = (): void => {
    setShowReceiptModal(false)
    setActiveBill(null)
    setCart([])
    setDiscountInput('0')
    setCashTendered('')
    setCustomerReference('')
    setValidationError(null)
    onClearActiveOpenBill?.()
    showToast('Ready for next customer sale')
  }

  const todayFormatted = new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).format(new Date())

  return (
    <div className="pos-billing-container">
      {/* Toast Alert */}
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

      {/* Main Two-Column Layout: Menu Browser (Left) & Cart Panel (Right) */}
      <div className="pos-main-grid">
        {/* LEFT COLUMN: Product Catalog & Search */}
        <section className="pos-catalog-column">
          {/* Active Open Tab Notification Banner */}
          {activeBill && (
            <div className="pos-active-tab-banner">
              <div className="tab-banner-left">
                <span className="tab-banner-kicker">ACTIVE OPEN TAB</span>
                <span className="tab-banner-number">{activeBill.billNumber}</span>
                <span className="tab-banner-ref">
                  Guest / Ref: <strong>{customerReference || 'None assigned'}</strong>
                </span>
                <span className="tab-banner-time">Opened: {activeBill.time}</span>
              </div>
              <div className="tab-banner-actions">
                <button
                  type="button"
                  className="btn-tab-switch"
                  onClick={() => {
                    onClearActiveOpenBill?.()
                    onNavigate('Open Bills')
                  }}
                  title="Switch to another open bill"
                >
                  <IconReceipt size={14} />
                  <span>Switch Tab ({openBillsCount})</span>
                </button>
                <button
                  type="button"
                  className="btn-tab-new"
                  onClick={handleNewSale}
                  title="Start fresh counter sale"
                >
                  <IconPlus size={14} />
                  <span>New Blank Sale</span>
                </button>
              </div>
            </div>
          )}

          {/* Header Bar */}
          <div className="pos-header-panel">
            <div className="pos-header-left">
              <div className="pos-kicker-row">
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
                <span className="pos-kicker">
                  {activeBill ? 'Open Tab Editing' : 'Counter Billing'}
                </span>
                <div
                  className="demo-notice-badge"
                  style={{ backgroundColor: '#f0fdf4', borderColor: '#bbf7d0', color: '#166534' }}
                >
                  <span className="demo-pulse-dot" style={{ backgroundColor: '#22c55e' }} />
                  <span>MONGODB ATLAS · LIVE POS</span>
                </div>
              </div>
              <h1 className="pos-main-title">
                {activeBill
                  ? `Editing Tab #${activeBill.billNumber}`
                  : 'POS Billing Terminal'}
              </h1>
              <p className="pos-sub-title">
                {activeBill
                  ? `Guest: ${customerReference || 'Unassigned'} · Add items or close tab`
                  : 'Counter order entry & quick settlement'}
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <button
                type="button"
                className="btn-pos-open-tabs-shortcut"
                onClick={() => onNavigate('Open Bills')}
                title="View all open customer tabs"
              >
                <IconReceipt size={15} />
                <span>Open Tabs</span>
                {openBillsCount > 0 && <span className="open-count-bubble">{openBillsCount}</span>}
              </button>

              {/* Sale-Type Controls (Dine-in / Takeaway - NO Table Selection) */}
              <div className="pos-order-type-switch" role="group" aria-label="Sale Type">
                <button
                  type="button"
                  className={`order-type-btn ${orderType === 'Dine-in' ? 'order-type-active' : ''}`}
                  onClick={() => {
                    setOrderType('Dine-in')
                    setServiceChargeEnabled(true)
                  }}
                >
                  <IconUtensils size={15} />
                  <span>Dine-in</span>
                </button>
                <button
                  type="button"
                  className={`order-type-btn ${orderType === 'Takeaway' ? 'order-type-active' : ''}`}
                  onClick={() => {
                    setOrderType('Takeaway')
                    setServiceChargeEnabled(false)
                  }}
                >
                  <IconCoffee size={15} />
                  <span>Takeaway</span>
                </button>
              </div>
            </div>
          </div>

          {/* Search & Filter Toolbar */}
          <div className="pos-filter-toolbar">
            <div className="pos-search-box">
              <IconSearch size={16} className="pos-search-icon" />
              <input
                type="text"
                placeholder="Search food, drinks, lessons, or code (e.g. F01)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pos-search-input"
              />
              {searchQuery && (
                <button
                  type="button"
                  className="search-clear-btn"
                  onClick={() => setSearchQuery('')}
                  aria-label="Clear search query"
                >
                  <IconX size={14} />
                </button>
              )}
            </div>

            {/* Category Filter Pills */}
            <div className="pos-category-pills">
              {(['All', 'Food', 'Drinks', 'Surf Lessons', 'Other Services'] as PosCategory[]).map(
                (cat) => {
                  const isActive = selectedCategory === cat
                  return (
                    <button
                      key={cat}
                      type="button"
                      className={`pos-category-chip ${isActive ? 'pos-category-chip-active' : ''}`}
                      onClick={() => setSelectedCategory(cat)}
                    >
                      <span>{cat === 'All' ? 'All Items' : cat}</span>
                      <span className="chip-count">{categoryCounts[cat] || 0}</span>
                    </button>
                  )
                }
              )}
            </div>
          </div>

          {/* Products Grid */}
          <div className="pos-products-viewport">
            <div className="pos-products-grid">
              {isLoadingProducts ? (
                <div
                  className="pos-empty-products"
                  style={{ gridColumn: '1 / -1', padding: '60px 20px', textAlign: 'center' }}
                >
                  <IconRotateCcw
                    size={36}
                    style={{
                      animation: 'spin 1s linear infinite',
                      color: 'var(--teal-primary, #0d9488)',
                      margin: '0 auto 12px'
                    }}
                  />
                  <p className="empty-title">Loading live menu...</p>
                  <p className="empty-subtitle">Fetching items from MongoDB Atlas</p>
                </div>
              ) : productError ? (
                <div
                  className="pos-empty-products"
                  style={{ gridColumn: '1 / -1', padding: '60px 20px', textAlign: 'center' }}
                >
                  <IconInfo size={36} style={{ color: '#ef4444', margin: '0 auto 12px' }} />
                  <p className="empty-title">Failed to load live menu</p>
                  <p className="empty-subtitle">{productError}</p>
                  <button
                    type="button"
                    className="btn-action btn-action-primary"
                    onClick={loadLiveMenu}
                    style={{ marginTop: '14px' }}
                  >
                    <IconRotateCcw size={14} />
                    <span>Retry Connection</span>
                  </button>
                </div>
              ) : products.length === 0 ? (
                <div
                  className="pos-empty-products"
                  style={{ gridColumn: '1 / -1', padding: '60px 20px', textAlign: 'center' }}
                >
                  <IconUtensils
                    size={36}
                    style={{ color: 'var(--text-muted)', margin: '0 auto 12px' }}
                  />
                  <p className="empty-title">No menu items found in database</p>
                  <p className="empty-subtitle">
                    Add food, drinks, or coaching packages in Menu Management to begin counter
                    sales.
                  </p>
                  <button
                    type="button"
                    className="btn-action btn-action-primary"
                    onClick={() => onNavigate('Menu Management')}
                    style={{ marginTop: '14px' }}
                  >
                    <IconPlus size={15} />
                    <span>Open Menu Management</span>
                  </button>
                </div>
              ) : filteredProducts.length === 0 ? (
                <div
                  className="pos-empty-products"
                  style={{ gridColumn: '1 / -1', padding: '60px 20px', textAlign: 'center' }}
                >
                  <IconSearch size={32} className="empty-search-icon" />
                  <p className="empty-title">No menu items found</p>
                  <p className="empty-subtitle">
                    No items match &quot;{searchQuery}&quot; in category &quot;{selectedCategory}
                    &quot;
                  </p>
                  <button
                    type="button"
                    className="btn-action btn-action-secondary"
                    onClick={() => {
                      setSearchQuery('')
                      setSelectedCategory('All')
                    }}
                  >
                    Reset Search & Filters
                  </button>
                </div>
              ) : (
                filteredProducts.map((product) => {
                  const inCart = cart.find((i) => i.product.id === product.id)
                  let catBadgeTone = 'cat-food'
                  if (product.category === 'Drinks') catBadgeTone = 'cat-drinks'
                  if (product.category === 'Surf Lessons') catBadgeTone = 'cat-lessons'
                  if (product.category === 'Other Services') catBadgeTone = 'cat-services'

                  const code = product.code ? product.code.toUpperCase().trim() : ''
                  const isTracked = Boolean(code && inventoryMap.has(code))
                  const stockAvailable = isTracked ? inventoryMap.get(code)! : null
                  const isOutOfStock = isTracked && stockAvailable !== null && stockAvailable <= 0

                  return (
                    <button
                      key={product.id}
                      type="button"
                      className={`pos-product-card ${inCart ? 'product-in-cart' : ''}`}
                      style={isOutOfStock ? { opacity: 0.65 } : undefined}
                      onClick={() => addToCart(product)}
                      title={isOutOfStock ? `${product.name} is out of stock in inventory` : undefined}
                    >
                      <div className="product-card-top">
                        <span className={`product-code-tag ${catBadgeTone}`}>{product.code}</span>
                        {isTracked && (
                          <span
                            className="product-stock-tag"
                            style={{
                              fontSize: '11px',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              fontWeight: 600,
                              backgroundColor: isOutOfStock
                                ? '#fee2e2'
                                : stockAvailable! <= 5
                                  ? '#fef3c7'
                                  : '#f0fdf4',
                              color: isOutOfStock
                                ? '#b91c1c'
                                : stockAvailable! <= 5
                                  ? '#b45309'
                                  : '#15803d'
                            }}
                          >
                            {isOutOfStock ? 'Out of stock' : `${stockAvailable} in stock`}
                          </span>
                        )}
                        {inCart && (
                          <span className="product-qty-badge">{inCart.quantity} in bill</span>
                        )}
                      </div>

                      <div className="product-card-body">
                        <strong className="product-name">{product.name}</strong>
                        {product.description && (
                          <span className="product-desc">{product.description}</span>
                        )}
                      </div>

                      <div className="product-card-footer">
                        <span className="product-price">{formatLKR(product.price)}</span>
                        <span className="product-add-circle">
                          <IconPlus size={14} />
                        </span>
                      </div>
                    </button>
                  )
                })
              )}
            </div>
          </div>
        </section>

        {/* RIGHT COLUMN: Dedicated Current Bill / Cart Panel */}
        <aside className="pos-cart-column" aria-label="Current Order Bill">
          <div className="pos-cart-panel">
            {/* Cart Panel Header */}
            <div className="cart-panel-header">
              <div className="cart-header-title-box">
                <div className="cart-title-row">
                  <IconReceipt size={17} className="cart-title-icon" />
                  <h2 className="cart-heading">Current Bill</h2>
                  <button
                    type="button"
                    className={`pro-order-pill ${orderType === 'Dine-in' ? 'pro-order-dinein' : 'pro-order-takeaway'}`}
                    onClick={() => setOrderType(orderType === 'Dine-in' ? 'Takeaway' : 'Dine-in')}
                    title="Click to toggle Dine-in / Takeaway"
                  >
                    {orderType} ▾
                  </button>
                </div>
                <span className="cart-subhead">
                  {cart.reduce((total, i) => total + i.quantity, 0)} {cart.reduce((total, i) => total + i.quantity, 0) === 1 ? 'item' : 'items'} · Cashier: {settings.cashierName || 'Kasun P.'}
                </span>
              </div>

              {cart.length > 0 && (
                <button
                  type="button"
                  className="cart-clear-btn"
                  onClick={clearCart}
                  title="Clear all items in cart"
                >
                  <IconTrash size={13} />
                  <span>Clear</span>
                </button>
              )}
            </div>

            {/* Quick Table / Guest Name Bar */}
            <div className="pro-cart-table-bar">
              <span className="pro-cart-table-badge">
                {orderType === 'Dine-in' ? '🍽️ Table' : '🥡 Takeaway'}
              </span>
              <input
                type="text"
                placeholder={
                  orderType === 'Dine-in'
                    ? 'Enter Table # (e.g. Table 03, Beach Cabana)...'
                    : 'Customer Name / Phone (Optional)...'
                }
                value={customerReference}
                onChange={(e) => setCustomerReference(e.target.value)}
                className="pro-cart-table-input"
              />
              {customerReference && (
                <button
                  type="button"
                  className="pro-cart-table-clear"
                  onClick={() => setCustomerReference('')}
                  title="Clear table reference"
                >
                  <IconX size={13} />
                </button>
              )}
            </div>

            {/* Active Open Tab Indicator if editing an existing open order */}
            {activeBill && (
              <div className="pro-active-tab-banner">
                <div className="pro-tab-meta">
                  <span className="pro-tab-tag">ACTIVE TAB</span>
                  <strong className="pro-tab-num">#{activeBill.billNumber}</strong>
                  {activeBill.customerName && (
                    <span className="pro-tab-guest">· {activeBill.customerName}</span>
                  )}
                </div>
              </div>
            )}

            {/* Validation Banner */}
            {validationError && (
              <div className="pos-validation-banner" role="alert">
                <IconInfo size={14} />
                <span>{validationError}</span>
              </div>
            )}

            {/* Cart Items List */}
            <div className="cart-items-container">
              {cart.length === 0 ? (
                <div className="cart-empty-state">
                  <div className="cart-empty-icon-wrap">
                    <IconUtensils size={28} />
                  </div>
                  <strong className="cart-empty-title">Bill is currently empty</strong>
                  <p className="cart-empty-desc">
                    Click items in the menu grid to add them to this order bill.
                  </p>
                </div>
              ) : (
                <div className="cart-items-list">
                  {cart.map((item) => {
                    const itemTotal = item.product.price * item.quantity
                    return (
                      <div key={item.id} className="cart-item-row">
                        <div className="cart-item-left">
                          <strong className="cart-item-name">{item.product.name}</strong>
                          <span className="cart-item-rate">
                            {formatLKR(item.product.price)} &times; {item.quantity}
                          </span>
                        </div>

                        <div className="cart-item-right">
                          {/* Tactile Quantity Stepper */}
                          <div className="cart-stepper">
                            <button
                              type="button"
                              className="stepper-btn"
                              onClick={() => updateQuantity(item.product.id, -1)}
                              aria-label="Decrease quantity"
                            >
                              <IconMinus size={12} />
                            </button>
                            <span className="stepper-count">{item.quantity}</span>
                            <button
                              type="button"
                              className="stepper-btn"
                              onClick={() => updateQuantity(item.product.id, 1)}
                              aria-label="Increase quantity"
                            >
                              <IconPlus size={12} />
                            </button>
                          </div>

                          {/* Line Total */}
                          <strong className="cart-item-total">{formatLKR(itemTotal)}</strong>

                          {/* Remove button */}
                          <button
                            type="button"
                            className="cart-item-remove-btn"
                            onClick={() => removeItem(item.product.id)}
                            title="Remove item"
                            aria-label={`Remove ${item.product.name}`}
                          >
                            <IconTrash size={13} />
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Cart Financial Summary & Checkout */}
            <div className="pro-cart-summary">
              {/* Subtotal */}
              <div className="pro-summary-row">
                <span className="pro-summary-label">
                  Subtotal ({cart.reduce((total, i) => total + i.quantity, 0)} {cart.reduce((total, i) => total + i.quantity, 0) === 1 ? 'item' : 'items'})
                </span>
                <strong className="pro-summary-val">{formatLKR(subtotal)}</strong>
              </div>

              {/* Discount Input & Chips */}
              <div className="pro-discount-card">
                <div className="pro-discount-header">
                  <div className="pro-discount-left">
                    <span className="pro-summary-label">Discount</span>
                    {effectiveDiscount > 0 && (
                      <span className="pro-discount-applied-badge">
                        -{formatLKR(effectiveDiscount)}
                      </span>
                    )}
                  </div>
                  <div className="pro-discount-input-box">
                    <span className="pro-currency-tag">Rs.</span>
                    <input
                      id="pos-discount-input"
                      type="number"
                      min="0"
                      max={subtotal}
                      placeholder="0"
                      value={discountInput}
                      onChange={(e) => {
                        setDiscountInput(e.target.value)
                        setValidationError(null)
                      }}
                      className="pro-discount-input"
                    />
                  </div>
                </div>

                {/* Quick Discount Segmented Chips */}
                {subtotal > 0 && (
                  <div className="pro-chips-grid">
                    {[
                      { label: 'None', val: '0' },
                      { label: '5%', val: String(Math.round(subtotal * 0.05)) },
                      { label: '10%', val: String(Math.round(subtotal * 0.1)) },
                      { label: '15%', val: String(Math.round(subtotal * 0.15)) },
                      { label: 'Rs. 500', val: '500' }
                    ].map((chip) => {
                      const isActive = discountInput === chip.val
                      return (
                        <button
                          key={chip.label}
                          type="button"
                          className={`pro-chip-btn ${isActive ? 'pro-chip-active' : ''}`}
                          onClick={() => setDiscountInput(chip.val)}
                        >
                          {chip.label}
                        </button>
                      )
                    })}
                  </div>
                )}
                {discountError && <span className="pro-discount-err">{discountError}</span>}
              </div>

              {/* Configurable Service Charge */}
              <div className="pro-service-charge-row">
                <div className="pro-sc-left">
                  <span className="pro-summary-label">Service Charge</span>
                  <div className="pro-sc-chips">
                    {[10, 5, 0].map((rate) => {
                      const isActive = serviceChargeEnabled && serviceChargeRate === rate
                      const isNone = rate === 0 && !serviceChargeEnabled
                      return (
                        <button
                          key={rate}
                          type="button"
                          className={`pro-sc-chip ${isActive || isNone ? 'pro-sc-chip-active' : ''}`}
                          onClick={() => {
                            if (rate === 0) {
                              setServiceChargeEnabled(false)
                              setServiceChargeRate(0)
                            } else {
                              setServiceChargeEnabled(true)
                              setServiceChargeRate(rate)
                            }
                          }}
                        >
                          {rate === 0 ? 'Off' : `${rate}%`}
                        </button>
                      )
                    })}
                  </div>
                </div>
                <strong className="pro-summary-val pro-sc-amount">
                  {serviceChargeAmount > 0 ? `+ ${formatLKR(serviceChargeAmount)}` : 'Rs. 0.00'}
                </strong>
              </div>

              {/* TOTAL AMOUNT High-Impact Banner */}
              <div className="pro-total-banner">
                <div className="pro-total-meta">
                  <span className="pro-total-title">TOTAL AMOUNT</span>
                  <span className="pro-total-subtitle">Inclusive of all local taxes</span>
                </div>
                <div className="pro-total-figure">
                  <span className="pro-currency-symbol">Rs.</span>
                  <span className="pro-total-number">
                    {finalTotal.toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>

              {/* Payment Method Selector (Cash / Card) */}
              <div className="pro-payment-section">
                <div className="pro-section-label">PAYMENT METHOD</div>
                <div className="pro-payment-tabs">
                  <button
                    type="button"
                    className={`pro-payment-tab ${paymentMethod === 'Cash' ? 'pro-payment-tab-active' : ''}`}
                    onClick={() => setPaymentMethod('Cash')}
                  >
                    <IconCash size={16} />
                    <span>Cash</span>
                  </button>
                  <button
                    type="button"
                    className={`pro-payment-tab ${paymentMethod === 'Card' ? 'pro-payment-tab-active' : ''}`}
                    onClick={() => setPaymentMethod('Card')}
                  >
                    <IconCard size={16} />
                    <span>Card (Visa/MC)</span>
                  </button>
                </div>
              </div>

              {/* Cash Tendered Input & Prominent Change Due Card */}
              {paymentMethod === 'Cash' && finalTotal > 0 && (
                <div className="pro-cash-section">
                  <div className="pro-tender-row">
                    <label htmlFor="tender-amount-input" className="pro-tender-label">
                      Cash Received (පාරිභෝගිකයා දුන් මුදල):
                    </label>
                    <div className="pro-tender-input-wrap">
                      <span className="pro-currency-tag">Rs.</span>
                      <input
                        id="tender-amount-input"
                        type="number"
                        placeholder={String(finalTotal)}
                        value={cashTendered}
                        onChange={(e) => setCashTendered(e.target.value)}
                        className="pro-tender-input"
                      />
                    </div>
                  </div>

                  {/* Smart Quick Cash Presets */}
                  <div className="pro-quick-cash-row">
                    {[
                      { label: 'Exact', val: String(finalTotal) },
                      { label: 'Rs. 1,500', val: '1500' },
                      { label: 'Rs. 2,000', val: '2000' },
                      { label: 'Rs. 5,000', val: '5000' },
                      { label: 'Rs. 10,000', val: '10000' }
                    ]
                      .filter((p) => p.label === 'Exact' || Number(p.val) >= finalTotal)
                      .slice(0, 4)
                      .map((preset) => {
                        const isPresetActive = cashTendered === preset.val
                        return (
                          <button
                            key={preset.label}
                            type="button"
                            className={`pro-preset-btn ${isPresetActive ? 'pro-preset-active' : ''}`}
                            onClick={() => setCashTendered(preset.val)}
                          >
                            {preset.label}
                          </button>
                        )
                      })}
                  </div>

                  {/* DEDICATED HIGH-CONTRAST CHANGE DUE CARD */}
                  <div className={`pro-change-card ${tenderedAmount >= finalTotal ? 'pro-change-due' : 'pro-change-short'}`}>
                    <div className="pro-change-meta">
                      <span className="pro-change-kicker">
                        {tenderedAmount >= finalTotal
                          ? 'CHANGE DUE TO GUEST (ඉතිරි මුදල)'
                          : 'AMOUNT SHORT (අඩු මුදල)'}
                      </span>
                      <span className="pro-change-hint">
                        {tenderedAmount >= finalTotal
                          ? (tenderedAmount === finalTotal
                              ? 'Exact amount received · No change needed'
                              : 'Return this balance to customer')
                          : 'Customer paid less than total amount'}
                      </span>
                    </div>
                    <div className="pro-change-amount">
                      {formatLKR(Math.abs(tenderedAmount - finalTotal))}
                    </div>
                  </div>
                </div>
              )}

              {/* Checkout Action Buttons */}
              <div className="pro-checkout-actions">
                {activeBill ? (
                  <>
                    {/* Active Tab: Final payment & checkout when guest leaves */}
                    <button
                      type="button"
                      className="pro-btn-settle"
                      onClick={handleCompleteBill}
                      disabled={cart.length === 0 || isSubmittingBill || isUpdatingOpenBill}
                      style={{ background: 'linear-gradient(135deg, #0f766e 0%, #115e59 100%)' }}
                    >
                      {isSubmittingBill ? (
                        <>
                          <IconRotateCcw size={18} style={{ animation: 'spin 1s linear infinite' }} />
                          <span>Settling &amp; Closing Tab...</span>
                        </>
                      ) : (
                        <>
                          <div className="pro-btn-content">
                            <IconCheck size={18} />
                            <div style={{ textAlign: 'left' }}>
                              <div style={{ fontWeight: 800, fontSize: '13.5px' }}>
                                Pay &amp; Settle Tab (Guest Leaving)
                              </div>
                              <div style={{ fontSize: '10px', opacity: 0.88, fontWeight: 500 }}>
                                Collect payment · Print Official Customer Bill
                              </div>
                            </div>
                          </div>
                          <span className="pro-btn-badge">{formatLKR(finalTotal)}</span>
                        </>
                      )}
                    </button>

                    <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '8px' }}>
                      <button
                        type="button"
                        onClick={handleUpdateOpenBillAndPrintKot}
                        disabled={cart.length === 0 || isUpdatingOpenBill || isSubmittingBill}
                        className="pro-subrow-update-btn"
                        title="Send newly added items to kitchen & update tab"
                      >
                        {isUpdatingOpenBill ? (
                          <>
                            <IconRotateCcw size={15} style={{ animation: 'spin 1s linear infinite' }} />
                            <span>Updating...</span>
                          </>
                        ) : (
                          <>
                            <span>🍳</span>
                            <span>Send Add-on to Kitchen</span>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => setCancelOpenBillModal(true)}
                        disabled={isSubmittingBill || isUpdatingOpenBill}
                        className="pro-subrow-cancel-btn"
                        title="Cancel this tab and restore items to inventory"
                      >
                        <IconTrash size={14} />
                        <span>Cancel Tab</span>
                      </button>
                    </div>
                  </>
                ) : orderType === 'Dine-in' ? (
                  <>
                    {/* DINE-IN WORKFLOW: Order first, send to kitchen, pay when leaving */}
                    <button
                      type="button"
                      className="pro-btn-kitchen-send"
                      onClick={handleKeepAsOpenBill}
                      disabled={cart.length === 0 || isHoldingBill || isSubmittingBill}
                    >
                      {isHoldingBill ? (
                        <>
                          <IconRotateCcw size={18} style={{ animation: 'spin 1s linear infinite' }} />
                          <span>Sending to Kitchen...</span>
                        </>
                      ) : (
                        <>
                          <div className="pro-btn-content">
                            <span style={{ fontSize: '20px' }}>🍳</span>
                            <div style={{ textAlign: 'left' }}>
                              <div style={{ fontWeight: 800, fontSize: '14px' }}>
                                Send Order to Kitchen (Hold Tab)
                              </div>
                              <div style={{ fontSize: '10.5px', opacity: 0.9, fontWeight: 500 }}>
                                Prints 58mm KOT now · Customer pays upon leaving
                              </div>
                            </div>
                          </div>
                          <span className="pro-btn-badge">{formatLKR(finalTotal)}</span>
                        </>
                      )}
                    </button>

                    <div className="pos-action-subrow">
                      <button
                        type="button"
                        className="pro-btn-hold"
                        onClick={handleCompleteBill}
                        disabled={cart.length === 0 || isSubmittingBill || isHoldingBill}
                        title="Guest wants to pay upfront before eating"
                      >
                        <IconCheck size={14} />
                        <span>💳 Settle &amp; Pay Now</span>
                      </button>

                      <button
                        type="button"
                        className="pro-btn-kot-trigger"
                        onClick={handleOpenKitchenBill}
                        disabled={cart.length === 0 || isSubmittingBill}
                        title="Preview &amp; print Kitchen Ticket directly"
                      >
                        <span>🍳 KOT Preview</span>
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    {/* TAKEAWAY WORKFLOW: Customer pays upfront at counter */}
                    <button
                      type="button"
                      className="pro-btn-settle"
                      onClick={handleCompleteBill}
                      disabled={cart.length === 0 || isSubmittingBill || isHoldingBill}
                    >
                      {isSubmittingBill ? (
                        <>
                          <IconRotateCcw size={18} style={{ animation: 'spin 1s linear infinite' }} />
                          <span>Processing Payment...</span>
                        </>
                      ) : (
                        <>
                          <div className="pro-btn-content">
                            <IconCheck size={18} />
                            <div style={{ textAlign: 'left' }}>
                              <div style={{ fontWeight: 800, fontSize: '14px' }}>
                                Settle &amp; Print Bill (Pay Now)
                              </div>
                              <div style={{ fontSize: '10.5px', opacity: 0.9, fontWeight: 500 }}>
                                Customer pays upfront · Prints Bill + KOT
                              </div>
                            </div>
                          </div>
                          <span className="pro-btn-badge">{formatLKR(finalTotal)}</span>
                        </>
                      )}
                    </button>

                    <div className="pos-action-subrow">
                      <button
                        type="button"
                        className="pro-btn-hold"
                        onClick={handleKeepAsOpenBill}
                        disabled={cart.length === 0 || isHoldingBill || isSubmittingBill}
                        title="Keep as unpaid tab (pickup / pay later)"
                      >
                        <IconClock size={14} />
                        <span>Keep Open Tab</span>
                      </button>

                      <button
                        type="button"
                        className="pro-btn-kot-trigger"
                        onClick={handleOpenKitchenBill}
                        disabled={cart.length === 0 || isSubmittingBill}
                        title="Print Kitchen Order Ticket (KOT)"
                      >
                        <span>🍳 Kitchen KOT</span>
                      </button>
                    </div>
                  </>
                )}
              </div>

              {/* Status bar */}
              <div className="pro-status-footer">
                <div className="pro-status-dot" />
                <span>Cashier: {settings.cashierName || 'Kasun P.'} · 58mm Thermal Printer Ready</span>
              </div>
            </div>
          </div>
        </aside>
      </div>

      {/* Professional Receipt & Print Modal */}
      {showReceiptModal && (
        <ProfessionalReceipt
          initialView={receiptModalInitialView}
          billNumber={settledBillData?.billNumber || completedBillNumber}
          date={settledBillData?.date}
          time={settledBillData?.time}
          orderType={settledBillData?.orderType || orderType}
          customerName={settledBillData?.customerName || customerReference.trim()}
          cashier={settledBillData?.cashier || settings.cashierName || 'Kasun P.'}
          paymentMethod={
            settledBillData?.paymentMethod || (paymentMethod === 'Cash' ? 'Cash' : 'Card (Visa/MC)')
          }
          items={
            settledBillData?.items ||
            cart.map((i) => ({
              name: i.product.name,
              quantity: i.quantity,
              unitPrice: i.product.price,
              total: i.product.price * i.quantity,
              code: i.product.code
            }))
          }
          subtotal={settledBillData?.subtotal ?? subtotal}
          discount={settledBillData?.discount ?? effectiveDiscount}
          serviceCharge={settledBillData?.serviceCharge ?? serviceChargeAmount}
          total={settledBillData?.total ?? finalTotal}
          amountTendered={
            settledBillData?.amountTendered ??
            (paymentMethod === 'Cash' ? (tenderedAmount > 0 ? tenderedAmount : finalTotal) : finalTotal)
          }
          changeDue={
            settledBillData?.changeDue ??
            (paymentMethod === 'Cash' ? changeDue : 0)
          }
          onClose={() => setShowReceiptModal(false)}
          onNewSale={handleNewSale}
        />
      )}

      {/* Hold Bill Modal: Select table / guest name to send order to kitchen */}
      {showHoldModal && (
        <div
          className="pos-modal-backdrop"
          onClick={() => !isHoldingBill && setShowHoldModal(false)}
        >
          <div className="pos-ref-dialog-card" onClick={(e) => e.stopPropagation()}>
            <div className="pos-ref-dialog-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div className="pay-icon-circle" style={{ width: '38px', height: '38px', background: '#ecfdf5', color: '#047857' }}>
                  <span style={{ fontSize: '19px' }}>🍳</span>
                </div>
                <div>
                  <h3 className="ref-modal-title">Send Order to Kitchen (Open Tab)</h3>
                  <span className="ref-modal-sub">Prints 58mm KOT immediately · Guest pays when leaving</span>
                </div>
              </div>
              <button
                type="button"
                className="btn-dialog-close"
                onClick={() => setShowHoldModal(false)}
                disabled={isHoldingBill}
              >
                <IconX size={16} />
              </button>
            </div>

            <div className="pos-ref-dialog-body">
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.45' }}>
                Select a table or enter guest name. This saves the tab, keeps it active in MongoDB, and <strong>immediately displays the 58mm Kitchen Ticket (KOT)</strong> ready to print for the kitchen!
              </div>

              {/* Fast Table preset chips */}
              <div>
                <label className="field-label-text" style={{ marginBottom: '6px', display: 'block' }}>
                  Quick Select Table:
                </label>
                <div className="table-preset-chips">
                  {[
                    'Table 01',
                    'Table 02',
                    'Table 03',
                    'Table 04',
                    'Table 05',
                    'Table 06',
                    'Table 07',
                    'Table 08',
                    'Cabana 1',
                    'Cabana 2',
                    'Garden 1',
                    'Garden 2',
                    'Bar Counter'
                  ].map((tbl) => (
                    <button
                      key={tbl}
                      type="button"
                      className={`table-preset-chip ${holdCustomerInput === tbl ? 'table-preset-chip-active' : ''}`}
                      onClick={() => setHoldCustomerInput(tbl)}
                    >
                      {tbl}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label htmlFor="hold-customer-input" className="field-label-text">
                  Table / Guest Identifier:
                </label>
                <input
                  id="hold-customer-input"
                  type="text"
                  placeholder="e.g. Table 03, Beach Cabana, Alex Surf"
                  value={holdCustomerInput}
                  onChange={(e) => setHoldCustomerInput(e.target.value)}
                  className="ref-text-input"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      handleConfirmHoldBill()
                    }
                  }}
                />
              </div>

              <div
                style={{
                  padding: '10px 12px',
                  backgroundColor: '#f0fdf4',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid #bbf7d0',
                  fontSize: '12.5px',
                  color: '#166534',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <span>Current Order Value:</span>
                <strong style={{ fontSize: '14px' }}>{formatLKR(finalTotal)}</strong>
              </div>
            </div>

            <div className="pos-ref-dialog-actions">
              <button
                type="button"
                className="btn-dismiss-ref"
                onClick={() => setShowHoldModal(false)}
                disabled={isHoldingBill}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-save-ref"
                onClick={handleConfirmHoldBill}
                disabled={isHoldingBill}
                style={{
                  background: 'linear-gradient(135deg, #0f766e 0%, #115e59 100%)',
                  borderColor: '#0f766e',
                  color: '#ffffff',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                {isHoldingBill ? (
                  <>
                    <IconRotateCcw size={15} style={{ animation: 'spin 1s linear infinite' }} />
                    <span>Sending to Kitchen...</span>
                  </>
                ) : (
                  <>
                    <span>🍳</span>
                    <span>Send Order to Kitchen (Print KOT)</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Open Bill Modal */}
      {cancelOpenBillModal && activeBill && (
        <div
          className="pos-modal-backdrop"
          onClick={() => !isCancellingBill && setCancelOpenBillModal(false)}
        >
          <div className="pos-cancel-dialog-card" onClick={(e) => e.stopPropagation()}>
            <div className="pos-cancel-dialog-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div className="cancel-icon-circle" style={{ width: '36px', height: '36px' }}>
                  <IconAlertTriangle size={18} />
                </div>
                <div>
                  <h3 className="cancel-modal-title">Cancel Open Tab?</h3>
                  <span className="cancel-modal-sub">
                    Bill #{activeBill.billNumber} · {formatLKR(finalTotal)}
                  </span>
                </div>
              </div>
              <button
                type="button"
                className="btn-dialog-close"
                onClick={() => setCancelOpenBillModal(false)}
                disabled={isCancellingBill}
              >
                <IconX size={16} />
              </button>
            </div>

            <div className="pos-cancel-dialog-body">
              <div className="cancel-stock-warning">
                <IconInfo size={16} className="warning-info-icon" />
                <p>
                  <strong>Inventory Safety:</strong> All items in this open tab will be immediately restored to stock in MongoDB Atlas.
                </p>
              </div>

              <div>
                <label htmlFor="pos-cancel-reason-input" className="field-label-text">
                  Reason for Cancellation:
                </label>
                <select
                  id="pos-cancel-reason-input"
                  value={cancelReasonInput}
                  onChange={(e) => setCancelReasonInput(e.target.value)}
                  className="filter-select select-full-width"
                  style={{ width: '100%', padding: '8px 10px', marginTop: '6px' }}
                >
                  <option value="Guest request / cancelled order">
                    Guest request / cancelled order
                  </option>
                  <option value="Duplicate or accidental tab created">
                    Duplicate or accidental tab created
                  </option>
                  <option value="Wrong table or order entered">
                    Wrong table or order entered
                  </option>
                  <option value="Kitchen / Beverage unavailable">
                    Kitchen / Beverage unavailable
                  </option>
                  <option value="Manager discretion">Manager discretion</option>
                </select>
              </div>
            </div>

            <div className="pos-cancel-dialog-actions">
              <button
                type="button"
                className="btn-keep-open-cancel"
                onClick={() => setCancelOpenBillModal(false)}
                disabled={isCancellingBill}
              >
                Keep Bill Open
              </button>
              <button
                type="button"
                className="btn-confirm-cancel"
                onClick={handleCancelOpenBill}
                disabled={isCancellingBill}
              >
                {isCancellingBill ? 'Restoring Stock...' : 'Yes, Cancel Tab & Restore Stock'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
