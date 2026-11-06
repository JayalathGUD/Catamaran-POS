import React, { useEffect, useMemo, useState } from 'react'
import { formatLKR } from '../data/demoData'
import {
  createSurfboard,
  getRentals,
  getSurfboards,
  returnRental,
  startRental,
  updateSurfboard
} from '../services/api'
import {
  ActiveRental,
  CompletedRental,
  NavigationPage,
  PaymentMethod,
  PosCartItem,
  PricingRoundingPolicy,
  RentalPaymentStatus,
  RentalStatus,
  Surfboard,
  SurfboardFleetCategory
} from '../types'
import {
  IconAlertTriangle,
  IconCard,
  IconCash,
  IconCheck,
  IconClock,
  IconEdit,
  IconEye,
  IconHistory,
  IconInfo,
  IconPlus,
  IconPrinter,
  IconReceipt,
  IconRotateCcw,
  IconSearch,
  IconSliders,
  IconSurfboard,
  IconUser,
  IconX
} from './Icons'

interface SurfboardRentalsProps {
  onNavigate: (page: NavigationPage) => void
  boards?: Surfboard[]
  setBoards?: React.Dispatch<React.SetStateAction<Surfboard[]>>
  activeRentals?: ActiveRental[]
  setActiveRentals?: React.Dispatch<React.SetStateAction<ActiveRental[]>>
  completedRentals?: CompletedRental[]
  setCompletedRentals?: React.Dispatch<React.SetStateAction<CompletedRental[]>>
  onTransferToPosBill?: (cartItem: PosCartItem, customerName?: string) => void
  onOpenTabInPos?: (billId: string) => void
}

type RentalsViewTab = 'fleet' | 'active' | 'history' | 'maintenance'

interface BoardFormData {
  id: string
  name: string
  category: SurfboardFleetCategory
  length: string
  finSetup: string
  condition: string
  status: RentalStatus
  damageNotes: string
}

interface StartRentalFormData {
  boardId: string
  customerName: string
  customerContact: string
  customerPassportOrId: string
  startDate: string
  startTime: string
  startTimestamp: number
  referenceHourlyRate: number // 1000 standard
  rateOption: 'standard' | 'student500' | 'member800' | 'custom'
  agreedHourlyRate: string // '1000' or '500' or custom
  notes: string
}

interface ReturnRentalFormData {
  rentalId: string
  boardId: string
  returnDate: string
  returnTime: string
  returnTimestamp: number
  agreedRate: number
  calculatedSuggestedCharge: number
  actualRentalCharge: string // Editable by cashier
  conditionOnReturn: 'Available' | 'Damaged' | 'Under Repair'
  damageFee: string
  damageNotes: string
  paymentMethod: PaymentMethod
  paymentStatus: RentalPaymentStatus
  notes: string
}

// Module-level baseline session timestamp evaluated outside of React component render cycles
const INITIAL_SESSION_TIMESTAMP = Date.now()

/**
 * Format rental duration into human readable hours and minutes format
 * e.g. "3 hours 15 minutes", "3 hours", "45 minutes"
 */
function formatDurationDisplay(minutes: number): string {
  const safeMinutes = Math.max(0, Math.round(minutes))
  const hours = Math.floor(safeMinutes / 60)
  const remainingMins = safeMinutes % 60

  if (hours > 0 && remainingMins > 0) {
    return `${hours} hour${hours > 1 ? 's' : ''} ${remainingMins} minute${remainingMins > 1 ? 's' : ''}`
  } else if (hours > 0) {
    return `${hours} hour${hours > 1 ? 's' : ''}`
  } else {
    return `${remainingMins} minute${remainingMins !== 1 ? 's' : ''}`
  }
}

export const SurfboardRentals: React.FC<SurfboardRentalsProps> = ({
  onNavigate,
  boards: propBoards,
  setBoards: propSetBoards,
  activeRentals: propActiveRentals,
  setActiveRentals: propSetActiveRentals,
  completedRentals: propCompletedRentals,
  setCompletedRentals: propSetCompletedRentals,
  onTransferToPosBill,
  onOpenTabInPos
}) => {
  // Local fallback states if props are not provided
  const [localBoards, setLocalBoards] = useState<Surfboard[]>([])
  const [localActive, setLocalActive] = useState<ActiveRental[]>([])
  const [localCompleted, setLocalCompleted] = useState<CompletedRental[]>([])
  const [isLoadingFleet, setIsLoadingFleet] = useState<boolean>(false)

  const boards = propBoards ?? localBoards
  const setBoards = propSetBoards ?? setLocalBoards

  const activeRentals = propActiveRentals ?? localActive
  const setActiveRentals = propSetActiveRentals ?? setLocalActive

  const completedRentals = propCompletedRentals ?? localCompleted
  const setCompletedRentals = propSetCompletedRentals ?? setLocalCompleted

  // Load live fleet and rentals from MongoDB Atlas
  const loadLiveRentals = async (): Promise<void> => {
    setIsLoadingFleet(true)
    try {
      const [boardList, rentalData] = await Promise.all([getSurfboards(), getRentals()])
      setBoards(boardList)
      setActiveRentals(rentalData.active)
      setCompletedRentals(rentalData.completed)
    } catch (err: unknown) {
      console.error('Failed to load rentals:', err)
      showToast('Could not load rentals from database.')
    } finally {
      setIsLoadingFleet(false)
    }
  }

  useEffect(() => {
    let ignore = false

    async function initLoad(): Promise<void> {
      try {
        const [boardList, rentalData] = await Promise.all([getSurfboards(), getRentals()])
        if (!ignore) {
          setBoards(boardList)
          setActiveRentals(rentalData.active)
          setCompletedRentals(rentalData.completed)
        }
      } catch (err: unknown) {
        if (!ignore) {
          console.error('Failed to load rentals:', err)
        }
      }
    }

    initLoad()

    return () => {
      ignore = true
    }
  }, [])

  // Global Demo Pricing Policy for partial hour calculation
  const [roundingPolicy, setRoundingPolicy] = useState<PricingRoundingPolicy>('prorated')

  // Tab View
  const [activeTab, setActiveTab] = useState<RentalsViewTab>('fleet')

  // Search & Filters for Fleet
  const [fleetSearch, setFleetSearch] = useState<string>('')
  const [fleetCategoryFilter, setFleetCategoryFilter] = useState<'All' | SurfboardFleetCategory>(
    'All'
  )
  const [fleetStatusFilter, setFleetStatusFilter] = useState<'All' | RentalStatus>('All')

  // Filter for Completed History
  const [historySearch, setHistorySearch] = useState<string>('')
  const [historyPaymentStatusFilter, setHistoryPaymentStatusFilter] = useState<
    'All' | RentalPaymentStatus
  >('All')
  const [historyPaymentMethodFilter, setHistoryPaymentMethodFilter] = useState<
    'All' | 'Cash' | 'Card'
  >('All')
  const [historySourceFilter, setHistorySourceFilter] = useState<'All' | 'Session' | 'Historical'>(
    'All'
  )

  // Start Rental Modal state
  const [isStartModalOpen, setIsStartModalOpen] = useState<boolean>(false)
  const [startForm, setStartForm] = useState<StartRentalFormData>({
    boardId: '',
    customerName: '',
    customerContact: '',
    customerPassportOrId: '',
    startDate: '2026-10-15',
    startTime: '13:00',
    startTimestamp: INITIAL_SESSION_TIMESTAMP,
    referenceHourlyRate: 1000,
    rateOption: 'standard',
    agreedHourlyRate: '1000',
    notes: ''
  })
  const [startErrors, setStartErrors] = useState<Record<string, string>>({})

  // Return Rental Modal state: 'edit' (enter return details & agreed price) | 'confirm' (review & finalize)
  const [isReturnModalOpen, setIsReturnModalOpen] = useState<boolean>(false)
  const [returnStep, setReturnStep] = useState<'edit' | 'confirm'>('edit')
  const [returnErrors, setReturnErrors] = useState<Record<string, string>>({})
  const [returnForm, setReturnForm] = useState<ReturnRentalFormData>({
    rentalId: '',
    boardId: '',
    returnDate: '2026-10-15',
    returnTime: '13:00',
    returnTimestamp: INITIAL_SESSION_TIMESTAMP,
    agreedRate: 1000,
    calculatedSuggestedCharge: 1000,
    actualRentalCharge: '1000',
    conditionOnReturn: 'Available',
    damageFee: '0',
    damageNotes: '',
    paymentMethod: 'Cash',
    paymentStatus: 'Paid',
    notes: ''
  })

  // Board Add/Edit Modal
  const [isBoardModalOpen, setIsBoardModalOpen] = useState<boolean>(false)
  const [editingBoard, setEditingBoard] = useState<Surfboard | null>(null)
  const [boardForm, setBoardForm] = useState<BoardFormData>({
    id: '',
    name: '',
    category: 'Soft-top Foamies',
    length: '8\'0"',
    finSetup: 'Soft Tri-Fin',
    condition: 'Excellent',
    status: 'Available',
    damageNotes: ''
  })
  const [boardErrors, setBoardErrors] = useState<Record<string, string>>({})

  // Conflict confirmation dialog
  const [conflictWarning, setConflictWarning] = useState<{
    board: Surfboard
    actionDescription: string
    onConfirm: () => void
  } | null>(null)

  // 58mm Thermal Receipt Modal State
  const [receiptModalRental, setReceiptModalRental] = useState<CompletedRental | null>(null)
  const [isReprintMode, setIsReprintMode] = useState<boolean>(false)

  // Rental Check-out Slip Modal State
  const [checkoutModalRental, setCheckoutModalRental] = useState<ActiveRental | null>(null)

  // Quick Settle Unpaid Rental Modal
  const [settleRental, setSettleRental] = useState<CompletedRental | null>(null)
  const [settleMethod, setSettleMethod] = useState<PaymentMethod>('Cash')

  // Toast Notification
  const [toast, setToast] = useState<string | null>(null)

  const showToast = (message: string): void => {
    setToast(message)
    setTimeout(() => {
      setToast((curr) => (curr === message ? null : curr))
    }, 4500)
  }

  // Summary Metrics (Exact 7 cards as required)
  const metrics = useMemo(() => {
    const total = boards.length
    const available = boards.filter((b) => b.status === 'Available').length
    const rented = boards.filter((b) => b.status === 'Rented').length
    const damaged = boards.filter((b) => b.status === 'Damaged').length
    const underRepair = boards.filter((b) => b.status === 'Under Repair').length

    // Today's Completed Rental Income (Paid only)
    const paidRentals = completedRentals.filter((r) => r.paymentStatus === 'Paid')
    const completedPaidIncome = paidRentals.reduce((sum, r) => sum + r.totalCharged, 0)

    // Outstanding / Unpaid Rental Charges
    const unpaidRentals = completedRentals.filter((r) => r.paymentStatus === 'Unpaid')
    const outstandingUnpaidCharges = unpaidRentals.reduce((sum, r) => sum + r.totalCharged, 0)

    return {
      total,
      available,
      rented,
      damaged,
      underRepair,
      completedPaidIncome,
      outstandingUnpaidCharges,
      paidCount: paidRentals.length,
      unpaidCount: unpaidRentals.length
    }
  }, [boards, completedRentals])

  // Filtered Fleet
  const filteredBoards = useMemo(() => {
    return boards.filter((b) => {
      if (fleetSearch.trim()) {
        const q = fleetSearch.toLowerCase().trim()
        const matchId = b.id.toLowerCase().includes(q)
        const matchName = b.name.toLowerCase().includes(q)
        const matchCust = b.currentCustomer ? b.currentCustomer.toLowerCase().includes(q) : false
        if (!matchId && !matchName && !matchCust) return false
      }

      if (fleetCategoryFilter !== 'All' && b.category !== fleetCategoryFilter) {
        return false
      }

      if (fleetStatusFilter !== 'All' && b.status !== fleetStatusFilter) {
        return false
      }

      return true
    })
  }, [boards, fleetSearch, fleetCategoryFilter, fleetStatusFilter])

  // Filtered History
  const filteredHistory = useMemo(() => {
    return completedRentals.filter((r) => {
      if (historySearch.trim()) {
        const q = historySearch.toLowerCase().trim()
        const matchReceipt = r.receiptNumber.toLowerCase().includes(q)
        const matchCust = r.customerName.toLowerCase().includes(q)
        const matchBoard =
          r.boardId.toLowerCase().includes(q) || r.boardName.toLowerCase().includes(q)
        if (!matchReceipt && !matchCust && !matchBoard) return false
      }

      if (historyPaymentStatusFilter !== 'All' && r.paymentStatus !== historyPaymentStatusFilter) {
        return false
      }

      if (historyPaymentMethodFilter !== 'All') {
        if (!r.paymentMethod.toLowerCase().includes(historyPaymentMethodFilter.toLowerCase())) {
          return false
        }
      }

      return true
    })
  }, [
    completedRentals,
    historySearch,
    historySourceFilter,
    historyPaymentStatusFilter,
    historyPaymentMethodFilter
  ])

  // Damaged & Under Repair boards
  const maintenanceBoards = useMemo(() => {
    return boards.filter((b) => b.status === 'Damaged' || b.status === 'Under Repair')
  }, [boards])

  // Available boards list for starting a rental (Only Available boards that are NOT currently rented)
  const availableBoards = useMemo(() => {
    return boards.filter(
      (b) => b.status === 'Available' && !activeRentals.some((r) => r.boardId === b.id)
    )
  }, [boards, activeRentals])

  // Open Start Rental Modal
  const handleOpenStartModal = (boardId?: string): void => {
    const defaultBoard = boardId || (availableBoards.length > 0 ? availableBoards[0].id : '')
    const now = new Date()
    const startTimestamp = now.getTime()
    const startDate = now.toISOString().split('T')[0]
    const startTime = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    setStartForm({
      boardId: defaultBoard,
      customerName: '',
      customerContact: '',
      customerPassportOrId: '',
      startDate,
      startTime,
      startTimestamp,
      referenceHourlyRate: 1000,
      rateOption: 'standard',
      agreedHourlyRate: '1000',
      notes: ''
    })
    setStartErrors({})
    setIsStartModalOpen(true)
  }

  // Handle Preset Rate selection in Start Rental Form
  const handleSelectRatePreset = (
    preset: 'standard' | 'student500' | 'member800' | 'custom'
  ): void => {
    if (preset === 'standard') {
      setStartForm((prev) => ({ ...prev, rateOption: preset, agreedHourlyRate: '1000' }))
    } else if (preset === 'student500') {
      setStartForm((prev) => ({ ...prev, rateOption: preset, agreedHourlyRate: '500' }))
    } else if (preset === 'member800') {
      setStartForm((prev) => ({ ...prev, rateOption: preset, agreedHourlyRate: '800' }))
    } else {
      setStartForm((prev) => ({ ...prev, rateOption: preset }))
    }
  }

  // Submit Start Rental
  const handleSaveStartRental = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()

    const errors: Record<string, string> = {}
    if (!startForm.customerName.trim()) {
      errors.customerName = 'Customer name is required'
    }
    if (!startForm.boardId) {
      errors.boardId = 'Please select an available surfboard'
    }

    const agreedRateNum = parseFloat(startForm.agreedHourlyRate)
    if (isNaN(agreedRateNum) || agreedRateNum < 0) {
      errors.agreedHourlyRate = 'Please enter a valid agreed hourly rate (LKR)'
    }

    const targetBoard = boards.find((b) => b.id === startForm.boardId)
    if (!targetBoard || targetBoard.status !== 'Available') {
      errors.boardId = `Board ${startForm.boardId} is not Available for rent (Current status: ${targetBoard?.status || 'Unknown'}).`
    }

    // Prevent a board from being rented again while it already has an active rental
    const alreadyRented = activeRentals.some((r) => r.boardId === startForm.boardId)
    if (alreadyRented) {
      errors.boardId = `Board ${startForm.boardId} already has an active rental and cannot be rented again.`
    }

    if (Object.keys(errors).length > 0) {
      setStartErrors(errors)
      return
    }

    if (!targetBoard) return

    // Automatically capture current local date and time upon checkout
    const now = new Date()
    const startTimestamp = now.getTime()
    const startDate = now.toISOString().split('T')[0]
    const startTime = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

    try {
      const newRental = await startRental({
        boardId: targetBoard.id,
        boardName: targetBoard.name,
        boardCategory: targetBoard.category,
        customerName: startForm.customerName.trim(),
        customerContact: startForm.customerContact.trim() || undefined,
        customerPassportOrId: startForm.customerPassportOrId.trim() || undefined,
        startDate,
        startTime,
        startTimestamp,
        hourlyRate: startForm.referenceHourlyRate,
        agreedHourlyRate: agreedRateNum,
        notes: startForm.notes.trim() || undefined
      })

      // 1. Update Board status to Rented
      setBoards((prev) =>
        prev.map((b) =>
          b.id === targetBoard.id
            ? {
                ...b,
                status: 'Rented',
                currentRentalId: newRental.id,
                currentCustomer: startForm.customerName.trim(),
                rentalStartTime: startTime
              }
            : b
        )
      )

      // 2. Add to active rentals
      setActiveRentals((prev) => [newRental, ...prev])
      setIsStartModalOpen(false)
      setCheckoutModalRental(newRental)

      showToast(
        `🏄 [RENTAL STARTED] Board ${targetBoard.name} rented to ${newRental.customerName}. Open Tab #${newRental.billNumber || ''} created in Open Bills! Agreed Rate: ${formatLKR(newRental.agreedHourlyRate)}/hr.`
      )
    } catch (err: unknown) {
      console.error('Failed to start rental in database:', err)
      const msg = err instanceof Error ? err.message : 'Failed to start rental'
      showToast(`Error: ${msg}`)
    }
  }

  // Active rental currently being returned in return modal
  const currentReturnActive = useMemo(() => {
    return activeRentals.find((r) => r.id === returnForm.rentalId) || activeRentals[0]
  }, [activeRentals, returnForm.rentalId])

  // Open Return Modal
  const handleOpenReturnModal = (boardIdOrRentalId: string): void => {
    const active =
      activeRentals.find((r) => r.id === boardIdOrRentalId || r.boardId === boardIdOrRentalId) ||
      activeRentals[0]

    if (!active) {
      showToast('No active rental record found for this surfboard.')
      return
    }

    const now = new Date()
    const returnTimestamp = now.getTime()
    const returnDate = now.toISOString().split('T')[0]
    const returnTime = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

    const start = active.startTimestamp || returnTimestamp - 60 * 60 * 1000
    const elapsedMs = Math.max(0, returnTimestamp - start)
    const minutes = Math.max(1, Math.round(elapsedMs / (60 * 1000)))
    const agreedRate = active.agreedHourlyRate || active.hourlyRate || 1000

    // Business Rule: Minimum 1-hour charge applies. Additional charges calculated beyond 60 minutes.
    let standardRefCharge = agreedRate
    if (minutes > 60) {
      if (roundingPolicy === 'round-up') {
        standardRefCharge = Math.ceil(minutes / 60) * agreedRate
      } else if (roundingPolicy === 'half-hour') {
        standardRefCharge = agreedRate + Math.ceil((minutes - 60) / 30) * Math.round(agreedRate / 2)
      } else {
        // prorated
        standardRefCharge = agreedRate + Math.round(((minutes - 60) / 60) * agreedRate)
      }
    }

    setReturnStep('edit')
    setReturnErrors({})
    setReturnForm({
      rentalId: active.id,
      boardId: active.boardId,
      returnDate,
      returnTime,
      returnTimestamp,
      agreedRate,
      calculatedSuggestedCharge: standardRefCharge,
      actualRentalCharge: standardRefCharge.toString(),
      conditionOnReturn: 'Available',
      damageFee: '0',
      damageNotes: '',
      paymentMethod: 'Cash',
      paymentStatus: 'Paid',
      notes: ''
    })
    setIsReturnModalOpen(true)
  }

  // Re-synchronize return time to current computer local clock
  const handleSyncReturnTime = (): void => {
    const now = new Date()
    const returnTimestamp = now.getTime()
    const returnDate = now.toISOString().split('T')[0]
    const returnTime = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    setReturnForm((prev) => ({
      ...prev,
      returnTimestamp,
      returnDate,
      returnTime
    }))
  }

  // Duration & standard reference pricing calculation for Return Modal
  const returnCalculation = useMemo(() => {
    if (!currentReturnActive) {
      return {
        minutes: 60,
        hours: 1,
        remainingMinutes: 0,
        durationDisplay: '1 hour',
        standardReferenceRate: 1000,
        calculatedReferenceCharge: 1000,
        isNegativeDuration: false
      }
    }

    const start = currentReturnActive.startTimestamp || INITIAL_SESSION_TIMESTAMP
    const end = returnForm.returnTimestamp || start
    const isNegativeDuration = end < start
    const elapsedMs = isNegativeDuration ? 0 : end - start
    const minutes = Math.max(1, Math.round(elapsedMs / (60 * 1000)))
    const hours = Math.floor(minutes / 60)
    const remainingMinutes = minutes % 60
    const durationDisplay = formatDurationDisplay(minutes)

    const agreedRate = currentReturnActive.agreedHourlyRate || currentReturnActive.hourlyRate || 1000

    // Business Rule: Minimum 1-hour charge applies. Additional charges calculated beyond 60 minutes.
    let calculatedReferenceCharge = agreedRate
    if (minutes > 60) {
      if (roundingPolicy === 'round-up') {
        calculatedReferenceCharge = Math.ceil(minutes / 60) * agreedRate
      } else if (roundingPolicy === 'half-hour') {
        calculatedReferenceCharge = agreedRate + Math.ceil((minutes - 60) / 30) * Math.round(agreedRate / 2)
      } else {
        // prorated
        calculatedReferenceCharge = agreedRate + Math.round(((minutes - 60) / 60) * agreedRate)
      }
    }

    return {
      minutes,
      hours,
      remainingMinutes,
      durationDisplay,
      standardReferenceRate: agreedRate,
      calculatedReferenceCharge,
      isNegativeDuration
    }
  }, [currentReturnActive, returnForm.returnTimestamp, roundingPolicy])

  // Reset actual rental charge to calculated reference charge
  const handleApplySuggestedCharge = (): void => {
    setReturnForm((prev) => ({
      ...prev,
      actualRentalCharge: returnCalculation.calculatedReferenceCharge.toString()
    }))
  }

  // Step 1: Validate Return Modal fields and move to confirmation step
  const handleProceedToConfirm = (e: React.FormEvent): void => {
    e.preventDefault()
    const errors: Record<string, string> = {}

    if (
      returnCalculation.isNegativeDuration ||
      returnForm.returnTimestamp < (currentReturnActive?.startTimestamp || 0)
    ) {
      errors.returnTime = 'Actual return time cannot be earlier than rental start time.'
    }

    const chargeStr = returnForm.actualRentalCharge.trim()
    if (!chargeStr) {
      errors.actualRentalCharge = 'Final Agreed Charge (LKR) is required'
    } else {
      const chargeNum = parseFloat(chargeStr)
      if (isNaN(chargeNum) || chargeNum < 0) {
        errors.actualRentalCharge =
          'Final agreed charge must be a valid non-negative monetary amount'
      }
    }

    const damageNum = parseFloat(returnForm.damageFee)
    if (isNaN(damageNum) || damageNum < 0) {
      errors.damageFee = 'Damage fee must be a valid non-negative number'
    }

    if (returnForm.conditionOnReturn !== 'Available' && !returnForm.damageNotes.trim()) {
      errors.damageNotes = 'Please describe the board condition or inspection notes'
    }

    if (Object.keys(errors).length > 0) {
      setReturnErrors(errors)
      return
    }

    setReturnErrors({})
    setReturnStep('confirm')
  }

  // Step 2: Finalize return rental after staff confirmation
  const handleFinalizeReturn = async (
    skipReceiptModal = false,
    customNote?: string
  ): Promise<CompletedRental | null> => {
    if (!currentReturnActive) return null

    const actualChargeNum = parseFloat(returnForm.actualRentalCharge) || 0
    const damageFeeNum = parseFloat(returnForm.damageFee) || 0
    const totalCharged = actualChargeNum + damageFeeNum
    const calculatedRef = returnCalculation.calculatedReferenceCharge
    const discountAmount = Math.max(0, calculatedRef - actualChargeNum)

    try {
      const finalNote = [returnForm.notes.trim(), customNote].filter(Boolean).join(' - ')
      const completedRecord = await returnRental(currentReturnActive.id, {
        returnDate: returnForm.returnDate,
        returnTime: returnForm.returnTime,
        returnTimestamp: returnForm.returnTimestamp,
        durationMinutes: returnCalculation.minutes,
        durationDisplay: returnCalculation.durationDisplay,
        actualRentalCharge: actualChargeNum,
        calculatedReferenceCharge: calculatedRef,
        discountAmount,
        roundingPolicyUsed:
          actualChargeNum === calculatedRef ? 'Standard Reference Rate' : 'Customer Agreed Rate',
        damageFee: damageFeeNum,
        totalCharged,
        conditionOnReturn: returnForm.conditionOnReturn,
        paymentMethod: returnForm.paymentMethod,
        paymentStatus: returnForm.paymentStatus,
        notes: finalNote || undefined
      })

      // 1. Update Board status and clear active rental
      setBoards((prev) =>
        prev.map((b) =>
          b.id === currentReturnActive.boardId
            ? {
                ...b,
                status: returnForm.conditionOnReturn,
                currentRentalId: undefined,
                currentCustomer: undefined,
                rentalStartTime: undefined,
                lastReturnedTime: `Today, ${returnForm.returnTime}`,
                damageNotes:
                  returnForm.conditionOnReturn !== 'Available'
                    ? returnForm.damageNotes.trim() || 'Damage reported on return inspection'
                    : undefined
              }
            : b
        )
      )

      // 2. Remove from active rentals
      setActiveRentals((prev) => prev.filter((r) => r.id !== currentReturnActive.id))

      // 3. Add to completed rentals history
      setCompletedRentals((prev) => [completedRecord, ...prev])
      setIsReturnModalOpen(false)

      // Show success message and offer receipt preview if not skipping
      showToast(
        `[RETURN COMPLETED] Board ${currentReturnActive.boardName} returned by ${currentReturnActive.customerName}. Duration: ${returnCalculation.durationDisplay}. Final Agreed Charge: ${formatLKR(
          totalCharged
        )} (${returnForm.paymentStatus.toUpperCase()}).`
      )

      if (!skipReceiptModal) {
        setReceiptModalRental(completedRecord)
        setIsReprintMode(false)
      }

      return completedRecord
    } catch (err: unknown) {
      console.error('Failed to complete rental in database:', err)
      const msg = err instanceof Error ? err.message : 'Failed to finalize return'
      showToast(`Error: ${msg}`)
      return null
    }
  }

  // Transfer return charges directly into POS Billing cart & navigate to POS Billing
  const handleFinalizeReturnAndTransferToPos = async (): Promise<void> => {
    if (!currentReturnActive) return

    const actualChargeNum = parseFloat(returnForm.actualRentalCharge) || 0
    const damageFeeNum = parseFloat(returnForm.damageFee) || 0
    const totalCharged = actualChargeNum + damageFeeNum
    const customer = currentReturnActive.customerName
    const boardName = currentReturnActive.boardName

    const completed = await handleFinalizeReturn(true, 'Transferred to POS Billing')
    if (!completed) return

    if (onTransferToPosBill) {
      const rentalItem: PosCartItem = {
        id: `RENTAL-${completed.id}`,
        product: {
          id: `RENTAL-${completed.id}`,
          name: `Surfboard Rental: ${boardName} (${completed.durationDisplay || '1 hr'})`,
          price: totalCharged,
          category: 'Other Services',
          code: 'RENTAL'
        },
        quantity: 1
      }
      onTransferToPosBill(rentalItem, customer)
      showToast(
        `Rental returned & charge (${formatLKR(totalCharged)}) transferred to POS Billing cart!`
      )
    } else {
      onNavigate('POS Billing')
    }
  }

  // Open Add Board Modal
  const handleOpenAddBoardModal = (): void => {
    setEditingBoard(null)
    const nextNum = boards.length + 1
    const nextId = `SB-${nextNum < 10 ? '0' + nextNum : nextNum}`

    setBoardForm({
      id: nextId,
      name: '',
      category: 'Soft-top Foamies',
      length: '8\'0"',
      finSetup: 'Soft Tri-Fin',
      condition: 'Excellent',
      status: 'Available',
      damageNotes: ''
    })
    setBoardErrors({})
    setIsBoardModalOpen(true)
  }

  // Open Edit Board Modal
  const handleOpenEditBoardModal = (board: Surfboard): void => {
    setEditingBoard(board)
    setBoardForm({
      id: board.id,
      name: board.name,
      category: board.category,
      length: board.length,
      finSetup: board.finSetup,
      condition: board.condition,
      status: board.status,
      damageNotes: board.damageNotes || ''
    })
    setBoardErrors({})
    setIsBoardModalOpen(true)
  }

  // Save Board (Add or Edit)
  const handleSaveBoard = (e: React.FormEvent): void => {
    e.preventDefault()

    const errors: Record<string, string> = {}
    if (!boardForm.id.trim()) errors.id = 'Board ID is required'
    if (!boardForm.name.trim()) errors.name = 'Board name/model is required'

    if (Object.keys(errors).length > 0) {
      setBoardErrors(errors)
      return
    }

    // Protection check: if changing status or details of a board with an active rental
    if (editingBoard && editingBoard.status === 'Rented' && boardForm.status !== 'Rented') {
      setConflictWarning({
        board: editingBoard,
        actionDescription: `Change status of Board ${editingBoard.id} from Rented to ${boardForm.status} while rented to ${editingBoard.currentCustomer || 'a customer'}`,
        onConfirm: () => {
          applySaveBoard()
          setConflictWarning(null)
        }
      })
      return
    }

    applySaveBoard()
  }

  const applySaveBoard = async (): Promise<void> => {
    try {
      if (editingBoard) {
        const updated = await updateSurfboard(editingBoard.id, {
          name: boardForm.name.trim(),
          category: boardForm.category,
          length: boardForm.length.trim(),
          finSetup: boardForm.finSetup.trim(),
          condition: boardForm.condition.trim(),
          status: boardForm.status,
          damageNotes:
            boardForm.status === 'Damaged' || boardForm.status === 'Under Repair'
              ? boardForm.damageNotes.trim()
              : undefined
        })
        setBoards((prev) => prev.map((b) => (b.id === editingBoard.id ? updated : b)))
        showToast(`Board "${editingBoard.name}" updated in MongoDB Atlas.`)
      } else {
        const newBoard = await createSurfboard({
          name: boardForm.name.trim(),
          category: boardForm.category,
          length: boardForm.length.trim(),
          finSetup: boardForm.finSetup.trim(),
          condition: boardForm.condition.trim(),
          damageNotes: boardForm.damageNotes.trim() || undefined
        })
        setBoards((prev) => [...prev, newBoard])
        showToast(`Added new surfboard "${newBoard.name}" to MongoDB Atlas fleet.`)
      }
      setIsBoardModalOpen(false)
    } catch (err: unknown) {
      console.error('Failed to save surfboard:', err)
      const msg = err instanceof Error ? err.message : 'Failed to save surfboard'
      showToast(`Error: ${msg}`)
    }
  }

  // Quick mark repaired
  const handleMarkRepaired = async (board: Surfboard): Promise<void> => {
    try {
      const updated = await updateSurfboard(board.id, {
        status: 'Available',
        condition: 'Repaired - Sea Worthy',
        damageNotes: ''
      })
      setBoards((prev) => prev.map((b) => (b.id === board.id ? updated : b)))
      showToast(`Board "${board.name}" repair completed. Restored to Available status.`)
    } catch (err: unknown) {
      console.error('Failed to mark repaired:', err)
      const msg = err instanceof Error ? err.message : 'Failed to update board status'
      showToast(msg)
    }
  }

  // Settle Unpaid Rental Payment (Mark as Paid)
  const handleConfirmSettlePayment = (): void => {
    if (!settleRental) return

    setCompletedRentals((prev) =>
      prev.map((r) =>
        r.id === settleRental.id
          ? {
              ...r,
              paymentStatus: 'Paid',
              paymentMethod: settleMethod,
              paymentRecordedAt: new Date().toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit'
              })
            }
          : r
      )
    )

    showToast(
      `Settled ${formatLKR(settleRental.totalCharged)} for ${
        settleRental.customerName
      } via ${settleMethod}. Added to confirmed rental income.`
    )
    setSettleRental(null)
  }

  // Toggle Payment Status
  const handleTogglePaymentStatus = (rental: CompletedRental): void => {
    if (rental.paymentStatus === 'Unpaid') {
      setSettleRental(rental)
    } else {
      // Toggle back to Unpaid
      setCompletedRentals((prev) =>
        prev.map((r) =>
          r.id === rental.id
            ? {
                ...r,
                paymentStatus: 'Unpaid',
                paymentRecordedAt: undefined
              }
            : r
        )
      )
      showToast(
        `Rental ${rental.receiptNumber} marked as Unpaid (Moved to Outstanding Tab).`
      )
    }
  }

  // Open Receipt Preview
  const handleOpenReceiptPreview = (rental: CompletedRental, isReprint: boolean = false): void => {
    setReceiptModalRental(rental)
    setIsReprintMode(isReprint)
  }

  // Print Receipt Action
  const handlePrintReceipt = (): void => {
    if (!receiptModalRental) return
    window.print()
    showToast(
      `80mm rental receipt format sent to printer (${receiptModalRental.receiptNumber})`
    )
  }

  return (
    <div className="surfboard-rentals-container">
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

      {/* Screen Header */}
      <section className="rentals-header-panel">
        <div className="rentals-header-meta">
          <div className="rentals-top-row">
            <span className="system-location-tag">🏄 Catamaran Surf Club · Dewata Point</span>
            <div
              className="demo-notice-badge"
              style={{ backgroundColor: '#f0fdf4', borderColor: '#bbf7d0', color: '#166534' }}
            >
              <span className="demo-pulse-dot" style={{ backgroundColor: '#22c55e' }} />
              <span>MONGODB ATLAS · LIVE FLEET</span>
            </div>
          </div>
          <h1 className="rentals-heading">Surfboard Rentals</h1>
          <p className="rentals-subheading">
            Live fleet availability, customer checkout records, hourly rate calculator &amp; 80mm
            rental receipts.
          </p>
        </div>

        {/* Header Action Buttons */}
        <div className="rentals-header-actions">
          <button
            type="button"
            className="btn-action btn-action-outline"
            onClick={loadLiveRentals}
            disabled={isLoadingFleet}
            title="Reload surfboard fleet and rentals from database"
          >
            <IconRotateCcw
              size={14}
              style={isLoadingFleet ? { animation: 'spin 1s linear infinite' } : undefined}
            />
            <span>{isLoadingFleet ? 'Loading...' : 'Refresh'}</span>
          </button>

          <button
            type="button"
            className="btn-action btn-action-primary"
            onClick={() => handleOpenStartModal()}
            title="Start a new surfboard rental checkout"
          >
            <IconPlus size={16} />
            <span>Start Rental</span>
          </button>

          <button
            type="button"
            className="btn-action btn-action-secondary"
            onClick={handleOpenAddBoardModal}
            title="Add a new surfboard to the fleet catalogue"
          >
            <IconSurfboard size={16} />
            <span>Add Board</span>
          </button>

          <button
            type="button"
            className="btn-action btn-action-secondary"
            onClick={() => onNavigate('Dashboard')}
            title="Return to operational Dashboard"
          >
            <span>Dashboard</span>
          </button>
        </div>
      </section>

      {/* 7 Summary KPI Metrics Cards as specified by prompt */}
      <section className="rentals-kpi-grid" aria-label="Surfboard Rental Fleet Summary">
        {/* Card 1: Total Surfboards */}
        <div className="rentals-kpi-card">
          <div className="kpi-card-header">
            <span className="kpi-label">Total Surfboards</span>
            <span className="kpi-icon-pill">
              <IconSurfboard size={15} />
            </span>
          </div>
          <div className="kpi-value-row">
            <span className="kpi-main-number">{metrics.total}</span>
            <span className="kpi-sub-text">Active fleet size</span>
          </div>
          <div className="kpi-footer-note">4 Board categories tracked</div>
        </div>

        {/* Card 2: Available */}
        <div className="rentals-kpi-card kpi-card-available">
          <div className="kpi-card-header">
            <span className="kpi-label">Available</span>
            <span className="kpi-icon-pill pill-available">
              <IconCheck size={14} />
            </span>
          </div>
          <div className="kpi-value-row">
            <span className="kpi-main-number text-teal">{metrics.available}</span>
            <span className="kpi-badge badge-green">Ready to rent</span>
          </div>
          <div className="kpi-footer-note">
            {metrics.total > 0 ? Math.round((metrics.available / metrics.total) * 100) : 0}% of
            total fleet
          </div>
        </div>

        {/* Card 3: Currently Rented */}
        <div className="rentals-kpi-card kpi-card-rented">
          <div className="kpi-card-header">
            <span className="kpi-label">Currently Rented</span>
            <span className="kpi-icon-pill pill-rented">
              <IconClock size={14} />
            </span>
          </div>
          <div className="kpi-value-row">
            <span className="kpi-main-number text-blue">{metrics.rented}</span>
            <span className="kpi-badge badge-blue">Out on beach</span>
          </div>
          <div className="kpi-footer-note">{activeRentals.length} active guest sessions</div>
        </div>

        {/* Card 4: Damaged */}
        <div className="rentals-kpi-card">
          <div className="kpi-card-header">
            <span className="kpi-label">Damaged</span>
            <span className="kpi-icon-pill pill-damaged">
              <IconAlertTriangle size={14} />
            </span>
          </div>
          <div className="kpi-value-row">
            <span className="kpi-main-number text-rose">{metrics.damaged}</span>
            <span className="kpi-badge badge-rose">Needs review</span>
          </div>
          <div className="kpi-footer-note">Ding / fin box cracks flagged</div>
        </div>

        {/* Card 5: Under Repair */}
        <div className="rentals-kpi-card">
          <div className="kpi-card-header">
            <span className="kpi-label">Under Repair</span>
            <span className="kpi-icon-pill pill-repair">
              <IconSliders size={14} />
            </span>
          </div>
          <div className="kpi-value-row">
            <span className="kpi-main-number text-amber">{metrics.underRepair}</span>
            <span className="kpi-badge badge-amber">In repair bay</span>
          </div>
          <div className="kpi-footer-note">Workshop epoxy / glassing</div>
        </div>

        {/* Card 6: Today's Completed Rental Income (Paid confirmed) */}
        <div className="rentals-kpi-card kpi-card-income">
          <div className="kpi-card-header">
            <span className="kpi-label">Today&apos;s Rental Income</span>
            <span className="kpi-icon-pill pill-income">
              <IconCash size={14} />
            </span>
          </div>
          <div className="kpi-value-row">
            <span className="kpi-main-number text-teal">
              {formatLKR(metrics.completedPaidIncome)}
            </span>
            <span className="kpi-badge badge-green">{metrics.paidCount} paid</span>
          </div>
          <div className="kpi-footer-note">Combined into Dashboard total sales</div>
        </div>

        {/* Card 7: Outstanding / Unpaid Rental Charges */}
        <div className="rentals-kpi-card kpi-card-outstanding">
          <div className="kpi-card-header">
            <span className="kpi-label">Outstanding / Unpaid</span>
            <span className="kpi-icon-pill pill-unpaid">
              <IconReceipt size={14} />
            </span>
          </div>
          <div className="kpi-value-row">
            <span
              className={`kpi-main-number ${metrics.outstandingUnpaidCharges > 0 ? 'text-amber' : ''}`}
            >
              {formatLKR(metrics.outstandingUnpaidCharges)}
            </span>
            <span className="kpi-badge badge-neutral">{metrics.unpaidCount} pending</span>
          </div>
          <div className="kpi-footer-note">Guest room tabs / uncollected fees</div>
        </div>
      </section>

      {/* Surfboard Rental Pricing Policy Banner */}
      <section className="pricing-policy-banner" aria-label="Surfboard Rental Pricing Policy">
        <div className="policy-info-group">
          <div className="policy-badge-tag">
            <IconSliders size={14} />
            <span>Rental Pricing Policy</span>
          </div>
          <div className="policy-text">
            <strong>Standard Reference Rate: LKR 1,000 / hr</strong>
            <span>
              The calculated reference charge is a guideline, NOT mandatory. Staff may manually
              agree to charge a customer less or another custom amount depending on the customer and
              situation. Final agreed charge is reviewed and confirmed during return check-in.
            </span>
          </div>
        </div>

        {/* 3 Reference Estimation Helper Options */}
        <div
          className="policy-options-toggle"
          role="radiogroup"
          aria-label="Reference calculation selector"
        >
          <button
            type="button"
            className={`policy-toggle-btn ${roundingPolicy === 'prorated' ? 'active' : ''}`}
            onClick={() => setRoundingPolicy('prorated')}
            role="radio"
            aria-checked={roundingPolicy === 'prorated'}
            title="Prorated calculation at LKR 1,000/hour exact to minute"
          >
            <strong>Prorated (Exact)</strong>
            <span>LKR 16.67 / min</span>
          </button>

          <button
            type="button"
            className={`policy-toggle-btn ${roundingPolicy === 'round-up' ? 'active' : ''}`}
            onClick={() => setRoundingPolicy('round-up')}
            role="radio"
            aria-checked={roundingPolicy === 'round-up'}
            title="Ceiled full hour reference rate"
          >
            <strong>Rounded Up (Full Hour)</strong>
            <span>Ceiled full hours</span>
          </button>

          <button
            type="button"
            className={`policy-toggle-btn ${roundingPolicy === 'half-hour' ? 'active' : ''}`}
            onClick={() => setRoundingPolicy('half-hour')}
            role="radio"
            aria-checked={roundingPolicy === 'half-hour'}
            title="30-minute block reference rate"
          >
            <strong>30-Minute Blocks</strong>
            <span>LKR 500 / half hr</span>
          </button>
        </div>
      </section>

      {/* Main Tabs Navigation */}
      <div className="rentals-tabs-bar" role="tablist">
        <button
          type="button"
          className={`rentals-tab-btn ${activeTab === 'fleet' ? 'active' : ''}`}
          onClick={() => setActiveTab('fleet')}
          role="tab"
          aria-selected={activeTab === 'fleet'}
        >
          <IconSurfboard size={15} />
          <span>Fleet Catalogue</span>
          <span className="tab-pill">{boards.length}</span>
        </button>

        <button
          type="button"
          className={`rentals-tab-btn ${activeTab === 'active' ? 'active' : ''}`}
          onClick={() => setActiveTab('active')}
          role="tab"
          aria-selected={activeTab === 'active'}
        >
          <IconClock size={15} />
          <span>Active Beach Rentals</span>
          <span className={`tab-pill ${activeRentals.length > 0 ? 'pill-active-rent' : ''}`}>
            {activeRentals.length}
          </span>
        </button>

        <button
          type="button"
          className={`rentals-tab-btn ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => setActiveTab('history')}
          role="tab"
          aria-selected={activeTab === 'history'}
        >
          <IconHistory size={15} />
          <span>Completed Rentals &amp; Receipts</span>
          <span className="tab-pill">{completedRentals.length}</span>
        </button>

        <button
          type="button"
          className={`rentals-tab-btn ${activeTab === 'maintenance' ? 'active' : ''}`}
          onClick={() => setActiveTab('maintenance')}
          role="tab"
          aria-selected={activeTab === 'maintenance'}
        >
          <IconAlertTriangle size={15} />
          <span>Damaged &amp; Repair Bay</span>
          <span className={`tab-pill ${maintenanceBoards.length > 0 ? 'pill-danger' : ''}`}>
            {maintenanceBoards.length}
          </span>
        </button>
      </div>

      {/* TAB 1: FLEET CATALOGUE */}
      {activeTab === 'fleet' && (
        <section className="tab-content-panel">
          {/* Controls / Filter Bar */}
          <div className="rentals-controls-bar">
            {/* Search Input */}
            <div className="rentals-search-box">
              <IconSearch size={15} className="search-icon" />
              <input
                type="text"
                className="rentals-search-input"
                placeholder="Search board ID, model, or customer name..."
                value={fleetSearch}
                onChange={(e) => setFleetSearch(e.target.value)}
              />
              {fleetSearch && (
                <button
                  type="button"
                  className="search-clear-btn"
                  onClick={() => setFleetSearch('')}
                  aria-label="Clear search"
                >
                  <IconX size={13} />
                </button>
              )}
            </div>

            {/* Category Filter */}
            <div className="rentals-filter-group">
              <label htmlFor="fleet-cat-filter" className="filter-label">
                Category:
              </label>
              <select
                id="fleet-cat-filter"
                className="filter-select"
                value={fleetCategoryFilter}
                onChange={(e) =>
                  setFleetCategoryFilter(e.target.value as 'All' | SurfboardFleetCategory)
                }
              >
                <option value="All">All Categories ({boards.length})</option>
                <option value="Soft-top Foamies">Soft-top Foamies</option>
                <option value="Epoxy Funboards">Epoxy Funboards</option>
                <option value="Performance Shortboards">Performance Shortboards</option>
                <option value="Classic Longboards">Classic Longboards</option>
              </select>
            </div>

            {/* Status Filter */}
            <div className="rentals-filter-group">
              <label htmlFor="fleet-status-filter" className="filter-label">
                Status:
              </label>
              <select
                id="fleet-status-filter"
                className="filter-select"
                value={fleetStatusFilter}
                onChange={(e) => setFleetStatusFilter(e.target.value as 'All' | RentalStatus)}
              >
                <option value="All">All Statuses ({boards.length})</option>
                <option value="Available">Available ({metrics.available})</option>
                <option value="Rented">Rented ({metrics.rented})</option>
                <option value="Damaged">Damaged ({metrics.damaged})</option>
                <option value="Under Repair">Under Repair ({metrics.underRepair})</option>
              </select>
            </div>
          </div>

          {/* Individual Board Table */}
          <div className="rentals-table-card">
            <table className="rentals-data-table">
              <thead>
                <tr>
                  <th style={{ width: '90px' }}>Board ID</th>
                  <th>Board Name / Type</th>
                  <th style={{ width: '130px' }}>Condition</th>
                  <th style={{ width: '120px' }}>Status</th>
                  <th style={{ width: '160px' }}>Active Customer</th>
                  <th style={{ width: '130px' }}>Rental Start Time</th>
                  <th style={{ width: '130px' }}>Last Returned</th>
                  <th style={{ width: '170px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredBoards.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="empty-table-cell">
                      <div className="empty-state-wrap">
                        <IconSurfboard size={36} />
                        <h4>No surfboards match your filter criteria</h4>
                        <p>Try resetting filters or search terms.</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredBoards.map((board) => {
                    const isAvailable = board.status === 'Available'
                    const isRented = board.status === 'Rented'
                    const isDamaged = board.status === 'Damaged'
                    const isRepair = board.status === 'Under Repair'

                    return (
                      <tr key={board.id} className={isRented ? 'row-rented' : ''}>
                        {/* Board ID */}
                        <td className="board-id-cell">
                          <strong>{board.id}</strong>
                        </td>

                        {/* Board Name / Type */}
                        <td>
                          <div className="board-name-cluster">
                            <span className="board-primary-name">{board.name}</span>
                            <div className="board-spec-tags">
                              <span className="spec-tag">{board.category}</span>
                              <span className="spec-tag">{board.length}</span>
                              <span className="spec-tag">{board.finSetup}</span>
                            </div>
                          </div>
                        </td>

                        {/* Condition */}
                        <td>
                          <span
                            className={`condition-pill ${isDamaged ? 'condition-damaged' : ''}`}
                          >
                            {board.condition}
                          </span>
                        </td>

                        {/* Availability Status */}
                        <td>
                          {isAvailable && (
                            <span className="status-pill-available">
                              <IconCheck size={12} />
                              <span>Available</span>
                            </span>
                          )}
                          {isRented && (
                            <span className="status-pill-rented">
                              <IconClock size={12} />
                              <span>Rented</span>
                            </span>
                          )}
                          {isDamaged && (
                            <span className="status-pill-damaged" title={board.damageNotes}>
                              <IconAlertTriangle size={12} />
                              <span>Damaged</span>
                            </span>
                          )}
                          {isRepair && (
                            <span className="status-pill-repair" title={board.damageNotes}>
                              <IconSliders size={12} />
                              <span>Under Repair</span>
                            </span>
                          )}
                        </td>

                        {/* Active Customer */}
                        <td>
                          {isRented && board.currentCustomer ? (
                            <div className="customer-info-inline">
                              <IconUser size={13} className="cust-icon" />
                              <strong className="cust-name">{board.currentCustomer}</strong>
                            </div>
                          ) : (
                            <span className="text-muted-dash">—</span>
                          )}
                        </td>

                        {/* Rental Start Time */}
                        <td>
                          {isRented && board.rentalStartTime ? (
                            <span className="time-badge">{board.rentalStartTime}</span>
                          ) : (
                            <span className="text-muted-dash">—</span>
                          )}
                        </td>

                        {/* Last Returned Time */}
                        <td>
                          <span className="last-returned-text">
                            {board.lastReturnedTime || '—'}
                          </span>
                        </td>

                        {/* Actions */}
                        <td className="actions-cell">
                          <div className="table-actions-cluster">
                            {/* If Available: Start Rental */}
                            {isAvailable && (
                              <button
                                type="button"
                                className="btn-table-action btn-action-rent"
                                onClick={() => handleOpenStartModal(board.id)}
                                title={`Start new rental checkout for ${board.id}`}
                              >
                                <IconPlus size={13} />
                                <span>Rent</span>
                              </button>
                            )}

                            {/* If Rented: Return Board */}
                            {isRented && (
                              <button
                                type="button"
                                className="btn-table-action btn-action-return"
                                onClick={() => handleOpenReturnModal(board.id)}
                                title={`Check-in and return ${board.id}`}
                              >
                                <IconRotateCcw size={13} />
                                <span>Return</span>
                              </button>
                            )}

                            {/* If Damaged / Repair: Quick Mark Repaired */}
                            {(isDamaged || isRepair) && (
                              <button
                                type="button"
                                className="btn-table-action btn-action-repair"
                                onClick={() => handleMarkRepaired(board)}
                                title="Mark repair completed and return to Available"
                              >
                                <IconCheck size={13} />
                                <span>Repaired</span>
                              </button>
                            )}

                            {/* Edit Board */}
                            <button
                              type="button"
                              className="btn-table-action"
                              onClick={() => handleOpenEditBoardModal(board)}
                              title="Edit board specification, condition, or status"
                            >
                              <IconEdit size={13} />
                              <span>Edit</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* TAB 2: ACTIVE BEACH RENTALS */}
      {activeTab === 'active' && (
        <section className="tab-content-panel">
          <div className="active-rentals-header-strip">
            <div className="strip-title-group">
              <span className="strip-icon-box">
                <IconClock size={16} />
              </span>
              <div>
                <h3 className="strip-title">Live Beach Rental Sessions ({activeRentals.length})</h3>
                <p className="strip-subtitle">
                  Boards currently checked out to customers on Dewata Beach. Time and charges
                  calculated using {roundingPolicy.toUpperCase()} policy.
                </p>
              </div>
            </div>

            <button
              type="button"
              className="btn-action btn-action-primary"
              onClick={() => handleOpenStartModal()}
              disabled={availableBoards.length === 0}
              title={
                availableBoards.length === 0
                  ? 'All surfboards are currently rented, damaged, or in repair.'
                  : 'Start a new surfboard rental'
              }
            >
              <IconPlus size={14} />
              <span>Checkout Board</span>
            </button>
          </div>

          {activeRentals.length === 0 ? (
            <div className="empty-rentals-box">
              <IconSurfboard size={48} className="empty-icon-subtle" />
              <h4>No boards currently checked out</h4>
              <p>All fleet surfboards are safely racked or undergoing workshop maintenance.</p>
              <button
                type="button"
                className="btn-action btn-action-primary"
                onClick={() => handleOpenStartModal()}
                disabled={availableBoards.length === 0}
              >
                <IconPlus size={14} />
                <span>Start a New Rental</span>
              </button>
            </div>
          ) : (
            <div className="active-rentals-grid">
              {activeRentals.map((rental) => {
                const elapsedMins = Math.max(
                  15,
                  Math.round((INITIAL_SESSION_TIMESTAMP - rental.startTimestamp) / (60 * 1000))
                )
                const hrs = Math.floor(elapsedMins / 60)
                const mins = elapsedMins % 60
                const agreedRate = rental.agreedHourlyRate || rental.hourlyRate || 1000

                // Minimum 1 hour charge applies (agreedRate). Additional charges calculated beyond 60 minutes.
                let estCost = agreedRate
                if (elapsedMins <= 60) {
                  estCost = agreedRate
                } else if (roundingPolicy === 'round-up') {
                  estCost = Math.ceil(elapsedMins / 60) * agreedRate
                } else if (roundingPolicy === 'half-hour') {
                  estCost = agreedRate + Math.ceil((elapsedMins - 60) / 30) * Math.round(agreedRate / 2)
                } else {
                  // prorated
                  estCost = agreedRate + Math.round(((elapsedMins - 60) / 60) * agreedRate)
                }

                return (
                  <div key={rental.id} className="active-rental-card">
                    <div className="active-card-top">
                      <div className="card-board-badge">
                        <span className="badge-board-id">{rental.boardId}</span>
                        <span className="badge-category">{rental.boardCategory}</span>
                        {rental.billNumber && (
                          <span style={{ fontSize: '11px', color: '#0369a1', fontWeight: 700, background: '#e0f2fe', padding: '2px 7px', borderRadius: '4px', border: '1px solid #bae6fd' }}>
                            Tab: {rental.billNumber}
                          </span>
                        )}
                      </div>
                      <span className="live-pulse-badge">
                        <span className="pulse-dot" />
                        <span>ON WATER</span>
                      </span>
                    </div>

                    <h4 className="active-board-name">{rental.boardName}</h4>

                    <div className="active-customer-box">
                      <div className="customer-row">
                        <IconUser size={14} className="c-icon" />
                        <strong>{rental.customerName}</strong>
                      </div>
                      {rental.customerContact && (
                        <span className="customer-contact-text">{rental.customerContact}</span>
                      )}
                      {rental.customerPassportOrId && (
                        <span className="customer-id-text">Ref: {rental.customerPassportOrId}</span>
                      )}
                    </div>

                    <div className="active-metrics-block">
                      <div className="metric-box">
                        <span className="m-label">Rental Start Time</span>
                        <strong className="m-val">{rental.startTime}</strong>
                      </div>
                      <div className="metric-box">
                        <span className="m-label">Elapsed Time</span>
                        <strong className="m-val text-blue">
                          {hrs > 0 ? `${hrs}h ` : ''}
                          {mins}m
                        </strong>
                      </div>
                      <div className="metric-box">
                        <span className="m-label">Agreed Rate</span>
                        <strong className="m-val">{formatLKR(agreedRate)}/hr</strong>
                      </div>
                      <div className="metric-box">
                        <span className="m-label">Est. Charge</span>
                        <strong className="m-val text-teal">{formatLKR(estCost)}</strong>
                      </div>
                    </div>

                    {rental.notes && (
                      <p className="rental-session-notes" title={rental.notes}>
                        <IconInfo size={12} />
                        <span>{rental.notes}</span>
                      </p>
                    )}

                    <div className="active-card-actions">
                      <button
                        type="button"
                        className="btn-return-action"
                        onClick={() => handleOpenReturnModal(rental.id)}
                      >
                        <IconRotateCcw size={14} />
                        <span>Return Board</span>
                      </button>
                      {rental.billId && (
                        <button
                          type="button"
                          className="btn-slip-action"
                          style={{
                            background: '#eff6ff',
                            color: '#1d4ed8',
                            borderColor: '#bfdbfe',
                            fontWeight: 600
                          }}
                          onClick={() => {
                            if (onOpenTabInPos && rental.billId) {
                              onOpenTabInPos(rental.billId)
                            } else {
                              onNavigate('Open Bills')
                            }
                          }}
                          title="Open this customer's tab in POS to add food and drinks"
                        >
                          <span>🍽️ Add Food</span>
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn-slip-action"
                        onClick={() => setCheckoutModalRental(rental)}
                        title="Print Rental Check-Out Slip / Agreement"
                      >
                        <IconPrinter size={14} />
                        <span>Print Slip</span>
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      )}

      {/* TAB 3: COMPLETED RENTALS & RECEIPTS */}
      {activeTab === 'history' && (
        <section className="tab-content-panel">
          {/* Controls Bar */}
          <div className="rentals-controls-bar">
            {/* Search */}
            <div className="rentals-search-box">
              <IconSearch size={15} className="search-icon" />
              <input
                type="text"
                className="rentals-search-input"
                placeholder="Search receipt no, customer name, or board ID..."
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
              />
              {historySearch && (
                <button
                  type="button"
                  className="search-clear-btn"
                  onClick={() => setHistorySearch('')}
                  aria-label="Clear search"
                >
                  <IconX size={13} />
                </button>
              )}
            </div>

            {/* Payment Status Filter */}
            <div className="rentals-filter-group">
              <label htmlFor="history-status-filter" className="filter-label">
                Payment Status:
              </label>
              <select
                id="history-status-filter"
                className="filter-select"
                value={historyPaymentStatusFilter}
                onChange={(e) =>
                  setHistoryPaymentStatusFilter(e.target.value as 'All' | RentalPaymentStatus)
                }
              >
                <option value="All">All Payments ({completedRentals.length})</option>
                <option value="Paid">Paid Only ({metrics.paidCount})</option>
                <option value="Unpaid">Unpaid Tabs ({metrics.unpaidCount})</option>
              </select>
            </div>

            {/* Payment Method Filter */}
            <div className="rentals-filter-group">
              <label htmlFor="history-method-filter" className="filter-label">
                Method:
              </label>
              <select
                id="history-method-filter"
                className="filter-select"
                value={historyPaymentMethodFilter}
                onChange={(e) =>
                  setHistoryPaymentMethodFilter(e.target.value as 'All' | 'Cash' | 'Card')
                }
              >
                <option value="All">All Methods</option>
                <option value="Cash">Cash Only</option>
                <option value="Card">Card Only</option>
              </select>
            </div>

            {/* Record Scope Filter (Separate newly created session rentals from pre-loaded historical demo) */}
            <div className="rentals-filter-group">
              <label htmlFor="history-source-filter" className="filter-label">
                Scope:
              </label>
              <select
                id="history-source-filter"
                className="filter-select"
                value={historySourceFilter}
                onChange={(e) =>
                  setHistorySourceFilter(e.target.value as 'All' | 'Session' | 'Historical')
                }
              >
                <option value="All">All Live Records ({completedRentals.length})</option>
              </select>
            </div>
          </div>

          {/* History Data Table */}
          <div className="rentals-table-card">
            <table className="rentals-data-table">
              <thead>
                <tr>
                  <th style={{ width: '135px' }}>Receipt No</th>
                  <th style={{ width: '130px' }}>Date &amp; Time</th>
                  <th>Customer Name</th>
                  <th>Board ID / Model</th>
                  <th style={{ width: '100px' }}>Duration</th>
                  <th style={{ width: '120px' }}>Rate &amp; Policy</th>
                  <th style={{ width: '110px' }} className="th-number">
                    Total
                  </th>
                  <th style={{ width: '110px' }}>Payment</th>
                  <th style={{ width: '100px' }}>Status</th>
                  <th style={{ width: '190px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredHistory.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="empty-table-cell">
                      <div className="empty-state-wrap">
                        <IconHistory size={36} />
                        <h4>No completed rental records match this query</h4>
                        <p>Adjust the search query or status filter.</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredHistory.map((record) => {
  const isPaid = record.paymentStatus === 'Paid'
  return (
                      <tr key={record.id}>
                        {/* Receipt No */}
                        <td className="board-id-cell">
                          <strong>{record.receiptNumber}</strong>
                          <span
                            className="auto-captured-badge"
                            style={{ fontSize: '9px', padding: '1px 6px', marginTop: '3px' }}
                            title="Live Database Rental Record"
                          >
                            <span className="auto-dot" />
                            Live Record
                          </span>
                        </td>

                        {/* Date & Time */}
                        <td>
                          <div className="table-datetime-cell">
                            <span className="date-text">{record.returnedAt.split(' ')[0]}</span>
                            <span className="time-text">
                              {record.returnedAt.split(' ').slice(1).join(' ')}
                            </span>
                          </div>
                        </td>

                        {/* Customer */}
                        <td>
                          <div className="customer-cell">
                            <strong>{record.customerName}</strong>
                            {record.customerContact && (
                              <span className="cust-sub-note">{record.customerContact}</span>
                            )}
                          </div>
                        </td>

                        {/* Board */}
                        <td>
                          <div className="board-name-cluster">
                            <span className="board-primary-name">{record.boardName}</span>
                            <span className="spec-tag">{record.boardId}</span>
                          </div>
                        </td>

                        {/* Duration */}
                        <td>
                          <span className="duration-pill">{record.durationDisplay}</span>
                        </td>

                        {/* Rate & Policy */}
                        <td>
                          <div className="policy-info-cell">
                            <span className="rate-text">{formatLKR(record.agreedRate)}/hr</span>
                            <span className="policy-note">{record.roundingPolicyUsed}</span>
                          </div>
                        </td>

                        {/* Total Charged */}
                        <td className="th-number">
                          <strong className="bill-total-amount">
                            {formatLKR(record.totalCharged)}
                          </strong>
                          {record.damageFee > 0 && (
                            <span className="damage-fee-note">
                              +{formatLKR(record.damageFee)} dmg
                            </span>
                          )}
                        </td>

                        {/* Payment Method */}
                        <td>
                          <div className="payment-method-cell">
                            {record.paymentMethod.toLowerCase().includes('cash') ? (
                              <IconCash size={14} className="pay-icon pay-cash" />
                            ) : (
                              <IconCard size={14} className="pay-icon pay-card" />
                            )}
                            <span>{record.paymentMethod}</span>
                          </div>
                        </td>

                        {/* Payment Status */}
                        <td>
                          {isPaid ? (
                            <span className="status-settled-pill">
                              <IconCheck size={12} />
                              <span>Paid</span>
                            </span>
                          ) : (
                            <span className="status-unpaid-pill" title="Pending guest payment">
                              <IconAlertTriangle size={12} />
                              <span>Unpaid</span>
                            </span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="actions-cell">
                          <div className="table-actions-cluster">
                            {/* Preview 58mm Receipt */}
                            <button
                              type="button"
                              className="btn-table-action"
                              onClick={() => handleOpenReceiptPreview(record, false)}
                              title="Preview 80mm thermal receipt"
                            >
                              <IconEye size={13} />
                              <span>Preview</span>
                            </button>

                            {/* Reprint 58mm Receipt */}
                            <button
                              type="button"
                              className="btn-table-action btn-action-reprint"
                              onClick={() => handleOpenReceiptPreview(record, true)}
                              title="Reprint 80mm customer receipt"
                            >
                              <IconPrinter size={13} />
                              <span>Reprint</span>
                            </button>

                            {/* Mark Paid / Toggle Payment */}
                            <button
                              type="button"
                              className={`btn-table-action ${isPaid ? '' : 'btn-action-settle'}`}
                              onClick={() => handleTogglePaymentStatus(record)}
                              title={
                                isPaid
                                  ? 'Toggle to Unpaid (demo testing)'
                                  : 'Settle and mark as Paid'
                              }
                            >
                              {isPaid ? <IconRotateCcw size={12} /> : <IconCash size={12} />}
                              <span>{isPaid ? 'Unpay' : 'Pay'}</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* TAB 4: DAMAGED & REPAIR BAY */}
      {activeTab === 'maintenance' && (
        <section className="tab-content-panel">
          <div className="maintenance-banner-strip">
            <IconAlertTriangle size={20} className="warning-icon" />
            <div>
              <h3 className="maintenance-title">Workshop Repair &amp; Inspection Bay</h3>
              <p className="maintenance-desc">
                Boards listed here have structural dings, fin-box fractures, or rail cracks and
                cannot be rented until inspected, patched with solar-resin/epoxy, and marked safe.
              </p>
            </div>
          </div>

          <div className="maintenance-grid">
            {maintenanceBoards.length === 0 ? (
              <div className="empty-repair-box">
                <IconCheck size={40} className="text-teal" />
                <h4>No boards currently damaged or undergoing repair</h4>
                <p>100% of the surfboard fleet is water-ready and available for guests.</p>
              </div>
            ) : (
              maintenanceBoards.map((board) => (
                <div key={board.id} className="maintenance-card">
                  <div className="maintenance-card-top">
                    <span className="m-board-id">{board.id}</span>
                    <span
                      className={`status-pill-${board.status === 'Damaged' ? 'damaged' : 'repair'}`}
                    >
                      {board.status}
                    </span>
                  </div>

                  <h4 className="m-board-name">{board.name}</h4>
                  <div className="board-spec-tags">
                    <span className="spec-tag">{board.category}</span>
                    <span className="spec-tag">{board.length}</span>
                    <span className="spec-tag">{board.finSetup}</span>
                  </div>

                  <div className="m-inspection-notes">
                    <span className="m-notes-label">Inspection &amp; Damage Report:</span>
                    <p className="m-notes-text">
                      {board.damageNotes ||
                        'Requires shapers workshop review for delamination or ding repair.'}
                    </p>
                  </div>

                  <div className="m-card-footer">
                    <button
                      type="button"
                      className="btn-mark-repaired"
                      onClick={() => handleMarkRepaired(board)}
                    >
                      <IconCheck size={14} />
                      <span>Mark Repaired &amp; Make Available</span>
                    </button>

                    <button
                      type="button"
                      className="btn-action-edit-sm"
                      onClick={() => handleOpenEditBoardModal(board)}
                    >
                      <IconEdit size={13} />
                      <span>Edit Details</span>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      )}

      {/* MODAL 1: START RENTAL CHECKOUT FORM */}
      {isStartModalOpen && (
        <div
          className="modal-backdrop"
          onClick={() => setIsStartModalOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="start-modal-title"
        >
          <div className="rental-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-header-meta">
                <span className="modal-kicker">New Beach Checkout</span>
                <h3 id="start-modal-title" className="modal-title">
                  Start Surfboard Rental
                </h3>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setIsStartModalOpen(false)}
                aria-label="Close dialog"
              >
                <IconX size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveStartRental} className="rental-modal-form">
              <div className="modal-form-body">
                {/* Board Selection */}
                <div className="form-group">
                  <label htmlFor="rental-board-select" className="form-label">
                    Select Surfboard (Available only) *
                  </label>
                  <select
                    id="rental-board-select"
                    className={`form-input ${startErrors.boardId ? 'input-error' : ''}`}
                    value={startForm.boardId}
                    onChange={(e) => setStartForm((prev) => ({ ...prev, boardId: e.target.value }))}
                  >
                    <option value="">-- Choose an Available Surfboard --</option>
                    {availableBoards.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.id} — {b.name} ({b.length}, {b.category})
                      </option>
                    ))}
                  </select>
                  {startErrors.boardId && (
                    <span className="error-message">{startErrors.boardId}</span>
                  )}
                </div>

                {/* Customer Details Grid */}
                <div className="form-grid-2">
                  <div className="form-group">
                    <label htmlFor="rental-cust-name" className="form-label">
                      Customer Name *
                    </label>
                    <input
                      id="rental-cust-name"
                      type="text"
                      className={`form-input ${startErrors.customerName ? 'input-error' : ''}`}
                      placeholder="e.g. Liam Evans / Sarah Connor"
                      value={startForm.customerName}
                      onChange={(e) =>
                        setStartForm((prev) => ({ ...prev, customerName: e.target.value }))
                      }
                    />
                    {startErrors.customerName && (
                      <span className="error-message">{startErrors.customerName}</span>
                    )}
                  </div>

                  <div className="form-group">
                    <label htmlFor="rental-cust-contact" className="form-label">
                      Phone / WhatsApp (Optional)
                    </label>
                    <input
                      id="rental-cust-contact"
                      type="text"
                      className="form-input"
                      placeholder="e.g. +94 77 123 4567"
                      value={startForm.customerContact}
                      onChange={(e) =>
                        setStartForm((prev) => ({ ...prev, customerContact: e.target.value }))
                      }
                    />
                  </div>
                </div>

                {/* Passport / ID & Automatically Recorded Start Time */}
                <div className="form-grid-2">
                  <div className="form-group">
                    <label htmlFor="rental-cust-id" className="form-label">
                      Passport / NIC Ref (Optional)
                    </label>
                    <input
                      id="rental-cust-id"
                      type="text"
                      className="form-input"
                      placeholder="e.g. PASSPORT-UK-129"
                      value={startForm.customerPassportOrId}
                      onChange={(e) =>
                        setStartForm((prev) => ({
                          ...prev,
                          customerPassportOrId: e.target.value
                        }))
                      }
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Rental Start Time (Automatic)</label>
                    <div className="auto-recorded-time-box">
                      <div className="auto-time-content">
                        <IconClock size={16} className="text-teal" />
                        <div>
                          <span className="auto-time-val">{startForm.startTime}</span>
                          <span className="auto-date-val">{startForm.startDate} · Local Clock</span>
                        </div>
                      </div>
                      <span className="auto-captured-badge">
                        <span className="auto-dot" />
                        AUTO-RECORDED
                      </span>
                    </div>
                  </div>
                </div>

                {/* Hourly Rate & Agreed Charge Section (CUSTOMER DEPENDENT PRICING RULE) */}
                <div className="pricing-rule-box">
                  <div className="pricing-rule-header">
                    <IconSliders size={15} />
                    <strong>Pricing Policy &amp; Agreed Rental Charge</strong>
                  </div>

                  <p className="pricing-rule-explainer">
                    Standard reference rate is <strong>LKR 1,000 / hr</strong>. Rental pricing is
                    customer-dependent (e.g. surf camp students or local concession may be charged
                    LKR 500 / hr). Select a preset or enter the agreed rate below:
                  </p>

                  <div className="rate-preset-buttons">
                    <button
                      type="button"
                      className={`rate-preset-btn ${startForm.rateOption === 'standard' ? 'active' : ''}`}
                      onClick={() => handleSelectRatePreset('standard')}
                    >
                      <span>Standard Rate</span>
                      <strong>LKR 1,000 / hr</strong>
                    </button>

                    <button
                      type="button"
                      className={`rate-preset-btn ${startForm.rateOption === 'student500' ? 'active' : ''}`}
                      onClick={() => handleSelectRatePreset('student500')}
                    >
                      <span>Lesson Student</span>
                      <strong>LKR 500 / hr</strong>
                    </button>

                    <button
                      type="button"
                      className={`rate-preset-btn ${startForm.rateOption === 'member800' ? 'active' : ''}`}
                      onClick={() => handleSelectRatePreset('member800')}
                    >
                      <span>Club Member</span>
                      <strong>LKR 800 / hr</strong>
                    </button>

                    <button
                      type="button"
                      className={`rate-preset-btn ${startForm.rateOption === 'custom' ? 'active' : ''}`}
                      onClick={() => handleSelectRatePreset('custom')}
                    >
                      <span>Custom Rate</span>
                      <strong>Custom LKR</strong>
                    </button>
                  </div>

                  <div className="form-group" style={{ marginTop: '10px' }}>
                    <label htmlFor="rental-agreed-rate" className="form-label">
                      Actual Agreed Hourly Rate (LKR) *
                    </label>
                    <div className="input-prefix-box">
                      <span className="input-prefix">LKR</span>
                      <input
                        id="rental-agreed-rate"
                        type="number"
                        min="0"
                        step="50"
                        className={`form-input-prefixed ${
                          startErrors.agreedHourlyRate ? 'input-error' : ''
                        }`}
                        value={startForm.agreedHourlyRate}
                        onChange={(e) =>
                          setStartForm((prev) => ({
                            ...prev,
                            agreedHourlyRate: e.target.value,
                            rateOption: 'custom'
                          }))
                        }
                      />
                    </div>
                    {startErrors.agreedHourlyRate && (
                      <span className="error-message">{startErrors.agreedHourlyRate}</span>
                    )}
                  </div>

                  {/* Pricing preview summary */}
                  <div className="pricing-estimate-preview">
                    <span>
                      Rate: <strong>LKR {startForm.agreedHourlyRate || '0'} / hr</strong>
                    </span>
                    <span>·</span>
                    <span>Est. 1h: {formatLKR(parseFloat(startForm.agreedHourlyRate) || 0)}</span>
                    <span>·</span>
                    <span>
                      Est. 2h: {formatLKR((parseFloat(startForm.agreedHourlyRate) || 0) * 2)}
                    </span>
                  </div>
                </div>

                {/* Optional Notes */}
                <div className="form-group">
                  <label htmlFor="rental-start-notes" className="form-label">
                    Session Notes / Destination (Optional)
                  </label>
                  <textarea
                    id="rental-start-notes"
                    rows={2}
                    className="form-textarea"
                    placeholder="e.g. Student with coach Janaka · Reef break disclaimer acknowledged · Leash checked"
                    value={startForm.notes}
                    onChange={(e) => setStartForm((prev) => ({ ...prev, notes: e.target.value }))}
                  />
                </div>
              </div>

              <div className="modal-footer">
                <span className="demo-disclaimer-text">
                  Live Database · Rental checkout record will be saved
                </span>
                <div className="modal-footer-btns">
                  <button
                    type="button"
                    className="btn-dismiss"
                    onClick={() => setIsStartModalOpen(false)}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="btn-confirm-save">
                    <IconPlus size={15} />
                    <span>Confirm &amp; Checkout Board</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: RETURN BOARD & CALCULATE CHARGE */}
      {isReturnModalOpen &&
        currentReturnActive &&
        (() => {
          const actualChargeNum = parseFloat(returnForm.actualRentalCharge) || 0
          const damageFeeNum = parseFloat(returnForm.damageFee) || 0
          const totalCharged = actualChargeNum + damageFeeNum
          const refChargeNum = returnCalculation.calculatedReferenceCharge
          const hasDiff =
            !isNaN(parseFloat(returnForm.actualRentalCharge)) && actualChargeNum !== refChargeNum
          const diffAmount = actualChargeNum - refChargeNum

          return (
            <div
              className="modal-backdrop"
              onClick={() => setIsReturnModalOpen(false)}
              role="dialog"
              aria-modal="true"
              aria-labelledby="return-modal-title"
            >
              <div className="rental-modal-card modal-lg" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                  <div className="modal-header-meta">
                    <span className="modal-kicker">
                      {returnStep === 'edit'
                        ? 'Check-in Settlement (Step 1 of 2)'
                        : 'Confirmation Summary (Step 2 of 2)'}
                    </span>
                    <h3 id="return-modal-title" className="modal-title">
                      {returnStep === 'edit'
                        ? 'Return Surfboard & Calculate Charge'
                        : 'Review & Confirm Final Agreed Rental Charge'}
                    </h3>
                  </div>
                  <button
                    type="button"
                    className="modal-close-btn"
                    onClick={() => setIsReturnModalOpen(false)}
                    aria-label="Close dialog"
                  >
                    <IconX size={16} />
                  </button>
                </div>

                {returnStep === 'edit' ? (
                  <form onSubmit={handleProceedToConfirm} className="rental-modal-form">
                    <div className="modal-form-body">
                      {/* Active Rental Summary Header */}
                      <div className="return-session-summary">
                        <div className="summary-item">
                          <span className="s-label">Board ID</span>
                          <strong className="s-val text-teal">{currentReturnActive.boardId}</strong>
                        </div>
                        <div className="summary-item">
                          <span className="s-label">Board Model</span>
                          <strong className="s-val">{currentReturnActive.boardName}</strong>
                        </div>
                        <div className="summary-item">
                          <span className="s-label">Customer</span>
                          <strong className="s-val">{currentReturnActive.customerName}</strong>
                        </div>
                        <div className="summary-item">
                          <span className="s-label">Rental Start Time</span>
                          <strong className="s-val">
                            {currentReturnActive.startTime} ({currentReturnActive.startDate})
                          </strong>
                        </div>
                        <div className="summary-item">
                          <span className="s-label">Agreed Rate</span>
                          <strong className="s-val">
                            {formatLKR(currentReturnActive.agreedHourlyRate || 1000)}/hr
                          </strong>
                        </div>
                      </div>

                      {/* Automatically Recorded Actual Return Time & Calculated Rental Duration */}
                      <div className="form-grid-2">
                        <div className="form-group">
                          <label className="form-label">Actual Return Time (Automatic)</label>
                          <div className="auto-recorded-time-box">
                            <div className="auto-time-content">
                              <IconClock size={16} className="text-teal" />
                              <div>
                                <span className="auto-time-val">{returnForm.returnTime}</span>
                                <span className="auto-date-val">
                                  {returnForm.returnDate} · Local Clock
                                </span>
                              </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span className="auto-captured-badge">
                                <span className="auto-dot" />
                                AUTO-CAPTURED
                              </span>
                              <button
                                type="button"
                                className="btn-sync-time"
                                onClick={handleSyncReturnTime}
                                title="Re-synchronize with current local clock"
                              >
                                Sync Now
                              </button>
                            </div>
                          </div>
                          {returnErrors.returnTime && (
                            <span className="error-message">{returnErrors.returnTime}</span>
                          )}
                        </div>

                        <div className="form-group">
                          <label className="form-label">Actual Rental Duration</label>
                          <div className="duration-highlight-box">
                            <IconClock size={15} />
                            <strong>{returnCalculation.durationDisplay}</strong>
                          </div>
                        </div>
                      </div>

                      {/* Pricing Calculation & Editable Final Agreed Charge */}
                      <div className="calculation-card">
                        <div className="calc-header">
                          <div className="calc-title-group">
                            <IconReceipt size={16} />
                            <h4>Rental Pricing &amp; Reference Calculation</h4>
                          </div>
                          <span className="policy-applied-tag">
                            Min. 1-Hr Rate: {formatLKR(returnCalculation.standardReferenceRate)}
                          </span>
                        </div>

                        <div className="calc-breakdown-table">
                          <div className="breakdown-line">
                            <span>Agreed Hourly Rate:</span>
                            <span>{formatLKR(returnCalculation.standardReferenceRate)} / hr</span>
                          </div>
                          <div className="breakdown-line">
                            <span>Actual Rental Duration:</span>
                            <span>{returnCalculation.durationDisplay}</span>
                          </div>
                          <div className="breakdown-line">
                            <span>Pricing Policy Rule:</span>
                            <span style={{ color: '#0284c7', fontWeight: 700 }}>
                              {returnCalculation.minutes <= 60
                                ? '★ Minimum 1-Hour Charge Applied'
                                : `★ 1-Hr Base + ${returnCalculation.minutes - 60}m Extra Time`}
                            </span>
                          </div>
                          <div className="breakdown-line">
                            <span>Calculated Reference Charge:</span>
                            <strong className="text-teal">
                              {formatLKR(returnCalculation.calculatedReferenceCharge)}
                            </strong>
                          </div>
                        </div>

                        {/* Editable Final Agreed Rental Charge */}
                        <div className="actual-charge-field-box">
                          <div className="charge-label-row">
                            <label htmlFor="actual-rental-charge" className="form-label">
                              Final Agreed Charge (LKR) *
                            </label>
                            <button
                              type="button"
                              className="btn-use-suggested"
                              onClick={handleApplySuggestedCharge}
                              title="Reset input to calculated reference charge"
                            >
                              Reset to Reference (
                              {formatLKR(returnCalculation.calculatedReferenceCharge)})
                            </button>
                          </div>

                          <div className="input-prefix-box">
                            <span className="input-prefix">LKR</span>
                            <input
                              id="actual-rental-charge"
                              type="number"
                              min="0"
                              step="50"
                              className={`form-input-prefixed ${
                                returnErrors.actualRentalCharge ? 'input-error' : ''
                              }`}
                              placeholder="Enter final customer-agreed amount"
                              value={returnForm.actualRentalCharge}
                              onChange={(e) =>
                                setReturnForm((prev) => ({
                                  ...prev,
                                  actualRentalCharge: e.target.value
                                }))
                              }
                            />
                          </div>
                          {returnErrors.actualRentalCharge && (
                            <span className="error-message">{returnErrors.actualRentalCharge}</span>
                          )}

                          <span className="field-hint">
                            Business rule: The calculated reference charge is NOT mandatory. Staff
                            may manually enter any agreed amount depending on the customer and
                            situation.
                          </span>

                          {/* Quick preset fill buttons */}
                          <div className="quick-rate-presets">
                            <span
                              style={{
                                fontSize: '11px',
                                color: 'var(--text-muted)',
                                alignSelf: 'center'
                              }}
                            >
                              Quick fill:
                            </span>
                            <button
                              type="button"
                              className="quick-preset-pill"
                              onClick={() =>
                                setReturnForm((prev) => ({
                                  ...prev,
                                  actualRentalCharge:
                                    returnCalculation.calculatedReferenceCharge.toString()
                                }))
                              }
                            >
                              Match Reference (
                              {formatLKR(returnCalculation.calculatedReferenceCharge)})
                            </button>
                            {returnCalculation.hours > 0 &&
                              returnCalculation.remainingMinutes > 0 && (
                                <button
                                  type="button"
                                  className="quick-preset-pill"
                                  onClick={() =>
                                    setReturnForm((prev) => ({
                                      ...prev,
                                      actualRentalCharge: (
                                        returnCalculation.hours * 1000
                                      ).toString()
                                    }))
                                  }
                                >
                                  Round to {returnCalculation.hours}h (
                                  {formatLKR(returnCalculation.hours * 1000)})
                                </button>
                              )}
                            <button
                              type="button"
                              className="quick-preset-pill"
                              onClick={() =>
                                setReturnForm((prev) => ({
                                  ...prev,
                                  actualRentalCharge: '2000'
                                }))
                              }
                            >
                              LKR 2,000 (Concession)
                            </button>
                            <button
                              type="button"
                              className="quick-preset-pill"
                              onClick={() =>
                                setReturnForm((prev) => ({
                                  ...prev,
                                  actualRentalCharge: '1500'
                                }))
                              }
                            >
                              LKR 1,500 (Discount)
                            </button>
                            <button
                              type="button"
                              className="quick-preset-pill"
                              onClick={() =>
                                setReturnForm((prev) => ({
                                  ...prev,
                                  actualRentalCharge: Math.round(
                                    (returnCalculation.minutes / 60) * 500
                                  ).toString()
                                }))
                              }
                            >
                              LKR 500/hr (Student)
                            </button>
                          </div>

                          {/* Difference Warning Alert */}
                          {hasDiff && (
                            <div className="pricing-adjustment-notice">
                              <IconAlertTriangle size={16} />
                              <div>
                                <strong>
                                  Pricing Notice: Agreed charge differs from reference
                                </strong>
                                <p>
                                  {diffAmount < 0
                                    ? `Final agreed charge (${formatLKR(
                                        actualChargeNum
                                      )}) is ${formatLKR(
                                        Math.abs(diffAmount)
                                      )} lower than the standard reference calculation (${formatLKR(
                                        refChargeNum
                                      )}). Please review and confirm this customer concession in the next step.`
                                    : `Final agreed charge (${formatLKR(
                                        actualChargeNum
                                      )}) is ${formatLKR(
                                        diffAmount
                                      )} higher than the standard reference calculation (${formatLKR(
                                        refChargeNum
                                      )}). Please review and confirm in the next step.`}
                                </p>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Board Condition on Return */}
                      <div className="form-group">
                        <label htmlFor="ret-condition" className="form-label">
                          Board Condition on Return *
                        </label>
                        <select
                          id="ret-condition"
                          className="form-input"
                          value={returnForm.conditionOnReturn}
                          onChange={(e) =>
                            setReturnForm((prev) => ({
                              ...prev,
                              conditionOnReturn: e.target.value as
                                'Available' | 'Damaged' | 'Under Repair'
                            }))
                          }
                        >
                          <option value="Available">
                            Available (Safe &amp; Clean - Return to Rack)
                          </option>
                          <option value="Damaged">
                            Damaged (Ding / Fin Fracture - Hold for Shaper)
                          </option>
                          <option value="Under Repair">
                            Under Repair (Transfer to Workshop Immediately)
                          </option>
                        </select>
                      </div>

                      {/* If Damaged or Under Repair: Damage Fee & Notes */}
                      {returnForm.conditionOnReturn !== 'Available' && (
                        <div className="damage-fee-box">
                          <div className="form-group">
                            <label htmlFor="ret-damage-fee" className="form-label">
                              Damage Fee (LKR)
                            </label>
                            <input
                              id="ret-damage-fee"
                              type="number"
                              min="0"
                              step="100"
                              className={`form-input ${returnErrors.damageFee ? 'input-error' : ''}`}
                              placeholder="e.g. 1500"
                              value={returnForm.damageFee}
                              onChange={(e) =>
                                setReturnForm((prev) => ({ ...prev, damageFee: e.target.value }))
                              }
                            />
                            {returnErrors.damageFee && (
                              <span className="error-message">{returnErrors.damageFee}</span>
                            )}
                          </div>
                          <div className="form-group">
                            <label htmlFor="ret-damage-notes" className="form-label">
                              Damage Inspection Notes *
                            </label>
                            <input
                              id="ret-damage-notes"
                              type="text"
                              className={`form-input ${returnErrors.damageNotes ? 'input-error' : ''}`}
                              placeholder="e.g. Tail rail dinged on shallow reef; solar resin patch required"
                              value={returnForm.damageNotes}
                              onChange={(e) =>
                                setReturnForm((prev) => ({ ...prev, damageNotes: e.target.value }))
                              }
                            />
                            {returnErrors.damageNotes && (
                              <span className="error-message">{returnErrors.damageNotes}</span>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Payment Method & Payment Status */}
                      <div className="form-grid-2">
                        <div className="form-group">
                          <label className="form-label">Payment Method</label>
                          <div className="payment-toggle-row">
                            <button
                              type="button"
                              className={`pay-btn ${returnForm.paymentMethod === 'Cash' ? 'active' : ''}`}
                              onClick={() =>
                                setReturnForm((prev) => ({ ...prev, paymentMethod: 'Cash' }))
                              }
                            >
                              <IconCash size={14} />
                              <span>Cash</span>
                            </button>
                            <button
                              type="button"
                              className={`pay-btn ${
                                returnForm.paymentMethod === 'Card (Visa/MC)' ? 'active' : ''
                              }`}
                              onClick={() =>
                                setReturnForm((prev) => ({
                                  ...prev,
                                  paymentMethod: 'Card (Visa/MC)'
                                }))
                              }
                            >
                              <IconCard size={14} />
                              <span>Card (POS)</span>
                            </button>
                          </div>
                        </div>

                        <div className="form-group">
                          <label className="form-label">Payment Status</label>
                          <div className="payment-toggle-row">
                            <button
                              type="button"
                              className={`pay-btn ${
                                returnForm.paymentStatus === 'Paid' ? 'active pay-btn-paid' : ''
                              }`}
                              onClick={() =>
                                setReturnForm((prev) => ({ ...prev, paymentStatus: 'Paid' }))
                              }
                            >
                              <IconCheck size={14} />
                              <span>Paid Now</span>
                            </button>
                            <button
                              type="button"
                              className={`pay-btn ${
                                returnForm.paymentStatus === 'Unpaid' ? 'active pay-btn-unpaid' : ''
                              }`}
                              onClick={() =>
                                setReturnForm((prev) => ({ ...prev, paymentStatus: 'Unpaid' }))
                              }
                            >
                              <IconAlertTriangle size={14} />
                              <span>Unpaid (Tab)</span>
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Total Charged Callout */}
                      <div className="return-total-banner">
                        <div className="total-left">
                          <span className="total-label">Total Amount to Pay</span>
                          <span className="total-sub">
                            Rental: {formatLKR(actualChargeNum)}
                            {damageFeeNum > 0 && ` + Damage: ${formatLKR(damageFeeNum)}`}
                          </span>
                        </div>
                        <strong className="total-due-amount">{formatLKR(totalCharged)}</strong>
                      </div>
                    </div>

                    <div className="modal-footer">
                      <span className="demo-disclaimer-text">
                        Step 1 of 2: Next step requires staff review &amp; confirmation
                      </span>
                      <div className="modal-footer-btns">
                        <button
                          type="button"
                          className="btn-dismiss"
                          onClick={() => setIsReturnModalOpen(false)}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          className="btn-action-primary"
                          style={{
                            backgroundColor: '#0f766e',
                            borderColor: '#0d9488',
                            color: '#ffffff',
                            padding: '0 14px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            fontWeight: 600,
                            borderRadius: '6px',
                            cursor: 'pointer'
                          }}
                          onClick={() => {
                            const errors: Record<string, string> = {}
                            const actualNum = parseFloat(returnForm.actualRentalCharge)
                            if (isNaN(actualNum) || actualNum < 0) {
                              errors.actualRentalCharge =
                                'Final agreed charge must be a valid non-negative amount'
                            }
                            const damageNum = parseFloat(returnForm.damageFee)
                            if (isNaN(damageNum) || damageNum < 0) {
                              errors.damageFee = 'Damage fee must be a valid non-negative number'
                            }
                            if (
                              returnForm.conditionOnReturn !== 'Available' &&
                              !returnForm.damageNotes.trim()
                            ) {
                              errors.damageNotes =
                                'Please describe the board condition or inspection notes'
                            }
                            if (Object.keys(errors).length > 0) {
                              setReturnErrors(errors)
                              return
                            }
                            setReturnErrors({})
                            handleFinalizeReturnAndTransferToPos()
                          }}
                          title="Complete board return and add this rental charge directly to POS Billing cart"
                        >
                          <IconReceipt size={15} />
                          <span>Add to POS Bill ({formatLKR(totalCharged)})</span>
                        </button>
                        <button type="submit" className="btn-confirm-save">
                          <span>Review &amp; Confirm Final Settlement →</span>
                        </button>
                      </div>
                    </div>
                  </form>
                ) : (
                  /* Step 2: Confirmation Summary Screen */
                  <div className="rental-modal-form">
                    <div className="modal-form-body">
                      <div className="confirmation-review-card">
                        <div className="review-table-row">
                          <span className="review-col-label">Customer Name:</span>
                          <span className="review-col-value">
                            {currentReturnActive.customerName}
                          </span>
                        </div>
                        {currentReturnActive.customerContact && (
                          <div className="review-table-row">
                            <span className="review-col-label">Contact / Phone:</span>
                            <span className="review-col-value">
                              {currentReturnActive.customerContact}
                            </span>
                          </div>
                        )}
                        {currentReturnActive.customerPassportOrId && (
                          <div className="review-table-row">
                            <span className="review-col-label">Passport / ID Ref:</span>
                            <span className="review-col-value">
                              {currentReturnActive.customerPassportOrId}
                            </span>
                          </div>
                        )}
                        <div className="review-table-row">
                          <span className="review-col-label">Surfboard Checked Out:</span>
                          <span className="review-col-value">
                            {currentReturnActive.boardId} · {currentReturnActive.boardName} (
                            {currentReturnActive.boardCategory})
                          </span>
                        </div>
                        <div className="review-table-row">
                          <span className="review-col-label">Rental Start Time:</span>
                          <span className="review-col-value">
                            {currentReturnActive.startTime} ({currentReturnActive.startDate})
                          </span>
                        </div>
                        <div className="review-table-row">
                          <span className="review-col-label">Actual Return Time:</span>
                          <span className="review-col-value">
                            {returnForm.returnTime} ({returnForm.returnDate})
                          </span>
                        </div>
                        <div className="review-table-row">
                          <span className="review-col-label">Actual Rental Duration:</span>
                          <span className="review-col-value">
                            {returnCalculation.durationDisplay}
                          </span>
                        </div>
                        <div className="review-table-row">
                          <span className="review-col-label">Standard Reference Rate:</span>
                          <span className="review-col-value">LKR 1,000.00 / hr</span>
                        </div>
                        <div className="review-table-row">
                          <span className="review-col-label">Calculated Reference Charge:</span>
                          <span className="review-col-value">
                            {formatLKR(returnCalculation.calculatedReferenceCharge)}
                          </span>
                        </div>
                        <div className="review-table-row row-highlight">
                          <span className="review-col-label">Final Agreed Charge (LKR):</span>
                          <span className="review-col-value">{formatLKR(actualChargeNum)}</span>
                        </div>
                        {hasDiff && (
                          <div className="review-table-row">
                            <span className="review-col-label">
                              Pricing Adjustment / Concession:
                            </span>
                            <span
                              className={`review-col-value ${diffAmount < 0 ? 'text-teal' : 'text-amber'}`}
                            >
                              {diffAmount < 0
                                ? `-${formatLKR(Math.abs(diffAmount))} (Customer concession agreed)`
                                : `+${formatLKR(diffAmount)} (Custom agreed surcharge)`}
                            </span>
                          </div>
                        )}
                        <div className="review-table-row">
                          <span className="review-col-label">Board Return Condition:</span>
                          <span className="review-col-value">
                            {returnForm.conditionOnReturn === 'Available'
                              ? 'Available (Ready for rack)'
                              : returnForm.conditionOnReturn}
                          </span>
                        </div>
                        {damageFeeNum > 0 && (
                          <div className="review-table-row">
                            <span className="review-col-label">Damage &amp; Repair Fee:</span>
                            <span className="review-col-value text-rose">
                              +{formatLKR(damageFeeNum)}
                            </span>
                          </div>
                        )}
                        <div className="review-table-row">
                          <span className="review-col-label">Payment Method:</span>
                          <span className="review-col-value">{returnForm.paymentMethod}</span>
                        </div>
                        <div className="review-table-row">
                          <span className="review-col-label">Payment Status:</span>
                          <span className="review-col-value">
                            {returnForm.paymentStatus === 'Paid'
                              ? 'Paid Now (Counts towards confirmed rental income)'
                              : 'Unpaid (Held on Guest Tab — Outstanding)'}
                          </span>
                        </div>
                        <div className="review-table-row row-highlight">
                          <span className="review-col-label">Total Amount to Settle / Record:</span>
                          <span className="review-col-value">{formatLKR(totalCharged)}</span>
                        </div>
                      </div>

                      <div className="confirmation-policy-advisory">
                        <IconInfo size={16} />
                        <span>
                          <strong>Staff Confirmation Review:</strong> The calculated reference
                          charge is a guideline and not mandatory. The confirmed customer-agreed
                          charge of <strong>{formatLKR(actualChargeNum)}</strong> will be finalized
                          and printed on the official receipt without being silently overwritten.
                        </span>
                      </div>
                    </div>

                    <div className="modal-footer">
                      <span className="demo-disclaimer-text">
                        Please confirm to complete return &amp; generate receipt preview
                      </span>
                      <div className="modal-footer-btns">
                        <button
                          type="button"
                          className="btn-dismiss"
                          onClick={() => setReturnStep('edit')}
                        >
                          ← Back to Edit
                        </button>
                        <button
                          type="button"
                          className="btn-action-primary"
                          style={{
                            backgroundColor: '#0f766e',
                            borderColor: '#0d9488',
                            color: '#ffffff',
                            padding: '0 18px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            fontWeight: 700,
                            borderRadius: '6px',
                            cursor: 'pointer',
                            boxShadow: '0 2px 4px rgba(15, 118, 110, 0.2)'
                          }}
                          onClick={handleFinalizeReturnAndTransferToPos}
                          title="Complete board return and transfer this charge directly into POS Billing cart"
                        >
                          <IconReceipt size={15} />
                          <span>Add to POS Bill ({formatLKR(totalCharged)})</span>
                        </button>
                        <button
                          type="button"
                          className="btn-confirm-save"
                          onClick={() => handleFinalizeReturn(false)}
                        >
                          <IconCheck size={15} />
                          <span>Confirm &amp; Complete Rental ({formatLKR(totalCharged)})</span>
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )
        })()}

      {/* MODAL 3: 58mm THERMAL RECEIPT PREVIEW / REPRINT (EPSON TM-T81III) */}
      {receiptModalRental && (
        <div
          className="modal-backdrop"
          onClick={() => setReceiptModalRental(null)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="receipt-modal-title"
        >
          <div className="thermal-receipt-modal" onClick={(e) => e.stopPropagation()}>
            <div className="thermal-modal-header">
              <div className="thermal-header-meta">
                <span className="thermal-kicker">
                  {isReprintMode ? 'Reprint Receipt Preview' : 'Rental Receipt Preview'}
                </span>
                <h3 id="receipt-modal-title" className="thermal-title">
                  Epson TM-T81III / Standard (80 mm)
                </h3>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setReceiptModalRental(null)}
                aria-label="Close receipt preview"
              >
                <IconX size={16} />
              </button>
            </div>

            {/* 58mm Receipt Paper Scroll Container */}
            <div className="thermal-paper-scroll">
              <div className="thermal-paper-58mm" id="thermal-print-target">
                {/* Brand Header */}
                <div className="t-center t-header">
                  <span className="t-brand-name">CATAMARAN SURF CLUB</span>
                  <span className="t-branch">DEWATA BEACH, GALLE</span>
                  <span className="t-hotline">TEL: +94 91 224 8890</span>
                </div>

                <div className="t-rule-double" />

                <div className="t-center">
                  <strong className="receipt-doc-title">
                    {isReprintMode
                      ? '*** REPRINT / DUPLICATE RECEIPT ***'
                      : 'SURFBOARD RENTAL RECEIPT'}
                  </strong>
                </div>

                <div className="t-rule-dash" />

                {/* Metadata Block */}
                <div className="t-meta-block">
                  <div className="t-flex">
                    <span>RECEIPT NO:</span>
                    <strong>{receiptModalRental.receiptNumber}</strong>
                  </div>
                  <div className="t-flex">
                    <span>DATE/TIME:</span>
                    <span>{receiptModalRental.returnedAt}</span>
                  </div>
                  <div className="t-flex">
                    <span>CUSTOMER:</span>
                    <strong>{receiptModalRental.customerName}</strong>
                  </div>
                  {receiptModalRental.customerContact && (
                    <div className="t-flex">
                      <span>PHONE:</span>
                      <span>{receiptModalRental.customerContact}</span>
                    </div>
                  )}
                  {receiptModalRental.customerPassportOrId && (
                    <div className="t-flex">
                      <span>REF / ID:</span>
                      <span>{receiptModalRental.customerPassportOrId}</span>
                    </div>
                  )}
                  <div className="t-flex">
                    <span>BOARD:</span>
                    <strong>
                      {receiptModalRental.boardId} - {receiptModalRental.boardName}
                    </strong>
                  </div>
                  <div className="t-flex">
                    <span>CATEGORY:</span>
                    <span>{receiptModalRental.boardCategory || 'Surfboard'}</span>
                  </div>
                  <div className="t-flex">
                    <span>RENTAL START TIME:</span>
                    <strong>
                      {receiptModalRental.startTime}
                      {receiptModalRental.startDate ? ` (${receiptModalRental.startDate})` : ''}
                    </strong>
                  </div>
                  <div className="t-flex">
                    <span>ACTUAL RETURN TIME:</span>
                    <strong>
                      {receiptModalRental.returnTime}
                      {receiptModalRental.returnDate ? ` (${receiptModalRental.returnDate})` : ''}
                    </strong>
                  </div>
                  <div className="t-flex">
                    <span>RENTAL DURATION:</span>
                    <strong>{receiptModalRental.durationDisplay}</strong>
                  </div>
                </div>

                <div className="t-rule-dash" />

                {/* Rate & Breakdown */}
                <div className="t-rate-breakdown">
                  <div className="t-flex">
                    <span>AGREED HOURLY RATE:</span>
                    <span>{formatLKR(receiptModalRental.agreedRate || 1000)} / hr</span>
                  </div>
                  <div className="t-flex">
                    <span>RENTAL DURATION:</span>
                    <strong>{receiptModalRental.durationDisplay}</strong>
                  </div>
                  <div className="t-flex">
                    <span>BASE 1-HR MINIMUM:</span>
                    <span>{formatLKR(receiptModalRental.agreedRate || 1000)}</span>
                  </div>
                  {receiptModalRental.durationMinutes > 60 && (
                    <div className="t-flex">
                      <span>EXTRA TIME ({receiptModalRental.durationMinutes - 60}m):</span>
                      <span>
                        +{formatLKR(
                          Math.max(
                            0,
                            (receiptModalRental.actualRentalCharge || 0) -
                              (receiptModalRental.agreedRate || 1000)
                          )
                        )}
                      </span>
                    </div>
                  )}
                  <div className="t-flex" style={{ fontWeight: 800 }}>
                    <span>RENTAL CHARGE:</span>
                    <strong>{formatLKR(receiptModalRental.actualRentalCharge)}</strong>
                  </div>
                  {receiptModalRental.discountAmount && receiptModalRental.discountAmount > 0 ? (
                    <div className="t-flex">
                      <span>CONCESSION ADJ.:</span>
                      <span>-{formatLKR(receiptModalRental.discountAmount)}</span>
                    </div>
                  ) : null}
                  {receiptModalRental.damageFee > 0 && (
                    <div className="t-flex">
                      <span>DAMAGE / REPAIR:</span>
                      <span>+{formatLKR(receiptModalRental.damageFee)}</span>
                    </div>
                  )}
                </div>

                <div className="t-rule-double" />

                {/* Grand Total */}
                <div className="t-grand-total-row">
                  <span>
                    {receiptModalRental.paymentStatus === 'Paid' ? 'TOTAL PAID:' : 'TOTAL DUE:'}
                  </span>
                  <strong>{formatLKR(receiptModalRental.totalCharged)}</strong>
                </div>

                <div className="t-rule-dash" />

                {/* Payment Info */}
                <div className="t-payment-block">
                  <div className="t-flex">
                    <span>METHOD:</span>
                    <strong>{receiptModalRental.paymentMethod.toUpperCase()}</strong>
                  </div>
                  <div className="t-flex">
                    <span>PAYMENT STATUS:</span>
                    <strong>
                      {receiptModalRental.paymentStatus === 'Paid'
                        ? '*** PAID ***'
                        : '*** UNPAID / GUEST TAB ***'}
                    </strong>
                  </div>
                  {receiptModalRental.paymentRecordedAt && (
                    <div className="t-flex">
                      <span>RECORDED AT:</span>
                      <span>{receiptModalRental.paymentRecordedAt}</span>
                    </div>
                  )}
                  <div className="t-flex">
                    <span>RETURN CONDITION:</span>
                    <span>{receiptModalRental.conditionOnReturn.toUpperCase()}</span>
                  </div>
                </div>

                <div className="t-rule-dash" />

                {/* Thank You Footer */}
                <div className="t-center t-footer">
                  <p>Thank you for surfing with Catamaran Surf Club!</p>
                  <p>Please rinse board with fresh water &amp; return leash to rack.</p>
                  <p>See you on the next tide!</p>
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="thermal-modal-actions">
              <button
                type="button"
                className="btn-print-58mm"
                onClick={handlePrintReceipt}
                title="Print 80mm receipt to Epson TM-T81III"
              >
                <IconPrinter size={16} />
                <span>Print Receipt (Epson TM-T81III)</span>
              </button>

              <button
                type="button"
                className="btn-table-action btn-action-reprint"
                onClick={() => setIsReprintMode((prev) => !prev)}
                title="Toggle Duplicate / Reprint format"
              >
                <IconReceipt size={14} />
                <span>{isReprintMode ? 'Show Original' : 'Reprint Mode'}</span>
              </button>

              <button
                type="button"
                className="btn-dismiss"
                onClick={() => setReceiptModalRental(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3B: RENTAL CHECKOUT SLIP / TICKET */}
      {checkoutModalRental && (
        <div
          className="modal-backdrop"
          onClick={() => setCheckoutModalRental(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="thermal-receipt-modal"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '420px' }}
          >
            <div className="thermal-modal-header">
              <div className="thermal-header-title">
                <IconReceipt size={18} />
                <h3>Rental Check-Out Slip</h3>
              </div>
              <button
                type="button"
                className="btn-modal-close"
                onClick={() => setCheckoutModalRental(null)}
                title="Close slip"
              >
                <IconX size={16} />
              </button>
            </div>

            <div className="thermal-preview-container">
              <div id="thermal-print-target" className="thermal-receipt-paper">
                {/* Header */}
                <div className="t-center t-header">
                  <h2 className="t-brand">CATAMARAN SURF CLUB</h2>
                  <p className="t-sub">AHANGAMA / WELIGAMA · SRI LANKA</p>
                  <p className="t-contact">HOTLINE: +94 77 123 4567</p>
                  <p
                    className="t-slip-badge"
                    style={{ fontWeight: 800, margin: '6px 0 2px', letterSpacing: '0.5px' }}
                  >
                    *** SURFBOARD RENTAL SLIP ***
                  </p>
                </div>

                <div className="t-rule-dash" />

                {/* Ticket Meta */}
                <div className="t-meta-block">
                  <div className="t-flex">
                    <span>RENTAL REF:</span>
                    <strong>
                      {checkoutModalRental.id
                        ? `RNT-${checkoutModalRental.id.slice(-6).toUpperCase()}`
                        : 'NEW RENTAL'}
                    </strong>
                  </div>
                  <div className="t-flex">
                    <span>DATE:</span>
                    <span>{checkoutModalRental.startDate}</span>
                  </div>
                  <div className="t-flex">
                    <span>START TIME:</span>
                    <strong>{checkoutModalRental.startTime}</strong>
                  </div>
                  <div className="t-flex">
                    <span>CUSTOMER:</span>
                    <strong>{checkoutModalRental.customerName}</strong>
                  </div>
                  {checkoutModalRental.customerContact && (
                    <div className="t-flex">
                      <span>PHONE:</span>
                      <span>{checkoutModalRental.customerContact}</span>
                    </div>
                  )}
                  {checkoutModalRental.customerPassportOrId && (
                    <div className="t-flex">
                      <span>ID / PASSPORT:</span>
                      <span>{checkoutModalRental.customerPassportOrId}</span>
                    </div>
                  )}
                </div>

                <div className="t-rule-dash" />

                {/* Board Info */}
                <div className="t-meta-block">
                  <div className="t-flex">
                    <span>SURFBOARD:</span>
                    <strong>{checkoutModalRental.boardName}</strong>
                  </div>
                  <div className="t-flex">
                    <span>BOARD ID:</span>
                    <strong>{checkoutModalRental.boardId}</strong>
                  </div>
                  <div className="t-flex">
                    <span>CATEGORY:</span>
                    <span>{checkoutModalRental.boardCategory}</span>
                  </div>
                  <div className="t-flex">
                    <span>AGREED HOURLY RATE:</span>
                    <strong>
                      {formatLKR(
                        checkoutModalRental.agreedHourlyRate ||
                          checkoutModalRental.hourlyRate ||
                          1000
                      )}{' '}
                      / hr
                    </strong>
                  </div>
                </div>

                <div className="t-rule-double" />

                {/* Pricing Policy Box */}
                <div
                  style={{
                    backgroundColor: '#f8fafc',
                    border: '1px dashed #cbd5e1',
                    borderRadius: '4px',
                    padding: '8px',
                    margin: '6px 0',
                    textAlign: 'center'
                  }}
                >
                  <p
                    style={{
                      margin: '0 0 3px 0',
                      fontWeight: 800,
                      fontSize: '11px',
                      color: '#0f172a'
                    }}
                  >
                    ★ MINIMUM 1 HOUR CHARGE:{' '}
                    {formatLKR(
                      checkoutModalRental.agreedHourlyRate ||
                        checkoutModalRental.hourlyRate ||
                        1000
                    )}
                  </p>
                  <p style={{ margin: 0, fontSize: '10px', color: '#64748b', lineHeight: 1.3 }}>
                    Even if used for less than 1 hour, standard 1-hr minimum applies. Extra time
                    calculated after 1st hour.
                  </p>
                </div>

                <div className="t-rule-dash" />

                {/* Notice & Terms */}
                <div className="t-center t-footer">
                  <p>1. Please inspect board &amp; leash prior to ocean entry.</p>
                  <p>2. Renter is liable for reef dings, fin loss, or breakages.</p>
                  <p>3. Return directly to Catamaran surf rack upon completion.</p>
                  <p style={{ marginTop: '5px', fontWeight: 700 }}>Enjoy your session!</p>
                </div>
              </div>
            </div>

            <div className="thermal-modal-actions">
              {checkoutModalRental.billId && (
                <button
                  type="button"
                  className="btn-print-58mm"
                  style={{ background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)', color: '#fff' }}
                  onClick={() => {
                    const bId = checkoutModalRental.billId
                    setCheckoutModalRental(null)
                    if (onOpenTabInPos && bId) {
                      onOpenTabInPos(bId)
                    } else {
                      onNavigate('Open Bills')
                    }
                  }}
                  title="Open this customer's tab in POS to add cafe food and drinks"
                >
                  <span>🍽️ Add Cafe Items (Open Tab)</span>
                </button>
              )}
              <button
                type="button"
                className="btn-print-58mm"
                onClick={() => window.print()}
                title="Print rental slip"
              >
                <IconPrinter size={16} />
                <span>Print Rental Slip</span>
              </button>
              <button
                type="button"
                className="btn-dismiss"
                onClick={() => setCheckoutModalRental(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: 1-CLICK SETTLE PAYMENT FOR UNPAID RENTAL */}
      {settleRental && (
        <div
          className="modal-backdrop"
          onClick={() => setSettleRental(null)}
          role="dialog"
          aria-modal="true"
        >
          <div className="refund-dialog-card" onClick={(e) => e.stopPropagation()}>
            <div className="refund-dialog-header">
              <div
                className="refund-icon-circle"
                style={{ backgroundColor: '#ecfdf5', color: '#059669' }}
              >
                <IconCash size={20} />
              </div>
              <div>
                <h3 className="refund-title">Settle Unpaid Rental Payment</h3>
                <p className="refund-sub">
                  Receipt: <strong>{settleRental.receiptNumber}</strong> · Customer:{' '}
                  <strong>{settleRental.customerName}</strong>
                </p>
              </div>
            </div>

            <div className="refund-dialog-body">
              <div className="settle-amount-banner">
                <span>Amount Due:</span>
                <strong className="text-teal">{formatLKR(settleRental.totalCharged)}</strong>
              </div>

              <div className="form-group">
                <label className="form-label">Payment Collection Method</label>
                <div className="payment-toggle-row">
                  <button
                    type="button"
                    className={`pay-btn ${settleMethod === 'Cash' ? 'active' : ''}`}
                    onClick={() => setSettleMethod('Cash')}
                  >
                    <IconCash size={14} />
                    <span>Cash</span>
                  </button>
                  <button
                    type="button"
                    className={`pay-btn ${settleMethod === 'Card (Visa/MC)' ? 'active' : ''}`}
                    onClick={() => setSettleMethod('Card (Visa/MC)')}
                  >
                    <IconCard size={14} />
                    <span>Card</span>
                  </button>
                </div>
              </div>

              <p className="field-hint">
                Confirming payment will mark this rental as <strong>PAID</strong>, update the
                Surfboard Rental Income metric card, and increment the Dashboard sales totals.
              </p>
            </div>

            <div className="refund-dialog-actions">
              <button type="button" className="btn-dismiss" onClick={() => setSettleRental(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn-confirm-save"
                onClick={handleConfirmSettlePayment}
              >
                <IconCheck size={14} />
                <span>Confirm Payment Received</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 5: ADD / EDIT BOARD MODAL */}
      {isBoardModalOpen && (
        <div
          className="modal-backdrop"
          onClick={() => setIsBoardModalOpen(false)}
          role="dialog"
          aria-modal="true"
        >
          <div className="rental-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-header-meta">
                <span className="modal-kicker">Fleet Management</span>
                <h3 className="modal-title">
                  {editingBoard ? `Edit Surfboard ${editingBoard.id}` : 'Add New Surfboard'}
                </h3>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setIsBoardModalOpen(false)}
                aria-label="Close dialog"
              >
                <IconX size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveBoard} className="rental-modal-form">
              <div className="modal-form-body">
                <div className="form-grid-2">
                  <div className="form-group">
                    <label htmlFor="b-id" className="form-label">
                      Board ID *
                    </label>
                    <input
                      id="b-id"
                      type="text"
                      disabled={!!editingBoard}
                      className={`form-input ${boardErrors.id ? 'input-error' : ''}`}
                      placeholder="e.g. SB-17"
                      value={boardForm.id}
                      onChange={(e) =>
                        setBoardForm((prev) => ({ ...prev, id: e.target.value.toUpperCase() }))
                      }
                    />
                    {boardErrors.id && <span className="error-message">{boardErrors.id}</span>}
                  </div>

                  <div className="form-group">
                    <label htmlFor="b-cat" className="form-label">
                      Fleet Category
                    </label>
                    <select
                      id="b-cat"
                      className="form-input"
                      value={boardForm.category}
                      onChange={(e) =>
                        setBoardForm((prev) => ({
                          ...prev,
                          category: e.target.value as SurfboardFleetCategory
                        }))
                      }
                    >
                      <option value="Soft-top Foamies">Soft-top Foamies</option>
                      <option value="Epoxy Funboards">Epoxy Funboards</option>
                      <option value="Performance Shortboards">Performance Shortboards</option>
                      <option value="Classic Longboards">Classic Longboards</option>
                    </select>
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="b-name" className="form-label">
                    Board Name / Model *
                  </label>
                  <input
                    id="b-name"
                    type="text"
                    className={`form-input ${boardErrors.name ? 'input-error' : ''}`}
                    placeholder={'e.g. Torq Mod Fish 6\'6" (Mint Green)'}
                    value={boardForm.name}
                    onChange={(e) => setBoardForm((prev) => ({ ...prev, name: e.target.value }))}
                  />
                  {boardErrors.name && <span className="error-message">{boardErrors.name}</span>}
                </div>

                <div className="form-grid-2">
                  <div className="form-group">
                    <label htmlFor="b-len" className="form-label">
                      Length / Dimensions
                    </label>
                    <input
                      id="b-len"
                      type="text"
                      className="form-input"
                      placeholder={'e.g. 7\'6" x 22" x 3"'}
                      value={boardForm.length}
                      onChange={(e) =>
                        setBoardForm((prev) => ({ ...prev, length: e.target.value }))
                      }
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="b-fin" className="form-label">
                      Fin Setup
                    </label>
                    <input
                      id="b-fin"
                      type="text"
                      className="form-input"
                      placeholder="e.g. FCS Thruster / Single Fin"
                      value={boardForm.finSetup}
                      onChange={(e) =>
                        setBoardForm((prev) => ({ ...prev, finSetup: e.target.value }))
                      }
                    />
                  </div>
                </div>

                <div className="form-grid-2">
                  <div className="form-group">
                    <label htmlFor="b-cond" className="form-label">
                      Condition Description
                    </label>
                    <input
                      id="b-cond"
                      type="text"
                      className="form-input"
                      placeholder="e.g. Excellent / Freshly Waxed"
                      value={boardForm.condition}
                      onChange={(e) =>
                        setBoardForm((prev) => ({ ...prev, condition: e.target.value }))
                      }
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="b-status" className="form-label">
                      Availability Status
                    </label>
                    <select
                      id="b-status"
                      className="form-input"
                      value={boardForm.status}
                      onChange={(e) =>
                        setBoardForm((prev) => ({
                          ...prev,
                          status: e.target.value as RentalStatus
                        }))
                      }
                    >
                      <option value="Available">Available (Ready to rent)</option>
                      <option value="Rented">Rented (Active session)</option>
                      <option value="Damaged">Damaged (Needs repair)</option>
                      <option value="Under Repair">Under Repair (In workshop)</option>
                    </select>
                  </div>
                </div>

                {(boardForm.status === 'Damaged' || boardForm.status === 'Under Repair') && (
                  <div className="form-group">
                    <label htmlFor="b-dmg" className="form-label">
                      Damage &amp; Repair Notes
                    </label>
                    <textarea
                      id="b-dmg"
                      rows={2}
                      className="form-textarea"
                      placeholder="Describe damage, cracked rails, fin box fractures, or repair timeline..."
                      value={boardForm.damageNotes}
                      onChange={(e) =>
                        setBoardForm((prev) => ({ ...prev, damageNotes: e.target.value }))
                      }
                    />
                  </div>
                )}
              </div>

              <div className="modal-footer">
                <span className="demo-disclaimer-text">
                  Fleet Inventory · Saved directly to MongoDB Atlas
                </span>
                <div className="modal-footer-btns">
                  <button
                    type="button"
                    className="btn-dismiss"
                    onClick={() => setIsBoardModalOpen(false)}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="btn-confirm-save">
                    <IconCheck size={14} />
                    <span>Save Board Details</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 6: CONFLICT WARNING DIALOG */}
      {conflictWarning && (
        <div
          className="modal-backdrop"
          onClick={() => setConflictWarning(null)}
          role="dialog"
          aria-modal="true"
        >
          <div className="refund-dialog-card" onClick={(e) => e.stopPropagation()}>
            <div className="refund-dialog-header">
              <div className="refund-icon-circle">
                <IconAlertTriangle size={20} />
              </div>
              <div>
                <h3 className="refund-title">Active Rental Warning</h3>
                <p className="refund-sub">Board {conflictWarning.board.id} is currently rented</p>
              </div>
            </div>

            <div className="refund-dialog-body">
              <div className="refund-warning-callout">
                <IconAlertTriangle size={18} className="warning-callout-icon" />
                <div className="warning-callout-text">
                  <strong>Active Session Detected:</strong>
                  <p>
                    {conflictWarning.board.name} is currently checked out to{' '}
                    <strong>{conflictWarning.board.currentCustomer || 'a customer'}</strong>.
                    Changing its status will disrupt active rental tracking.
                  </p>
                  <p>Are you sure you want to proceed?</p>
                </div>
              </div>
            </div>

            <div className="refund-dialog-actions">
              <button
                type="button"
                className="btn-dismiss"
                onClick={() => setConflictWarning(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-action-refund-modal"
                onClick={conflictWarning.onConfirm}
              >
                <span>Yes, Proceed Anyway</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
