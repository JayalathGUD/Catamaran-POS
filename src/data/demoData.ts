import {
  ActiveRental,
  CompletedRental,
  DashboardMetrics,
  HistoryBill,
  InventoryItem,
  LowStockItem,
  MenuItem,
  PosProduct,
  RecentBill,
  StockMovement,
  SurfLesson,
  Surfboard,
  SurfboardRentalSummary
} from '../types'

export const formatLKR = (amount: number): string => {
  return (
    'Rs. ' + amount.toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  )
}

export const formatLKRCompact = (amount: number): string => {
  return 'Rs. ' + amount.toLocaleString('en-LK', { maximumFractionDigits: 0 })
}

export const DEMO_DASHBOARD_METRICS: DashboardMetrics = {
  todaySales: 0,
  salesChangePercent: 0,
  salesTransactionCount: 0,
  cashReceived: 0,
  cashTransactionCount: 0,
  cashPercentage: 0,
  cardReceived: 0,
  cardTransactionCount: 0,
  cardPercentage: 0,
  grossProfit: 0,
  grossProfitMargin: 0,
  estimatedCOGS: 0
}

export const DEMO_SURFBOARD_RENTALS: SurfboardRentalSummary = {
  totalFleet: 0,
  available: 0,
  rented: 0,
  underRepair: 0,
  damaged: 0,
  categories: [
    {
      category: 'Soft-top Foamies',
      total: 0,
      available: 0,
      rented: 0,
      underRepair: 0,
      damaged: 0
    },
    {
      category: 'Epoxy Funboards',
      total: 0,
      available: 0,
      rented: 0,
      underRepair: 0,
      damaged: 0
    },
    {
      category: 'Performance Shortboards',
      total: 0,
      available: 0,
      rented: 0,
      underRepair: 0,
      damaged: 0
    },
    {
      category: 'Classic Longboards',
      total: 0,
      available: 0,
      rented: 0,
      underRepair: 0,
      damaged: 0
    }
  ]
}

export const DEMO_SURF_LESSONS: SurfLesson[] = []
export const DEMO_LOW_STOCK_ITEMS: LowStockItem[] = []
export const DEMO_RECENT_BILLS: RecentBill[] = []
export const DEMO_MENU_ITEMS: MenuItem[] = []
export const DEMO_POS_PRODUCTS: PosProduct[] = []
export const DEMO_HISTORY_BILLS: HistoryBill[] = []
export const DEMO_INVENTORY_ITEMS: InventoryItem[] = []
export const DEMO_STOCK_MOVEMENTS: StockMovement[] = []
export const DEMO_SURFBOARDS: Surfboard[] = []
export const DEMO_ACTIVE_RENTALS: ActiveRental[] = []
export const DEMO_COMPLETED_RENTALS: CompletedRental[] = []
