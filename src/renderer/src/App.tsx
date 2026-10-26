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
import { Topbar } from './components/Topbar'
import { getInventoryItems, getOpenBills, getRentals, getSurfboards } from './services/api'
import { ActiveRental, CompletedRental, NavigationPage, Surfboard } from './types'

function App(): React.JSX.Element {
  const [currentPage, setCurrentPage] = useState<NavigationPage>('Dashboard')

  // Live shared state for surfboard fleet and rental transactions
  const [boards, setBoards] = useState<Surfboard[]>([])
  const [activeRentals, setActiveRentals] = useState<ActiveRental[]>([])
  const [completedRentals, setCompletedRentals] = useState<CompletedRental[]>([])
  const [lowStockCount, setLowStockCount] = useState<number>(0)
  const [openBillsCount, setOpenBillsCount] = useState<number>(0)
  const [activeOpenBillId, setActiveOpenBillId] = useState<string | null>(null)

  const refreshOpenBillsCount = async (): Promise<void> => {
    try {
      const openBills = await getOpenBills()
      setOpenBillsCount(openBills.length)
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
          getInventoryItems().catch(() => []),
          getOpenBills().catch(() => [])
        ])
        if (!ignore) {
          setBoards(boardsData)
          setActiveRentals(rentalsData.active)
          setCompletedRentals(rentalsData.completed)
          const lowStock = invData.filter((i) => i.currentQuantity <= i.reorderThreshold).length
          setLowStockCount(lowStock)
          setOpenBillsCount(openBillsData.length)
        }
      } catch (err) {
        console.error('Failed to load initial shared state:', err)
      }
    }
    initSharedState()
    return () => {
      ignore = true
    }
  }, [])

  const placeholderDescriptions: Record<NavigationPage, string> = {
    Dashboard: 'Live operational metrics, financial summary, and quick actions.',
    'POS Billing':
      'Fast counter sales terminal for cafe orders, surfboard rentals, and surf coaching bookings.',
    'Open Bills':
      'Active customer tabs and unpaid orders. Add items over time and collect payment when guests close their tab.',
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
        <Topbar currentPage={currentPage} />

        {/* Dynamic View Rendering */}
        <main className="content-viewport">
          {currentPage === 'Dashboard' ? (
            <Dashboard
              onNavigate={setCurrentPage}
              boards={boards}
              activeRentals={activeRentals}
              completedRentals={completedRentals}
            />
          ) : currentPage === 'POS Billing' ? (
            <PosBilling
              onNavigate={setCurrentPage}
              activeOpenBillId={activeOpenBillId}
              onClearActiveOpenBill={() => setActiveOpenBillId(null)}
              onOpenBillsChanged={refreshOpenBillsCount}
            />
          ) : currentPage === 'Open Bills' ? (
            <OpenBills
              onNavigate={setCurrentPage}
              onSelectBillForAddItems={(billId) => {
                setActiveOpenBillId(billId)
                setCurrentPage('POS Billing')
              }}
            />
          ) : currentPage === 'Bill History' ? (
            <BillHistory onNavigate={setCurrentPage} />
          ) : currentPage === 'Menu Management' ? (
            <MenuManagement onNavigate={setCurrentPage} />
          ) : currentPage === 'Inventory' ? (
            <Inventory onNavigate={setCurrentPage} />
          ) : currentPage === 'Surfboard Rentals' ? (
            <SurfboardRentals
              onNavigate={setCurrentPage}
              boards={boards}
              setBoards={setBoards}
              activeRentals={activeRentals}
              setActiveRentals={setActiveRentals}
              completedRentals={completedRentals}
              setCompletedRentals={setCompletedRentals}
            />
          ) : currentPage === 'Surf Lessons' ? (
            <SurfLessons onNavigate={setCurrentPage} />
          ) : currentPage === 'Expenses' ? (
            <Expenses />
          ) : currentPage === 'Reports' ? (
            <Reports />
          ) : (
            <PlaceholderView
              pageName={currentPage}
              description={placeholderDescriptions[currentPage]}
              onReturnToDashboard={() => setCurrentPage('Dashboard')}
            />
          )}
        </main>
      </div>
    </div>
  )
}

export default App
