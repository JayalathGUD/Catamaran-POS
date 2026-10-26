/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  ActiveRental,
  CompletedRental,
  CreateInstructorPayload,
  CreateWalkinLessonPayload,
  HistoryBill,
  Instructor,
  InventoryItem,
  IssueCoconutResult,
  LessonFilters,
  LessonPricingMode,
  LessonType,
  MenuItem,
  RecordLessonPaymentPayload,
  StockMovement,
  Surfboard,
  SurfLesson,
  UpdateInstructorPayload,
  UpdateLessonStatusPayload
} from '../types'

const API_ROOT = 'http://127.0.0.1:5000/api'

// Helper for mapping MongoDB _id to frontend id
export function mapId<T extends { _id?: string; id?: string }>(item: T): T & { id: string } {
  return {
    ...item,
    id: String(item._id || item.id || '')
  }
}

// ============================================================
// MENU ITEMS
// ============================================================
export async function getMenuItems(): Promise<MenuItem[]> {
  const res = await fetch(`${API_ROOT}/menu`)
  if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to load menu`)
  const data = await res.json()
  return data.map((item: any) => ({
    id: String(item._id || item.id || ''),
    name: String(item.name || ''),
    category: item.category || 'Food',
    price: typeof item.sellingPrice === 'number' ? item.sellingPrice : Number(item.price || 0),
    costPrice: typeof item.costPrice === 'number' ? item.costPrice : 0,
    code: String(item.code || '').toUpperCase(),
    stockTracking: Boolean(item.stockTracking),
    isActive: item.isActive !== false,
    description: item.description ? String(item.description) : undefined,
    inventoryItemId: item.inventoryItemId ? String(item.inventoryItemId) : undefined,
    currentStock: typeof item.currentStock === 'number' ? item.currentStock : undefined,
    createdAt: item.createdAt ? String(item.createdAt) : undefined
  }))
}

// ============================================================
// BILLS & SALES
// ============================================================
function formatBillResponse(b: any): HistoryBill {
  return {
    id: String(b._id || b.id || ''),
    billNumber: String(b.billNumber || ''),
    customerName: b.customerName ? String(b.customerName) : undefined,
    date: String(b.date || ''),
    time: String(b.time || ''),
    orderType: b.orderType || 'Dine-in',
    saleType: b.saleType || 'Restaurant & Cafe',
    paymentMethod: b.paymentMethod || 'Cash',
    subtotal: Number(b.subtotal || 0),
    discount: Number(b.discount || 0),
    serviceCharge: Number(b.serviceCharge || 0),
    total: Number(b.total || 0),
    status: b.status || 'Settled',
    cashier: b.cashier || 'Kasun P.',
    items: Array.isArray(b.items)
      ? b.items.map((i: any, idx: number) => ({
          id: String(i._id || i.id || `item-${idx}`),
          name: String(i.name || ''),
          quantity: Number(i.quantity || 1),
          unitPrice: Number(i.unitPrice || 0),
          total: Number(i.total || 0),
          code: i.code ? String(i.code) : undefined,
          addedAt: i.addedAt ? String(i.addedAt) : undefined
        }))
      : [],
    refundReason: b.refundReason || undefined,
    refundedAt: b.refundedAt || undefined,
    closedAt: b.closedAt || undefined,
    notes: b.notes || undefined,
    createdAt: b.createdAt ? String(b.createdAt) : undefined,
    updatedAt: b.updatedAt ? String(b.updatedAt) : undefined
  }
}

export async function getBills(filters?: {
  startDate?: string
  endDate?: string
  status?: string
}): Promise<HistoryBill[]> {
  const params = new URLSearchParams()
  if (filters?.startDate) params.set('startDate', filters.startDate)
  if (filters?.endDate) params.set('endDate', filters.endDate)
  if (filters?.status) params.set('status', filters.status)
  const qs = params.toString()
  const res = await fetch(`${API_ROOT}/bills${qs ? `?${qs}` : ''}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to load bills`)
  const data = await res.json()
  return data.map(formatBillResponse)
}

export async function getOpenBills(): Promise<HistoryBill[]> {
  return getBills({ status: 'Open' })
}

export async function getBillById(id: string): Promise<HistoryBill> {
  const res = await fetch(`${API_ROOT}/bills/${id}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to load bill`)
  const data = await res.json()
  return formatBillResponse(data)
}

export async function createBill(billData: {
  billNumber?: string
  customerName?: string
  customerReference?: string
  date?: string
  time?: string
  orderType: string
  saleType?: string
  paymentMethod: string
  items: Array<{ name: string; quantity: number; unitPrice: number; total: number; code?: string; addedAt?: string }>
  subtotal: number
  discount: number
  serviceCharge: number
  total: number
  status?: 'Open' | 'Settled'
  cashier?: string
  notes?: string
}): Promise<HistoryBill> {
  const res = await fetch(`${API_ROOT}/bills`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(billData)
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.message || `HTTP ${res.status}: Failed to create bill`)
  }
  const b = await res.json()
  return formatBillResponse(b)
}

export async function addItemsToBill(
  billId: string,
  payload: {
    items: Array<{ name: string; quantity: number; unitPrice: number; total: number; code?: string }>
    cashier?: string
    customerName?: string
    discount?: number
    serviceCharge?: number
  }
): Promise<HistoryBill> {
  const res = await fetch(`${API_ROOT}/bills/${billId}/items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.message || `HTTP ${res.status}: Failed to add items to bill`)
  }
  const b = await res.json()
  return formatBillResponse(b)
}

export async function updateOpenBillItems(
  billId: string,
  payload: {
    items: Array<{ name: string; quantity: number; unitPrice: number; total: number; code?: string; addedAt?: string }>
    customerName?: string
    discount?: number
    serviceCharge?: number
    cashier?: string
  }
): Promise<HistoryBill> {
  const res = await fetch(`${API_ROOT}/bills/${billId}/items`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.message || `HTTP ${res.status}: Failed to update bill items`)
  }
  const b = await res.json()
  return formatBillResponse(b)
}

export async function payBill(
  billId: string,
  payload: {
    paymentMethod: string
    discount?: number
    serviceCharge?: number
    cashier?: string
    orderType?: string
  }
): Promise<HistoryBill> {
  const res = await fetch(`${API_ROOT}/bills/${billId}/pay`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.message || `HTTP ${res.status}: Failed to pay bill`)
  }
  const b = await res.json()
  return formatBillResponse(b)
}

export async function updateBillStatus(
  id: string,
  status: 'Settled' | 'Refunded' | 'Cancelled',
  refundReason?: string
): Promise<HistoryBill> {
  const res = await fetch(`${API_ROOT}/bills/${id}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status, refundReason })
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.message || `HTTP ${res.status}: Failed to update bill status`)
  }
  const b = await res.json()
  return formatBillResponse(b)
}

// ============================================================
// SURFBOARD FLEET
// ============================================================
export async function getSurfboards(): Promise<Surfboard[]> {
  const res = await fetch(`${API_ROOT}/surfboards`)
  if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to load surfboards`)
  const data = await res.json()
  return data.map((s: any) => ({
    id: String(s._id || s.id || ''),
    name: s.name,
    category: s.category,
    length: s.length || '8\'0"',
    finSetup: s.finSetup || 'Thruster (3-fin)',
    condition: s.condition || 'Excellent',
    status: s.status || 'Available',
    currentRentalId: s.currentRentalId || undefined,
    currentLessonId: s.currentLessonId || undefined,
    currentCustomer: s.currentCustomer || undefined,
    rentalStartTime: s.rentalStartTime || undefined,
    lastReturnedTime: s.lastReturnedTime || undefined,
    damageNotes: s.damageNotes || undefined,
    acquiredDate: s.acquiredDate || undefined
  }))
}

export async function createSurfboard(boardData: {
  name: string
  category: string
  length: string
  finSetup: string
  condition?: string
  damageNotes?: string
}): Promise<Surfboard> {
  const res = await fetch(`${API_ROOT}/surfboards`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(boardData)
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.message || `HTTP ${res.status}: Failed to add surfboard`)
  }
  const s = await res.json()
  return mapId(s)
}

export async function updateSurfboard(
  id: string,
  boardData: Partial<Surfboard>
): Promise<Surfboard> {
  const res = await fetch(`${API_ROOT}/surfboards/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(boardData)
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.message || `HTTP ${res.status}: Failed to update surfboard`)
  }
  const s = await res.json()
  return mapId(s)
}

export async function deleteSurfboard(id: string): Promise<void> {
  const res = await fetch(`${API_ROOT}/surfboards/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to delete surfboard`)
}

// ============================================================
// RENTALS
// ============================================================
export async function getRentals(filters?: {
  startDate?: string
  endDate?: string
  status?: string
}): Promise<{
  active: ActiveRental[]
  completed: CompletedRental[]
}> {
  const params = new URLSearchParams()
  if (filters?.startDate) params.set('startDate', filters.startDate)
  if (filters?.endDate) params.set('endDate', filters.endDate)
  if (filters?.status) params.set('status', filters.status)
  const qs = params.toString()
  const res = await fetch(`${API_ROOT}/rentals${qs ? `?${qs}` : ''}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to load rentals`)
  const data = await res.json()

  const active: ActiveRental[] = []
  const completed: CompletedRental[] = []

  data.forEach((r: any) => {
    if (r.status === 'Active') {
      active.push({
        id: String(r._id || r.id || ''),
        boardId: String(r.boardId || ''),
        boardName: r.boardName,
        boardCategory: r.boardCategory,
        customerName: r.customerName,
        customerContact: r.customerContact || undefined,
        customerPassportOrId: r.customerPassportOrId || undefined,
        startDate: r.startDate,
        startTime: r.startTime,
        startTimestamp: r.startTimestamp || Date.now(),
        hourlyRate: r.hourlyRate || 1000,
        agreedHourlyRate: r.agreedHourlyRate || 1000,
        notes: r.notes || undefined
      })
    } else if (r.status === 'Completed') {
      completed.push({
        id: String(r._id || r.id || ''),
        receiptNumber: r.receiptNumber || 'SRR-2026-001',
        rentalId: String(r._id || r.id || ''),
        boardId: String(r.boardId || ''),
        boardName: r.boardName,
        boardCategory: r.boardCategory,
        customerName: r.customerName,
        customerContact: r.customerContact || undefined,
        customerPassportOrId: r.customerPassportOrId || undefined,
        startDate: r.startDate,
        startTime: r.startTime,
        startTimestamp: r.startTimestamp,
        returnDate: r.returnDate,
        returnTime: r.returnTime,
        returnTimestamp: r.returnTimestamp,
        durationMinutes: r.durationMinutes || 0,
        durationDisplay: r.durationDisplay || '0 mins',
        hourlyRate: r.hourlyRate || 1000,
        agreedRate: r.agreedHourlyRate || 1000,
        actualRentalCharge: r.actualRentalCharge || 0,
        calculatedReferenceCharge: r.calculatedReferenceCharge,
        discountAmount: r.discountAmount,
        roundingPolicyUsed: r.roundingPolicyUsed || 'prorated',
        damageFee: r.damageFee || 0,
        totalCharged: r.totalCharged || 0,
        conditionOnReturn: r.conditionOnReturn || 'Available',
        paymentMethod: r.paymentMethod || 'Cash',
        paymentStatus: r.paymentStatus || 'Paid',
        paymentRecordedAt: r.paymentRecordedAt,
        notes: r.notes || undefined,
        returnedAt: r.returnedAt || `${r.returnDate || ''} ${r.returnTime || ''}`
      })
    }
  })

  return { active, completed }
}

export async function startRental(rentalData: {
  boardId: string
  boardName: string
  boardCategory?: string
  customerName: string
  customerContact?: string
  customerPassportOrId?: string
  startDate?: string
  startTime?: string
  startTimestamp: number
  hourlyRate?: number
  agreedHourlyRate?: number
  notes?: string
}): Promise<ActiveRental> {
  const res = await fetch(`${API_ROOT}/rentals/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(rentalData)
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.message || `HTTP ${res.status}: Failed to start rental`)
  }
  const r = await res.json()
  return {
    id: String(r._id || r.id || ''),
    boardId: String(r.boardId || ''),
    boardName: r.boardName,
    boardCategory: r.boardCategory,
    customerName: r.customerName,
    customerContact: r.customerContact,
    customerPassportOrId: r.customerPassportOrId,
    startDate: r.startDate,
    startTime: r.startTime,
    startTimestamp: r.startTimestamp,
    hourlyRate: r.hourlyRate,
    agreedHourlyRate: r.agreedHourlyRate,
    notes: r.notes
  }
}

export async function returnRental(
  rentalId: string,
  returnData: {
    receiptNumber?: string
    returnDate: string
    returnTime: string
    returnTimestamp: number
    durationMinutes: number
    durationDisplay: string
    actualRentalCharge: number
    calculatedReferenceCharge?: number
    discountAmount?: number
    roundingPolicyUsed: string
    damageFee: number
    totalCharged: number
    conditionOnReturn: string
    paymentMethod: string
    paymentStatus: string
    notes?: string
  }
): Promise<CompletedRental> {
  const res = await fetch(`${API_ROOT}/rentals/return/${rentalId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(returnData)
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.message || `HTTP ${res.status}: Failed to return rental`)
  }
  const r = await res.json()
  return {
    id: String(r._id || r.id || ''),
    receiptNumber: r.receiptNumber,
    rentalId: String(r._id || r.id || ''),
    boardId: String(r.boardId || ''),
    boardName: r.boardName,
    boardCategory: r.boardCategory,
    customerName: r.customerName,
    customerContact: r.customerContact,
    customerPassportOrId: r.customerPassportOrId,
    startDate: r.startDate,
    startTime: r.startTime,
    startTimestamp: r.startTimestamp,
    returnDate: r.returnDate,
    returnTime: r.returnTime,
    returnTimestamp: r.returnTimestamp,
    durationMinutes: r.durationMinutes,
    durationDisplay: r.durationDisplay,
    hourlyRate: r.hourlyRate,
    agreedRate: r.agreedHourlyRate,
    actualRentalCharge: r.actualRentalCharge,
    calculatedReferenceCharge: r.calculatedReferenceCharge,
    discountAmount: r.discountAmount,
    roundingPolicyUsed: r.roundingPolicyUsed,
    damageFee: r.damageFee,
    totalCharged: r.totalCharged,
    conditionOnReturn: r.conditionOnReturn,
    paymentMethod: r.paymentMethod,
    paymentStatus: r.paymentStatus,
    paymentRecordedAt: r.paymentRecordedAt,
    notes: r.notes,
    returnedAt: r.returnedAt
  }
}

// ============================================================
// INVENTORY
// ============================================================
export async function getInventoryItems(params?: {
  status?: 'all' | 'active' | 'archived'
  includeArchived?: boolean
}): Promise<InventoryItem[]> {
  const query = new URLSearchParams()
  if (params?.status) query.append('status', params.status)
  if (params?.includeArchived) query.append('includeArchived', 'true')
  const qs = query.toString() ? `?${query.toString()}` : ''

  const res = await fetch(`${API_ROOT}/inventory${qs}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to load inventory`)
  const data = await res.json()
  return data.map((i: any) => ({
    id: String(i._id || i.id || ''),
    productId: String(i._id || i.id || ''),
    productName: i.productName,
    category: i.category || 'Other Services',
    code: i.code,
    currentQuantity: Number(i.currentQuantity || 0),
    reorderThreshold: Number(i.reorderThreshold || 5),
    unit: i.unit || 'Units',
    unitCost: Number(i.unitCost || 0),
    sellingPrice: Number(i.sellingPrice || 0),
    supplier: i.supplier || undefined,
    lastRestockedAt: i.lastRestockedAt || undefined,
    isActive: i.isActive !== false,
    isArchived: Boolean(i.isArchived),
    legacyCodes: Array.isArray(i.legacyCodes) ? i.legacyCodes : []
  }))
}

export async function deleteInventoryItem(
  id: string
): Promise<{ message: string; deleted: boolean; hasDependencies?: boolean }> {
  const res = await fetch(`${API_ROOT}/inventory/${id}`, {
    method: 'DELETE'
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const error: any = new Error(data.message || `HTTP ${res.status}: Failed to delete inventory item`)
    error.status = res.status
    error.hasDependencies = Boolean(data.hasDependencies)
    error.dependencies = data.dependencies
    throw error
  }
  return data
}

export async function updateInventoryItemStatus(
  id: string,
  updates: { isActive?: boolean; isArchived?: boolean }
): Promise<InventoryItem> {
  const res = await fetch(`${API_ROOT}/inventory/${id}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates)
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.message || `HTTP ${res.status}: Failed to update inventory status`)
  }
  const i = await res.json()
  return {
    id: String(i._id || i.id || ''),
    productId: String(i._id || i.id || ''),
    productName: i.productName,
    category: i.category,
    code: i.code,
    currentQuantity: i.currentQuantity,
    reorderThreshold: i.reorderThreshold,
    unit: i.unit,
    unitCost: i.unitCost,
    sellingPrice: i.sellingPrice,
    supplier: i.supplier,
    lastRestockedAt: i.lastRestockedAt,
    isActive: i.isActive !== false,
    isArchived: Boolean(i.isArchived),
    legacyCodes: Array.isArray(i.legacyCodes) ? i.legacyCodes : []
  }
}

export async function createInventoryItem(itemData: {
  productName: string
  category: string
  code: string
  currentQuantity: number
  reorderThreshold: number
  unit: string
  unitCost: number
  sellingPrice: number
  supplier?: string
}): Promise<InventoryItem> {
  const res = await fetch(`${API_ROOT}/inventory`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(itemData)
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.message || `HTTP ${res.status}: Failed to add inventory item`)
  }
  const i = await res.json()
  return {
    id: String(i._id || i.id || ''),
    productId: String(i._id || i.id || ''),
    productName: i.productName,
    category: i.category,
    code: i.code,
    currentQuantity: i.currentQuantity,
    reorderThreshold: i.reorderThreshold,
    unit: i.unit,
    unitCost: i.unitCost,
    sellingPrice: i.sellingPrice,
    supplier: i.supplier,
    lastRestockedAt: i.lastRestockedAt,
    isActive: i.isActive !== false,
    isArchived: Boolean(i.isArchived),
    legacyCodes: Array.isArray(i.legacyCodes) ? i.legacyCodes : []
  }
}

export async function getStockMovements(filters?: {
  startDate?: string
  endDate?: string
  type?: string
  limit?: number
}): Promise<StockMovement[]> {
  const params = new URLSearchParams()
  if (filters?.startDate) params.set('startDate', filters.startDate)
  if (filters?.endDate) params.set('endDate', filters.endDate)
  if (filters?.type) params.set('type', filters.type)
  if (filters?.limit) params.set('limit', String(filters.limit))
  const qs = params.toString()
  const res = await fetch(`${API_ROOT}/inventory/movements${qs ? `?${qs}` : ''}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to load movements`)
  const data = await res.json()
  return data.map((m: any) => ({
    id: String(m._id || m.id || ''),
    timestamp: m.timestamp || m.createdAt,
    productId: String(m.itemId || ''),
    productName: m.productName,
    productCode: m.productCode || '',
    type: m.type,
    quantityChange: Number(m.quantityChange || 0),
    balanceAfter: Number(m.balanceAfter || 0),
    unitCost: m.unitCost !== undefined ? Number(m.unitCost) : undefined,
    totalCost: m.totalCost !== undefined ? Number(m.totalCost) : undefined,
    reason: m.reason || '',
    performedBy: m.performedBy || 'Manager',
    notes: m.notes || undefined
  }))
}

export async function recordStockMovement(movementData: {
  itemId: string
  type: 'Purchase' | 'Sale' | 'Adjustment' | 'Wastage'
  quantityChange: number
  unitCost?: number
  reason?: string
  performedBy?: string
  notes?: string
}): Promise<{ item: InventoryItem; movement: StockMovement }> {
  const res = await fetch(`${API_ROOT}/inventory/movements`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(movementData)
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.message || `HTTP ${res.status}: Failed to record stock movement`)
  }
  const data = await res.json()
  return data
}


export type ExpenseCategory =
  | 'Electricity'
  | 'Water'
  | 'Internet & Phone'
  | 'Rent'
  | 'Salaries & Wages'
  | 'Cleaning'
  | 'Repairs & Maintenance'
  | 'Transport'
  | 'Office Supplies'
  | 'Marketing'
  | 'Bank & Payment Fees'
  | 'Other'

export type ExpensePaymentMethod =
  | 'Cash'
  | 'Card'
  | 'Bank Transfer'
  | 'Other'

export interface ExpenseRecord {
  id: string
  description: string
  category: ExpenseCategory
  amount: number
  date: string
  paymentMethod: ExpensePaymentMethod
  notes: string
  recordedBy: string
  status: 'Recorded' | 'Cancelled'
  createdAt?: string
}

export const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  'Electricity',
  'Water',
  'Internet & Phone',
  'Rent',
  'Salaries & Wages',
  'Cleaning',
  'Repairs & Maintenance',
  'Transport',
  'Office Supplies',
  'Marketing',
  'Bank & Payment Fees',
  'Other'
]

export const EXPENSE_PAYMENT_METHODS: ExpensePaymentMethod[] = [
  'Cash',
  'Card',
  'Bank Transfer',
  'Other'
]

function mapExpense(expense: any): ExpenseRecord {
  return {
    id: String(expense._id || expense.id || ''),
    description: String(expense.description || ''),
    category: expense.category,
    amount: Number(expense.amount || 0),
    date: String(expense.date || ''),
    paymentMethod: expense.paymentMethod,
    notes: String(expense.notes || ''),
    recordedBy: String(expense.recordedBy || 'Store Manager'),
    status: expense.status === 'Cancelled' ? 'Cancelled' : 'Recorded',
    createdAt: expense.createdAt
      ? String(expense.createdAt)
      : undefined
  }
}

export async function getExpenses(filters?: {
  startDate?: string
  endDate?: string
  category?: ExpenseCategory | ''
  status?: 'Recorded' | 'Cancelled'
}): Promise<ExpenseRecord[]> {
  const params = new URLSearchParams()

  if (filters?.startDate) params.set('startDate', filters.startDate)
  if (filters?.endDate) params.set('endDate', filters.endDate)
  if (filters?.category) params.set('category', filters.category)
  if (filters?.status) params.set('status', filters.status)

  const query = params.toString()
  const res = await fetch(
    `${API_ROOT}/expenses${query ? `?${query}` : ''}`
  )

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: Failed to load expenses`)
  }

  const data = await res.json()

  if (!Array.isArray(data)) {
    throw new Error('Invalid expenses response from server')
  }

  return data.map(mapExpense)
}

export async function createExpense(data: {
  description: string
  category: ExpenseCategory
  amount: number
  date: string
  paymentMethod: ExpensePaymentMethod
  notes?: string
  recordedBy?: string
}): Promise<ExpenseRecord> {
  const res = await fetch(`${API_ROOT}/expenses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(
      err.message || `HTTP ${res.status}: Failed to save expense`
    )
  }

  return mapExpense(await res.json())
}

export async function cancelExpense(id: string): Promise<ExpenseRecord> {
  const res = await fetch(
    `${API_ROOT}/expenses/${encodeURIComponent(id)}/cancel`,
    { method: 'PATCH' }
  )

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(
      err.message || `HTTP ${res.status}: Failed to cancel expense`
    )
  }

  return mapExpense(await res.json())
}

// ============================================================
// INSTRUCTORS API
// ============================================================
function mapInstructor(item: any): Instructor {
  return {
    id: String(item._id || item.id || ''),
    name: String(item.name || ''),
    phone: String(item.phone || ''),
    email: String(item.email || ''),
    specialties: String(item.specialties || 'All Levels (Beginner to Advanced)'),
    isActive: item.isActive !== false,
    notes: String(item.notes || ''),
    createdAt: item.createdAt ? String(item.createdAt) : undefined,
    updatedAt: item.updatedAt ? String(item.updatedAt) : undefined
  }
}

export async function getInstructors(filters?: { active?: boolean }): Promise<Instructor[]> {
  const params = new URLSearchParams()
  if (typeof filters?.active === 'boolean') {
    params.set('active', String(filters.active))
  }
  const qs = params.toString()
  const res = await fetch(`${API_ROOT}/instructors${qs ? `?${qs}` : ''}`)
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.message || `HTTP ${res.status}: Failed to load instructors`)
  }
  const data = await res.json()
  if (!Array.isArray(data)) {
    throw new Error('Invalid instructors response from server')
  }
  return data.map(mapInstructor)
}

export async function createInstructor(payload: CreateInstructorPayload): Promise<Instructor> {
  const res = await fetch(`${API_ROOT}/instructors`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.message || `HTTP ${res.status}: Failed to create instructor`)
  }
  return mapInstructor(await res.json())
}

export async function updateInstructor(
  id: string,
  payload: UpdateInstructorPayload
): Promise<Instructor> {
  const res = await fetch(`${API_ROOT}/instructors/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.message || `HTTP ${res.status}: Failed to update instructor`)
  }
  return mapInstructor(await res.json())
}

export async function setInstructorStatus(
  id: string,
  isActive: boolean
): Promise<Instructor> {
  const res = await fetch(`${API_ROOT}/instructors/${encodeURIComponent(id)}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ isActive })
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.message || `HTTP ${res.status}: Failed to update instructor status`)
  }
  return mapInstructor(await res.json())
}

// ============================================================
// SURF LESSONS API
// ============================================================
function mapSurfLesson(item: any): SurfLesson {
  const lessonType: LessonType = item.lessonType === 'Group' ? 'Group' : 'Private'
  const pricingMode: LessonPricingMode =
    item.pricingMode === 'Fixed Session' ? 'Fixed Session' : 'Per Person'
  const customerName = String(item.customerName || '')
  const startTime = String(item.startTime || '')
  const instructorName = String(item.instructorName || 'Unassigned')
  const studentCount = Number(item.studentCount || 1)

  return {
    id: String(item._id || item.id || ''),
    lessonNumber: String(item.lessonNumber || ''),
    customerName,
    customerContact: item.customerContact ? String(item.customerContact) : undefined,
    customerPassportOrId: item.customerPassportOrId
      ? String(item.customerPassportOrId)
      : undefined,
    studentCount,
    pax: studentCount,
    lessonType,
    pricingMode,
    unitPrice: Number(item.unitPrice || 0),
    sessionPrice: Number(item.sessionPrice || 0),
    durationMinutes: Number(item.durationMinutes || 60),
    subtotal: Number(item.subtotal || 0),
    discount: Number(item.discount || 0),
    total: Number(item.total || 0),
    paymentMethod: item.paymentMethod || 'Cash',
    paymentStatus: item.paymentStatus || 'Paid',
    paymentRecordedAt: item.paymentRecordedAt ? String(item.paymentRecordedAt) : undefined,
    startDate: String(item.startDate || ''),
    startTime,
    time: item.endTime ? `${startTime} - ${item.endTime}` : startTime,
    startTimestamp: Number(item.startTimestamp || Date.now()),
    endTime: String(item.endTime || ''),
    endTimestamp: Number(item.endTimestamp || Date.now()),
    instructorId: item.instructorId ? String(item.instructorId) : undefined,
    instructorName,
    instructor: instructorName,
    title: `${lessonType} Lesson - ${customerName}`,
    level: item.level || 'All Levels',
    assignedBoards: Array.isArray(item.assignedBoards)
      ? item.assignedBoards.map((b: any) => ({
          boardId: String(b.boardId || ''),
          boardName: String(b.boardName || ''),
          boardCategory: b.boardCategory ? String(b.boardCategory) : undefined
        }))
      : [],
    status: item.status || 'In Progress',
    completedAt: item.completedAt ? String(item.completedAt) : undefined,
    completedTimestamp:
      typeof item.completedTimestamp === 'number' ? item.completedTimestamp : null,
    cancelledAt: item.cancelledAt ? String(item.cancelledAt) : undefined,
    cancelReason: item.cancelReason ? String(item.cancelReason) : undefined,
    coconutIssued: Boolean(item.coconutIssued),
    coconutsIssuedCount: Number(item.coconutsIssuedCount || (item.coconutIssued ? 1 : 0)),
    coconutDeclined: Boolean(item.coconutDeclined),
    coconutNotes: item.coconutNotes ? String(item.coconutNotes) : undefined,
    coconutIssuedAt: item.coconutIssuedAt ? String(item.coconutIssuedAt) : undefined,
    coconutIssuedBy: item.coconutIssuedBy ? String(item.coconutIssuedBy) : undefined,
    coconutMovementId: item.coconutMovementId ? String(item.coconutMovementId) : undefined,
    notes: item.notes ? String(item.notes) : undefined,
    cashier: item.cashier ? String(item.cashier) : undefined,
    createdAt: item.createdAt ? String(item.createdAt) : undefined,
    updatedAt: item.updatedAt ? String(item.updatedAt) : undefined
  }
}

export async function getSurfLessons(filters?: LessonFilters): Promise<SurfLesson[]> {
  const params = new URLSearchParams()
  if (filters?.startDate) params.set('startDate', filters.startDate)
  if (filters?.endDate) params.set('endDate', filters.endDate)
  if (filters?.status) params.set('status', filters.status)
  if (filters?.paymentStatus) params.set('paymentStatus', filters.paymentStatus)
  if (filters?.instructorId) params.set('instructorId', filters.instructorId)

  const qs = params.toString()
  const res = await fetch(`${API_ROOT}/lessons${qs ? `?${qs}` : ''}`)
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.message || `HTTP ${res.status}: Failed to load surf lessons`)
  }
  const data = await res.json()
  if (!Array.isArray(data)) {
    throw new Error('Invalid surf lessons response from server')
  }
  return data.map(mapSurfLesson)
}

export async function getSurfLessonById(id: string): Promise<SurfLesson> {
  const res = await fetch(`${API_ROOT}/lessons/${encodeURIComponent(id)}`)
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.message || `HTTP ${res.status}: Failed to load lesson`)
  }
  return mapSurfLesson(await res.json())
}

export async function createWalkinLesson(
  payload: CreateWalkinLessonPayload
): Promise<SurfLesson> {
  const res = await fetch(`${API_ROOT}/lessons/walkin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.message || `HTTP ${res.status}: Failed to register walk-in lesson`)
  }
  return mapSurfLesson(await res.json())
}

export async function updateLessonStatus(
  id: string,
  payload: UpdateLessonStatusPayload
): Promise<SurfLesson> {
  const res = await fetch(`${API_ROOT}/lessons/${encodeURIComponent(id)}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.message || `HTTP ${res.status}: Failed to update lesson status`)
  }
  return mapSurfLesson(await res.json())
}

export async function issueLessonCoconut(
  lessonId: string,
  cashier?: string,
  quantity?: number,
  notes?: string
): Promise<IssueCoconutResult> {
  const res = await fetch(`${API_ROOT}/lessons/${encodeURIComponent(lessonId)}/issue-coconut`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cashier, quantity, notes })
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.message || `HTTP ${res.status}: Failed to issue King Coconut`)
  }
  const data = await res.json()
  return {
    message: String(data.message || 'King Coconut issued successfully'),
    lesson: mapSurfLesson(data.lesson),
    stockMovement: data.stockMovement,
    newCoconutStock: Number(data.newCoconutStock || 0),
    issuedCount: Number(data.issuedCount || 1)
  }
}

export async function declineLessonCoconut(
  lessonId: string,
  notes?: string
): Promise<SurfLesson> {
  const res = await fetch(`${API_ROOT}/lessons/${encodeURIComponent(lessonId)}/decline-coconut`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ notes })
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.message || `HTTP ${res.status}: Failed to record coconut decline`)
  }
  const data = await res.json()
  return mapSurfLesson(data.lesson)
}

export async function recordLessonPayment(
  lessonId: string,
  payload: RecordLessonPaymentPayload
): Promise<SurfLesson> {
  const res = await fetch(`${API_ROOT}/lessons/${encodeURIComponent(lessonId)}/payment`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.message || `HTTP ${res.status}: Failed to record lesson payment`)
  }
  return mapSurfLesson(await res.json())
}
