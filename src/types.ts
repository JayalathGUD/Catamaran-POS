export type NavigationPage =
  | 'Dashboard'
  | 'POS Billing'
  | 'Open Bills'
  | 'Customer Credit'
  | 'Bill History'
  | 'Menu Management'
  | 'Inventory'
  | 'Surfboard Rentals'
  | 'Surf Lessons'
  | 'Expenses'
  | 'Reports'
  | 'Settings'

export type PaymentMethod = 'Cash' | 'Card (Visa/MC)' | 'Card (Amex)' | 'Split (Cash + Card)' | string

export type SaleType =
  | 'Restaurant & Cafe' | 'Surfboard Rental' | 'Surf Lesson' | 'Retail & Gear' | 'Package Combo'

export type PosCategory = 'All' | 'Food' | 'Drinks' | 'Surf Lessons' | 'Other Services'

export type PosOrderType = 'Dine-in' | 'Takeaway'

export type BillOrderType = PosOrderType

export type PosPaymentType = 'Cash' | 'Card' | 'Split'

export type MenuCategory = 'Food' | 'Drinks' | 'Surf Lessons' | 'Other Services'
export type MenuFilterCategory = 'All' | MenuCategory
export type MenuFilterStatus = 'All' | 'Active' | 'Inactive'

export interface MenuItem {
  id: string
  name: string
  category: MenuCategory
  price: number
  costPrice: number
  stockTracking: boolean
  isActive: boolean
  code: string
  description?: string
  inventoryItemId?: string
  currentStock?: number
  createdAt?: string
}

export interface PosProduct {
  id: string
  name: string
  category: MenuCategory
  price: number
  code: string
  description?: string
  costPrice?: number
  stockTracking?: boolean
  isActive?: boolean
}

export interface PosCartItem {
  id: string
  product: PosProduct
  quantity: number
}

export interface BillItem {
  id: string
  name: string
  quantity: number
  unitPrice: number
  total: number
  amountTendered?: number
  changeDue?: number
  code?: string
  duration?: string
  startTime?: string
  endTime?: string
  addedAt?: string
}

export type BillStatus = 'Open' | 'Settled' | 'Refunded' | 'Cancelled'

export interface HistoryBill {
  id: string
  billNumber: string
  customerName?: string
  date: string
  time: string
  orderType: PosOrderType
  saleType: SaleType
  paymentMethod: PaymentMethod
  subtotal: number
  discount: number
  serviceCharge: number
  total: number
  amountTendered?: number
  changeDue?: number
  splitCashAmount?: number
  splitCardAmount?: number
  status: BillStatus
  paymentStatus?: 'Paid' | 'Partially Paid' | 'Unpaid'
  totalPaid?: number
  balanceDue?: number
  cashier: string
  items: BillItem[]
  refundReason?: string
  refundedAt?: string
  closedAt?: string
  notes?: string
  rentalId?: string
  lessonId?: string
  createdAt?: string
  updatedAt?: string
}

export interface RecentBill {
  billNumber: string
  time: string
  saleType: SaleType
  paymentMethod: PaymentMethod
  total: number
  amountTendered?: number
  changeDue?: number
  splitCashAmount?: number
  splitCardAmount?: number
  status: 'Settled' | 'Refunded' | 'Open' | 'Cancelled'
  cashier: string
  items: BillItem[]
}

export type RentalStatus = 'Available' | 'Rented' | 'In Lesson' | 'Damaged' | 'Under Repair'

export type SurfboardFleetCategory =
  'Soft-top Foamies' | 'Epoxy Funboards' | 'Performance Shortboards' | 'Classic Longboards'

export interface Surfboard {
  id: string
  name: string
  category: SurfboardFleetCategory
  length: string
  finSetup: string
  condition: string
  status: RentalStatus
  currentRentalId?: string
  currentLessonId?: string
  currentCustomer?: string
  rentalStartTime?: string
  lastReturnedTime?: string
  damageNotes?: string
  acquiredDate?: string
}

export type PricingRoundingPolicy = 'prorated' | 'round-up' | 'half-hour'

export type RentalPaymentStatus = 'Paid' | 'Partially Paid' | 'Unpaid'

export interface ActiveRental {
  id: string
  boardId: string
  boardName: string
  boardCategory: SurfboardFleetCategory
  customerName: string
  customerContact?: string
  customerPassportOrId?: string
  startDate: string
  startTime: string
  startTimestamp: number
  hourlyRate: number // Default reference rate: 1000
  agreedHourlyRate: number // Actual agreed rate (e.g. 500, 1000, or custom)
  notes?: string
  billId?: string
  billNumber?: string
}

export interface CompletedRental {
  id: string
  receiptNumber: string // e.g. 'SRR-2026-081'
  rentalId: string
  boardId: string
  boardName: string
  boardCategory?: SurfboardFleetCategory
  customerName: string
  customerContact?: string
  customerPassportOrId?: string
  startDate?: string
  startTime: string
  startTimestamp?: number
  returnDate?: string
  returnTime: string
  returnTimestamp?: number
  durationMinutes: number
  durationDisplay: string
  hourlyRate: number // Reference standard rate: 1000
  agreedRate: number // Actual agreed rate (e.g. 500 or 1000)
  actualRentalCharge: number // Confirmed actual rental charge
  calculatedReferenceCharge?: number // Standard reference charge (duration * 1000/hr)
  discountAmount?: number // Discount amount compared to reference rate
  roundingPolicyUsed: string
  damageFee: number
  totalCharged: number
  totalPaid?: number
  balanceDue?: number
  conditionOnReturn: 'Available' | 'Damaged' | 'Under Repair'
  paymentMethod: PaymentMethod
  paymentStatus: RentalPaymentStatus
  paymentRecordedAt?: string
  notes?: string
  billId?: string
  billNumber?: string
  returnedAt: string
}

export interface SurfboardCategory {
  category: string
  total: number
  amountTendered?: number
  changeDue?: number
  available: number
  rented: number
  underRepair: number
  damaged: number
}

export interface SurfboardRentalSummary {
  totalFleet: number
  available: number
  rented: number
  underRepair: number
  damaged: number
  categories: SurfboardCategory[]
}

export interface Instructor {
  id: string
  name: string
  phone: string
  email: string
  specialties: string
  isActive: boolean
  notes: string
  createdAt?: string
  updatedAt?: string
}

export interface CreateInstructorPayload {
  name: string
  phone?: string
  email?: string
  specialties?: string
  isActive?: boolean
  notes?: string
}

export interface UpdateInstructorPayload {
  name?: string
  phone?: string
  email?: string
  specialties?: string
  isActive?: boolean
  notes?: string
}

export type LessonType = 'Private' | 'Group'
export type LessonPricingMode = 'Per Person' | 'Fixed Session'
export type LessonStatus = 'In Progress' | 'Completed' | 'Cancelled' | 'Upcoming'
export type LessonPaymentStatus = 'Paid' | 'Partially Paid' | 'Unpaid'
export type LessonPaymentMethod =
  | 'Cash'
  | 'Card'
  | 'Online / QR'
  | 'Room Charge'
  | 'Other'

export interface LessonAssignedBoard {
  boardId: string
  boardName: string
  boardCategory?: SurfboardFleetCategory | string
}

export interface SurfLesson {
  id: string
  lessonNumber: string
  customerName: string
  customerContact?: string
  customerPassportOrId?: string
  studentCount: number
  pax: number // backward compatibility alias for studentCount
  lessonType: LessonType
  pricingMode: LessonPricingMode
  unitPrice: number
  sessionPrice: number
  durationMinutes: number
  subtotal: number
  discount: number
  total: number
  amountTendered?: number
  changeDue?: number
  totalPaid?: number
  balanceDue?: number
  paymentMethod: LessonPaymentMethod
  paymentStatus: LessonPaymentStatus
  paymentRecordedAt?: string
  startDate: string
  startTime: string
  time: string // backward compatibility display time
  startTimestamp: number
  endTime: string
  endTimestamp: number
  instructorId?: string
  instructorName?: string
  instructor: string // backward compatibility alias for instructorName
  title: string // backward compatibility title
  level?: 'Beginner' | 'Intermediate' | 'Advanced' | string
  assignedBoards: LessonAssignedBoard[]
  status: LessonStatus
  completedAt?: string
  completedTimestamp?: number | null
  cancelledAt?: string
  cancelReason?: string
  coconutIssued: boolean
  coconutsIssuedCount?: number
  coconutDeclined?: boolean
  coconutNotes?: string
  coconutIssuedAt?: string
  coconutIssuedBy?: string
  coconutMovementId?: string
  notes?: string
  cashier?: string
  billId?: string
  billNumber?: string
  createdAt?: string
  updatedAt?: string
}

export interface CreateWalkinLessonPayload {
  lessonNumber?: string
  customerName: string
  customerContact?: string
  customerPassportOrId?: string
  studentCount: number
  lessonType?: LessonType
  pricingMode: LessonPricingMode
  unitPrice?: number
  sessionPrice?: number
  durationMinutes?: number
  discount?: number
  paymentMethod?: LessonPaymentMethod
  paymentStatus?: LessonPaymentStatus
  startDate?: string
  startTime?: string
  startTimestamp?: number
  instructorId?: string
  assignedBoardIds?: string[]
  notes?: string
  cashier?: string
}

export interface LessonFilters {
  startDate?: string
  endDate?: string
  status?: LessonStatus | string
  paymentStatus?: LessonPaymentStatus | string
  instructorId?: string
}

export interface UpdateLessonStatusPayload {
  status: 'Completed' | 'Cancelled'
  cancelReason?: string
  paymentStatus?: LessonPaymentStatus
  paymentMethod?: LessonPaymentMethod
}

export interface RecordLessonPaymentPayload {
  paymentStatus: 'Paid' | 'Unpaid'
  paymentMethod?: LessonPaymentMethod
}

export interface IssueCoconutResult {
  message: string
  lesson: SurfLesson
  stockMovement: StockMovement
  newCoconutStock: number
  issuedCount?: number
}

export interface LowStockItem {
  id: string
  name: string
  category: string
  currentStock: number
  reorderPoint: number
  unit: string
  urgency: 'Critical' | 'Warning'
}

export interface DashboardMetrics {
  todaySales: number
  salesChangePercent: number
  salesTransactionCount: number
  cashReceived: number
  cashTransactionCount: number
  cashPercentage: number
  cardReceived: number
  cardTransactionCount: number
  cardPercentage: number
  grossProfit: number
  grossProfitMargin: number
  estimatedCOGS: number
}

export type StockStatus = 'In Stock' | 'Low Stock' | 'Out of Stock'

export interface InventoryItem {
  id: string
  productId: string
  productName: string
  category: MenuCategory
  code: string
  currentQuantity: number
  reorderThreshold: number
  unit: string
  unitCost: number
  sellingPrice: number
  supplier?: string
  lastRestockedAt?: string
  isActive?: boolean
  isArchived?: boolean
  legacyCodes?: string[]
}

export type StockMovementType = 'Purchase' | 'Sale' | 'Adjustment' | 'Wastage'

export interface StockMovement {
  id: string
  timestamp: string
  productId: string
  productName: string
  productCode: string
  type: StockMovementType
  quantityChange: number
  balanceAfter: number
  unitCost?: number
  totalCost?: number
  reason: string
  performedBy: string
  notes?: string
}


export interface PosSettings {
  cashierName: string
  restaurantName: string
  restaurantTagline: string
  restaurantPhone: string
  restaurantAddress: string
  restaurantWebsite?: string
  defaultServiceCharge: number
  defaultPaymentMethod: 'Cash' | 'Card'
  autoPrintReceipt: boolean
  instagramHandle: string
  softwareCredit: string
}

export interface ElectronUpdateMessage {
  status: 'checking' | 'available' | 'up-to-date' | 'downloading' | 'downloaded' | 'error' | 'dev'
  text: string
  version?: string
  percent?: number
}

export interface ElectronAPI {
  isElectron: boolean
  getPrinters: () => Promise<Array<{ name: string; displayName?: string; isDefault?: boolean }>>
  printThermal: (options?: { silent?: boolean; deviceName?: string }) => Promise<{ success: boolean; error?: string }>
  minimize: () => void
  maximize: () => void
  close: () => void
  openExternal: (url: string) => Promise<boolean>
  checkForUpdates: () => Promise<{ status: string; text?: string; version?: string }>
  restartAndInstallUpdate: () => Promise<void>
  onUpdateMessage: (callback: (msg: ElectronUpdateMessage) => void) => () => void
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
  }
}

