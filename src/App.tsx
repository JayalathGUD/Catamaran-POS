import { useEffect, useState } from 'react'
import './assets/main.css'
import { BillHistory } from './components/BillHistory'
import { Dashboard } from './components/Dashboard'
import { Inventory } from './components/Inventory'
import { MenuManagement } from './components/MenuManagement'
import { OpenBills } from './components/OpenBills'
import { PlaceholderView } from './components/PlaceholderView'
import { PosBilling } from './components/PosBilling'
import { Expenses } from './components/Expenses'
import { Reports } from './components/Reports'
import { Sidebar } from './components/Sidebar'
import { SurfboardRentals } from './components/SurfboardRentals'
import { SurfLessons } from './components/SurfLessons'
import { Settings } from './components/Settings'
import { Topbar } from './components/Topbar'
import { getInventoryItems, getOpenBills, getRentals, getSurfboards } from './services/api'
import { ActiveRental, CompletedRental, InventoryItem, NavigationPage, PosCartItem, Surfboard } from './types'

function App(): React.JSX.Element {
  const [currentPage, setCurrentPage] = useState<NavigationPage>('Dashboard')

  // Live shared state for surfboard fleet and rental transactions
  const [boards, setBoards] = useState<Surfboard[]>([])
  const [activeRentals, setActiveRentals] = useState<ActiveRental[]>([])
  const [completedRentals, setCompletedRentals] = useState<CompletedRental[]>([])
  const [lowStockCount, setLowStockCount] = useState<number>(0)
  const [lowStockItems, setLowStockItems] = useState<InventoryItem[]>([])
  const [openBillsCount, setOpenBillsCount] = useState<number>(0)
  const [activeOpenBillId, setActiveOpenBillId] = useState<string | null>(null)
  const [externalCartItem, setExternalCartItem] = useState<{
    item: PosCartItem
    customerName?: string
  } | null>(null)

  const refreshOpenBillsCount = async (): Promise<void> => {
    try {
      const openBills = await getOpenBills()
      setOpenBillsCount(openBills.length)
    } catch {
      // ignore
    }
  }

  const refreshInventoryStock = async (): Promise<void> => {
    try {
      const invData = await getInventoryItems({ status: 'active' }).catch(() => [])
      const lowItems = invData.filter((i) => i.currentQuantity <= i.reorderThreshold && !i.isArchived)
      setLowStockItems(lowItems)
      setLowStockCount(lowItems.length)
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    let ignore = false
    async function initSharedState(): Promise<void> {
      try {
        const [boardsData, rentalsData, invData, openBillsData] = await Promise.all([
          getSurfboards().catch(() => []),
          getRentals().catch(() => ({ active: [], completed: [] })),
          getInventoryItems({ status: 'active' }).catch(() => []),
          getOpenBills().catch(() => [])
        ])
        if (!ignore) {
          setBoards(boardsData)
          setActiveRentals(rentalsData.active)
          setCompletedRentals(rentalsData.completed)
          const lowItems = invData.filter((i) => i.currentQuantity <= i.reorderThreshold && !i.isArchived)
          setLowStockItems(lowItems)
          setLowStockCount(lowItems.length)
          setOpenBillsCount(openBillsData.length)
        }
      } catch (err) {
        console.error('Failed to load initial shared state:', err)
      }
    }
    initSharedState()

    const handleInvUpdated = (): void => {
      refreshInventoryStock()
    }
    window.addEventListener('inventory-updated', handleInvUpdated)
    const interval = setInterval(refreshInventoryStock, 20000)

    return () => {
      ignore = true
      window.removeEventListener('inventory-updated', handleInvUpdated)
      clearInterval(interval)
    }
  }, [])

  const placeholderDescriptions: Record<NavigationPage, string> = {
    Dashboard: 'Live operational metrics, financial summary, and quick actions.',
    'POS Billing':
      'Fast counter sales terminal for cafe orders, surfboard rentals, and surf coaching bookings.',
    'Open Bills':
      'Active customer tabs and unpaid orders. Add items over time and collect payment when guests close their tab.',
    'Customer Credit':
      'Track unpaid customer bills, outstanding debts from rentals and lessons, and record debt settlements.',
    'Bill History': 'Search, filter, and reprint settled customer bills and transaction records.',
    'Menu Management': 'Catalogue management for food, drinks, retail merch, and club merchandise.',
    Inventory:
      'Stock control for cafe supplies, surf accessories, wax, leashes, and reorder alerts.',
    'Surfboard Rentals':
      'Real-time board fleet management, check-out/check-in timers, and repair tracking.',
    'Surf Lessons': 'Instructor assignment, ocean condition logs, and lesson session rosters.',
    Expenses: 'Daily operating expense records, supplier payouts, and petty cash tracking.',
    Reports:
      'Departmental revenue breakdown, cashier shift audits, and business performance summaries.',
    Settings: 'Terminal hardware settings, receipt printer layout, and local POS configuration.'
  }

  return (
    <div className="app-shell">
      {/* Fixed Left Sidebar with Brand Mark and Exact Nav Items */}
      <Sidebar
        currentPage={currentPage}
        onSelectPage={(page) => {
          if (page !== 'POS Billing') {
            setActiveOpenBillId(null)
          }
          setCurrentPage(page)
        }}
        lowStockCount={lowStockCount}
        rentedBoardsCount={activeRentals.length}
        openBillsCount={openBillsCount}
      />

      {/* Main App Content Area */}
      <div className="main-layout">
        {/* Top Header Bar with Breadcrumb and System Status indicator */}
        <Topbar
          currentPage={currentPage}
          lowStockItems={lowStockItems}
          onNavigate={setCurrentPage}
        />

        {/* Dynamic View Rendering */}
        <main className="content-viewport">
          {/* POS Billing Terminal: Kept mounted in background for instant 0ms tab switching & cart preservation */}
          <div
            style={{
              display: currentPage === 'POS Billing' ? 'contents' : 'none'
            }}
          >
            <PosBilling
              onNavigate={setCurrentPage}
              activeOpenBillId={activeOpenBillId}
              onClearActiveOpenBill={() => setActiveOpenBillId(null)}
              onOpenBillsChanged={refreshOpenBillsCount}
              externalCartItem={externalCartItem}
              onClearExternalCartItem={() => setExternalCartItem(null)}
            />
          </div>

          {currentPage === 'Dashboard' && (
            <Dashboard
              onNavigate={setCurrentPage}
              boards={boards}
              activeRentals={activeRentals}
              completedRentals={completedRentals}
            />
          )}
          {currentPage === 'Open Bills' && (
            <OpenBills
              onNavigate={setCurrentPage}
              onSelectBillForAddItems={(billId) => {
                setActiveOpenBillId(billId)
                setCurrentPage('POS Billing')
              }}
            />
          )}
          {currentPage === 'Bill History' && <BillHistory onNavigate={setCurrentPage} />}
          {currentPage === 'Menu Management' && <MenuManagement onNavigate={setCurrentPage} />}
          {currentPage === 'Inventory' && <Inventory onNavigate={setCurrentPage} />}
          {currentPage === 'Surfboard Rentals' && (
            <SurfboardRentals
              onNavigate={setCurrentPage}
              boards={boards}
              setBoards={setBoards}
              activeRentals={activeRentals}
              setActiveRentals={setActiveRentals}
              completedRentals={completedRentals}
              setCompletedRentals={setCompletedRentals}
              onOpenTabInPos={(billId) => {
                setActiveOpenBillId(billId)
                setCurrentPage('POS Billing')
              }}
              onTransferToPosBill={(cartItem, customerName) => {
                setExternalCartItem({ item: cartItem, customerName })
                setCurrentPage('POS Billing')
              }}
            />
          )}
          {currentPage === 'Surf Lessons' && (
            <SurfLessons
              onNavigate={setCurrentPage}
              onOpenTabInPos={(billId) => {
                setActiveOpenBillId(billId)
                setCurrentPage('POS Billing')
              }}
            />
          )}
          {currentPage === 'Expenses' && <Expenses />}
          {currentPage === 'Reports' && <Reports />}
          {currentPage === 'Settings' && <Settings onNavigate={setCurrentPage} />}
        </main>
      </div>
    </div>
  )
}

export default App
