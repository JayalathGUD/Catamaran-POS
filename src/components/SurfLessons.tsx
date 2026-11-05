import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  createInstructor,
  createWalkinLesson,
  declineLessonCoconut,
  getInstructors,
  getInventoryItems,
  getSurfLessonById,
  getSurfLessons,
  getSurfboards,
  issueLessonCoconut,
  recordLessonPayment,
  setInstructorStatus,
  updateInstructor,
  updateLessonStatus
} from '../services/api'
import {
  CreateInstructorPayload,
  CreateWalkinLessonPayload,
  Instructor,
  LessonFilters,
  LessonPaymentMethod,
  LessonPaymentStatus,
  LessonPricingMode,
  LessonStatus,
  LessonType,
  NavigationPage,
  Surfboard,
  SurfLesson,
  UpdateInstructorPayload
} from '../types'
import {
  IconAlertTriangle,
  IconCheck,
  IconClock,
  IconEdit,
  IconEye,
  IconFilter,
  IconInfo,
  IconPlus,
  IconRotateCcw,
  IconSearch,
  IconSurfboard,
  IconSurfLessons,
  IconUser,
  IconX
} from './Icons'

interface SurfLessonsProps {
  onNavigate?: (page: NavigationPage) => void
}

type ActiveViewTab = 'lessons' | 'instructors'
type DateFilterPreset = 'today' | 'this_month' | 'all' | 'custom'

const toLocalDateStr = (d: Date): string => {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const getTodayStr = (): string => toLocalDateStr(new Date())

const getMonthStartStr = (): string => {
  const now = new Date()
  return toLocalDateStr(new Date(now.getFullYear(), now.getMonth(), 1))
}

const formatLKR = (amount: number): string =>
  `Rs. ${Number(amount || 0).toLocaleString('en-LK', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`

export const SurfLessons: React.FC<SurfLessonsProps> = ({ onNavigate: _onNavigate }) => {
  // Navigation tab
  const [activeTab, setActiveTab] = useState<ActiveViewTab>('lessons')

  // Feedback states
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  // Data states
  const [lessons, setLessons] = useState<SurfLesson[]>([])
  const [instructors, setInstructors] = useState<Instructor[]>([])
  const [surfboards, setSurfboards] = useState<Surfboard[]>([])

  // Lesson filters
  const [datePreset, setDatePreset] = useState<DateFilterPreset>('today')
  const [startDate, setStartDate] = useState<string>(getTodayStr())
  const [endDate, setEndDate] = useState<string>(getTodayStr())
  const [statusFilter, setStatusFilter] = useState<string>('All')
  const [paymentFilter, setPaymentFilter] = useState<string>('All')
  const [instructorFilter, setInstructorFilter] = useState<string>('All')
  const [searchQuery, setSearchQuery] = useState<string>('')

  // Instructor filters
  const [instructorSearch, setInstructorSearch] = useState<string>('')
  const [instructorActiveFilter, setInstructorActiveFilter] = useState<string>('all')

  // Modals & Action dialog states
  const [isWalkinModalOpen, setIsWalkinModalOpen] = useState<boolean>(false)
  const [selectedLessonDetail, setSelectedLessonDetail] = useState<SurfLesson | null>(null)
  const [lessonToComplete, setLessonToComplete] = useState<SurfLesson | null>(null)
  const [lessonToCancel, setLessonToCancel] = useState<SurfLesson | null>(null)
  const [cancelReasonInput, setCancelReasonInput] = useState<string>('')
  const [lessonToPay, setLessonToPay] = useState<SurfLesson | null>(null)
  const [payMethodSelection, setPayMethodSelection] = useState<LessonPaymentMethod>('Cash')
  const [lessonForCoconut, setLessonForCoconut] = useState<SurfLesson | null>(null)
  const [coconutQuantity, setCoconutQuantity] = useState<number>(1)
  const [coconutStockAvailable, setCoconutStockAvailable] = useState<number | null>(null)

  // Instructor Modals
  const [isInstructorModalOpen, setIsInstructorModalOpen] = useState<boolean>(false)
  const [editingInstructor, setEditingInstructor] = useState<Instructor | null>(null)
  const [instructorForm, setInstructorForm] = useState({
    name: '',
    phone: '',
    email: '',
    specialties: 'All Levels (Beginner to Advanced)',
    notes: '',
    isActive: true
  })

  // Concurrency guard state
  const [isActionProcessing, setIsActionProcessing] = useState<boolean>(false)

  // ============================================================
  // PHASE 4B: WALKIN REGISTRATION FORM STATE & LOGIC
  // ============================================================
  interface WalkinFormState {
    customerName: string
    customerContact: string
    customerPassportOrId: string
    studentCount: number
    lessonType: LessonType
    pricingMode: LessonPricingMode
    unitPrice: string
    sessionPrice: string
    durationMinutes: number
    discount: string
    paymentMethod: LessonPaymentMethod
    paymentStatus: LessonPaymentStatus
    instructorId: string
    selectedBoardIds: string[]
    notes: string
  }

  const initialWalkinFormState: WalkinFormState = useMemo(
    () => ({
      customerName: '',
      customerContact: '',
      customerPassportOrId: '',
      studentCount: 1,
      lessonType: 'Private',
      pricingMode: 'Per Person',
      unitPrice: '',
      sessionPrice: '',
      durationMinutes: 60,
      discount: '0',
      paymentMethod: 'Cash',
      paymentStatus: 'Paid',
      instructorId: '',
      selectedBoardIds: [],
      notes: ''
    }),
    []
  )

  const [walkinForm, setWalkinForm] = useState<WalkinFormState>(initialWalkinFormState)
  const [walkinError, setWalkinError] = useState<string | null>(null)
  const [isSubmittingWalkin, setIsSubmittingWalkin] = useState<boolean>(false)
  const [boardSearchQuery, setBoardSearchQuery] = useState<string>('')
  const [boardCategoryFilter, setBoardCategoryFilter] = useState<string>('All')

  // Active-only instructors
  const activeInstructors = useMemo(() => {
    return instructors.filter((i) => i.isActive)
  }, [instructors])

  // Available-only surfboards (excludes Rented, In Lesson, Damaged, Under Repair)
  const availableBoards = useMemo(() => {
    return surfboards.filter((b) => b.status === 'Available')
  }, [surfboards])

  const availableBoardCategories = useMemo(() => {
    const cats = new Set(availableBoards.map((b) => b.category).filter(Boolean))
    return ['All', ...Array.from(cats)]
  }, [availableBoards])

  const filteredAvailableBoards = useMemo(() => {
    return availableBoards.filter((board) => {
      const q = boardSearchQuery.trim().toLowerCase()
      const matchesSearch =
        !q ||
        board.name.toLowerCase().includes(q) ||
        (board.length && board.length.toLowerCase().includes(q))
      const matchesCat =
        boardCategoryFilter === 'All' || board.category === boardCategoryFilter
      return matchesSearch && matchesCat
    })
  }, [availableBoards, boardSearchQuery, boardCategoryFilter])

  // Live Pricing Calculator
  const liveCalculation = useMemo(() => {
    const students = Math.max(1, Number(walkinForm.studentCount) || 1)
    const isPerPerson = walkinForm.pricingMode === 'Per Person'
    const unitPrice = parseFloat(walkinForm.unitPrice) || 0
    const sessionPrice = parseFloat(walkinForm.sessionPrice) || 0

    let subtotal = 0
    if (isPerPerson) {
      subtotal = unitPrice * students
    } else {
      subtotal = sessionPrice
    }

    const rawDiscount = parseFloat(walkinForm.discount) || 0
    const discount = Math.min(Math.max(0, rawDiscount), subtotal)
    const total = Math.max(0, subtotal - discount)

    return {
      students,
      isPerPerson,
      unitPrice,
      sessionPrice,
      subtotal,
      rawDiscount,
      discount,
      total
    }
  }, [
    walkinForm.studentCount,
    walkinForm.pricingMode,
    walkinForm.unitPrice,
    walkinForm.sessionPrice,
    walkinForm.discount
  ])

  const handleOpenWalkinModal = async () => {
    setWalkinError(null)
    setWalkinForm(initialWalkinFormState)
    setBoardSearchQuery('')
    setBoardCategoryFilter('All')
    setIsWalkinModalOpen(true)
    try {
      const [freshBoards, freshInst] = await Promise.all([
        getSurfboards().catch(() => surfboards),
        getInstructors().catch(() => instructors)
      ])
      setSurfboards(freshBoards)
      setInstructors(freshInst)
    } catch {
      // Keep existing data if network error
    }
  }

  const handleCloseWalkinModal = () => {
    if (isSubmittingWalkin) return
    setIsWalkinModalOpen(false)
    setWalkinError(null)
  }

  const handleToggleBoardSelection = (boardId: string) => {
    setWalkinForm((prev) => {
      const exists = prev.selectedBoardIds.includes(boardId)
      return {
        ...prev,
        selectedBoardIds: exists
          ? prev.selectedBoardIds.filter((id) => id !== boardId)
          : [...prev.selectedBoardIds, boardId]
      }
    })
  }

  const handleClearSelectedBoards = () => {
    setWalkinForm((prev) => ({ ...prev, selectedBoardIds: [] }))
  }

  const handleSubmitWalkinLesson = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isSubmittingWalkin) return

    // 1. Client-side Validation
    const trimmedName = walkinForm.customerName.trim()
    if (!trimmedName) {
      setWalkinError('Customer name is required.')
      return
    }

    const sCount = Number(walkinForm.studentCount)
    if (!Number.isInteger(sCount) || sCount < 1) {
      setWalkinError('Student count must be a whole number of at least 1.')
      return
    }

    const dur = Number(walkinForm.durationMinutes)
    if (!Number.isFinite(dur) || dur < 15) {
      setWalkinError('Duration must be at least 15 minutes.')
      return
    }

    if (walkinForm.pricingMode === 'Per Person') {
      const uPrice = parseFloat(walkinForm.unitPrice)
      if (isNaN(uPrice) || uPrice <= 0) {
        setWalkinError('Please enter a valid unit price per person (greater than Rs. 0).')
        return
      }
    } else {
      const sPrice = parseFloat(walkinForm.sessionPrice)
      if (isNaN(sPrice) || sPrice <= 0) {
        setWalkinError('Please enter a valid fixed session price (greater than Rs. 0).')
        return
      }
    }

    const disc = parseFloat(walkinForm.discount) || 0
    if (disc < 0) {
      setWalkinError('Discount cannot be negative.')
      return
    }
    if (disc > liveCalculation.subtotal) {
      setWalkinError(`Discount cannot exceed subtotal (${formatLKR(liveCalculation.subtotal)}).`)
      return
    }

    // 2. Prepare payload
    const now = new Date()
    const payload: CreateWalkinLessonPayload = {
      customerName: trimmedName,
      customerContact: walkinForm.customerContact.trim() || undefined,
      customerPassportOrId: walkinForm.customerPassportOrId.trim() || undefined,
      studentCount: sCount,
      lessonType: walkinForm.lessonType,
      pricingMode: walkinForm.pricingMode,
      unitPrice: walkinForm.pricingMode === 'Per Person' ? parseFloat(walkinForm.unitPrice) : 0,
      sessionPrice: walkinForm.pricingMode === 'Fixed Session' ? parseFloat(walkinForm.sessionPrice) : 0,
      durationMinutes: dur,
      discount: disc,
      paymentMethod: walkinForm.paymentMethod,
      paymentStatus: walkinForm.paymentStatus,
      startDate: toLocalDateStr(now),
      startTime: now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }),
      startTimestamp: now.getTime(),
      instructorId: walkinForm.instructorId || undefined,
      assignedBoardIds: walkinForm.selectedBoardIds.length > 0 ? walkinForm.selectedBoardIds : [],
      notes: walkinForm.notes.trim() || undefined,
      cashier: 'Cashier'
    }

    // 3. Concurrency-safe submit
    setIsSubmittingWalkin(true)
    setWalkinError(null)

    try {
      const createdLesson = await createWalkinLesson(payload)
      setIsWalkinModalOpen(false)
      setWalkinForm(initialWalkinFormState)
      showToast(`Lesson #${createdLesson.lessonNumber} registered successfully for ${createdLesson.customerName}!`, 'success')
      await loadData()
    } catch (err: any) {
      console.error('Walk-in lesson registration error:', err)
      setWalkinError(err?.message || 'Failed to register walk-in lesson. Please check details and try again.')
    } finally {
      setIsSubmittingWalkin(false)
    }
  }

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ message, type })
    setTimeout(() => {
      setToast((prev) => (prev?.message === message ? null : prev))
    }, 4500)
  }, [])

  // Load Lessons & Instructors
  const loadData = useCallback(async () => {
    setIsLoading(true)
    setFetchError(null)

    try {
      const filters: LessonFilters = {}
      if (startDate) filters.startDate = startDate
      if (endDate) filters.endDate = endDate
      if (statusFilter !== 'All') filters.status = statusFilter as LessonStatus
      if (paymentFilter !== 'All') filters.paymentStatus = paymentFilter
      if (instructorFilter !== 'All') filters.instructorId = instructorFilter

      const [lessonsData, instructorsData, surfboardsData] = await Promise.all([
        getSurfLessons(filters),
        getInstructors(),
        getSurfboards().catch(() => [])
      ])

      setLessons(lessonsData)
      setInstructors(instructorsData)
      setSurfboards(surfboardsData)
    } catch (err) {
      console.error('Error loading surf lessons data:', err)
      setFetchError(err instanceof Error ? err.message : 'Could not load surf lessons data')
    } finally {
      setIsLoading(false)
    }
  }, [startDate, endDate, statusFilter, paymentFilter, instructorFilter])

  useEffect(() => {
    void loadData()
  }, [loadData])

  // Date preset handler
  const handlePresetChange = (preset: DateFilterPreset) => {
    setDatePreset(preset)
    if (preset === 'today') {
      const today = getTodayStr()
      setStartDate(today)
      setEndDate(today)
    } else if (preset === 'this_month') {
      setStartDate(getMonthStartStr())
      setEndDate(getTodayStr())
    } else if (preset === 'all') {
      setStartDate('')
      setEndDate('')
    }
  }

  // Filtered Lessons
  const filteredLessons = useMemo(() => {
    return lessons.filter((l) => {
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim()
        const matchesName = l.customerName.toLowerCase().includes(query)
        const matchesNumber = l.lessonNumber.toLowerCase().includes(query)
        const matchesInstructor = (l.instructorName || '').toLowerCase().includes(query)
        if (!matchesName && !matchesNumber && !matchesInstructor) return false
      }
      return true
    })
  }, [lessons, searchQuery])

  // KPI Metrics calculation
  const summaryMetrics = useMemo(() => {
    const activeLessons = lessons.filter((l) => l.status === 'In Progress').length
    const completedLessons = lessons.filter((l) => l.status === 'Completed').length
    const unpaidLessons = lessons.filter((l) => l.paymentStatus === 'Unpaid' && l.status !== 'Cancelled').length

    // Calculate boards currently in lessons
    // 1st preference: check surfboards list with status === 'In Lesson'
    // 2nd preference: count unique assigned boards across active lessons
    const boardsInLessonCount =
      surfboards.length > 0
        ? surfboards.filter((b) => b.status === 'In Lesson').length
        : lessons
            .filter((l) => l.status === 'In Progress')
            .reduce((acc, l) => acc + (l.assignedBoards?.length || 0), 0)

    const completedRevenue = lessons
      .filter((l) => l.status === 'Completed' && l.paymentStatus === 'Paid')
      .reduce((acc, l) => acc + (l.total || 0), 0)

    return {
      activeLessons,
      completedLessons,
      unpaidLessons,
      boardsInLessonCount,
      completedRevenue
    }
  }, [lessons, surfboards])

  // ============================================================
  // LESSON ACTIONS
  // ============================================================

  // 1. Complete Lesson
  const handleConfirmComplete = async () => {
    if (!lessonToComplete || isActionProcessing) return
    setIsActionProcessing(true)

    try {
      await updateLessonStatus(lessonToComplete.id, {
        status: 'Completed'
      })
      showToast(`Lesson #${lessonToComplete.lessonNumber} marked as Completed. Boards released safely.`)
      setLessonToComplete(null)
      await loadData()
    } catch (err) {
      console.error('Error completing lesson:', err)
      showToast(err instanceof Error ? err.message : 'Could not complete lesson', 'error')
    } finally {
      setIsActionProcessing(false)
    }
  }

  // 2. Cancel Lesson
  const handleConfirmCancel = async () => {
    if (!lessonToCancel || isActionProcessing) return
    setIsActionProcessing(true)

    try {
      await updateLessonStatus(lessonToCancel.id, {
        status: 'Cancelled',
        cancelReason: cancelReasonInput.trim() || 'Cancelled by staff'
      })
      showToast(`Lesson #${lessonToCancel.lessonNumber} has been cancelled. Boards released.`)
      setLessonToCancel(null)
      setCancelReasonInput('')
      await loadData()
    } catch (err) {
      console.error('Error cancelling lesson:', err)
      showToast(err instanceof Error ? err.message : 'Could not cancel lesson', 'error')
    } finally {
      setIsActionProcessing(false)
    }
  }

  // 3. Record Payment
  const handleConfirmPayment = async () => {
    if (!lessonToPay || isActionProcessing) return
    setIsActionProcessing(true)

    try {
      await recordLessonPayment(lessonToPay.id, {
        paymentStatus: 'Paid',
        paymentMethod: payMethodSelection
      })
      showToast(`Payment of ${formatLKR(lessonToPay.total)} recorded for Lesson #${lessonToPay.lessonNumber} (${payMethodSelection}).`)
      setLessonToPay(null)
      await loadData()
    } catch (err) {
      console.error('Error recording payment:', err)
      showToast(err instanceof Error ? err.message : 'Could not record payment', 'error')
    } finally {
      setIsActionProcessing(false)
    }
  }

  // 4. Issue / Manage Free King Coconut
  const handleOpenCoconutModal = async (lesson: SurfLesson) => {
    setLessonForCoconut(lesson)
    setCoconutQuantity(lesson.studentCount || 1)
    try {
      const invItems = await getInventoryItems({ status: 'active' })
      const kc = invItems.find(
        (i) => i.code === 'D03' || i.code === 'F01' || (i.legacyCodes && i.legacyCodes.includes('F01')) || /King Coconut/i.test(i.productName)
      )
      if (kc) {
        setCoconutStockAvailable(kc.currentQuantity)
      } else {
        setCoconutStockAvailable(null)
      }
    } catch {
      setCoconutStockAvailable(null)
    }
  }

  const handleConfirmIssueCoconut = async () => {
    if (!lessonForCoconut || isActionProcessing) return
    setIsActionProcessing(true)

    try {
      const res = await issueLessonCoconut(lessonForCoconut.id, 'Cashier', coconutQuantity)
      showToast(`${coconutQuantity} King Coconut(s) issued for Lesson #${lessonForCoconut.lessonNumber}. (Remaining Stock: ${res.newCoconutStock}).`)
      setLessonForCoconut(null)
      await loadData()
    } catch (err) {
      console.error('Error issuing King Coconut:', err)
      showToast(err instanceof Error ? err.message : 'Could not issue King Coconut', 'error')
    } finally {
      setIsActionProcessing(false)
    }
  }

  const handleConfirmDeclineCoconut = async () => {
    if (!lessonForCoconut || isActionProcessing) return
    setIsActionProcessing(true)

    try {
      await declineLessonCoconut(lessonForCoconut.id, 'Customer declined complimentary coconut')
      showToast(`Recorded: Customer for Lesson #${lessonForCoconut.lessonNumber} declined complimentary coconut.`)
      setLessonForCoconut(null)
      await loadData()
    } catch (err) {
      console.error('Error recording decline:', err)
      showToast(err instanceof Error ? err.message : 'Could not record decline', 'error')
    } finally {
      setIsActionProcessing(false)
    }
  }

  // View Lesson Detail helper (fetches latest details from server)
  const handleOpenDetailModal = async (lesson: SurfLesson) => {
    setSelectedLessonDetail(lesson)
    try {
      const fresh = await getSurfLessonById(lesson.id)
      setSelectedLessonDetail(fresh)
    } catch (err) {
      console.warn('Could not refresh single lesson details:', err)
    }
  }

  // ============================================================
  // INSTRUCTOR MANAGEMENT ACTIONS
  // ============================================================

  const filteredInstructors = useMemo(() => {
    return instructors.filter((inst) => {
      if (instructorActiveFilter === 'active' && !inst.isActive) return false
      if (instructorActiveFilter === 'inactive' && inst.isActive) return false
      if (instructorSearch.trim()) {
        const q = instructorSearch.toLowerCase().trim()
        const matchName = inst.name.toLowerCase().includes(q)
        const matchSpecialty = inst.specialties.toLowerCase().includes(q)
        const matchPhone = (inst.phone || '').toLowerCase().includes(q)
        if (!matchName && !matchSpecialty && !matchPhone) return false
      }
      return true
    })
  }, [instructors, instructorActiveFilter, instructorSearch])

  const handleOpenAddInstructor = () => {
    setEditingInstructor(null)
    setInstructorForm({
      name: '',
      phone: '',
      email: '',
      specialties: 'All Levels (Beginner to Advanced)',
      notes: '',
      isActive: true
    })
    setIsInstructorModalOpen(true)
  }

  const handleOpenEditInstructor = (inst: Instructor) => {
    setEditingInstructor(inst)
    setInstructorForm({
      name: inst.name,
      phone: inst.phone || '',
      email: inst.email || '',
      specialties: inst.specialties || 'All Levels (Beginner to Advanced)',
      notes: inst.notes || '',
      isActive: inst.isActive
    })
    setIsInstructorModalOpen(true)
  }

  const handleSaveInstructor = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!instructorForm.name.trim()) {
      showToast('Instructor name is required', 'error')
      return
    }

    setIsActionProcessing(true)
    try {
      if (editingInstructor) {
        const payload: UpdateInstructorPayload = {
          name: instructorForm.name.trim(),
          phone: instructorForm.phone.trim(),
          email: instructorForm.email.trim(),
          specialties: instructorForm.specialties.trim(),
          notes: instructorForm.notes.trim(),
          isActive: instructorForm.isActive
        }
        await updateInstructor(editingInstructor.id, payload)
        showToast(`Instructor "${instructorForm.name}" updated successfully.`)
      } else {
        const payload: CreateInstructorPayload = {
          name: instructorForm.name.trim(),
          phone: instructorForm.phone.trim(),
          email: instructorForm.email.trim(),
          specialties: instructorForm.specialties.trim(),
          notes: instructorForm.notes.trim(),
          isActive: instructorForm.isActive
        }
        await createInstructor(payload)
        showToast(`Instructor "${instructorForm.name}" added successfully.`)
      }

      setIsInstructorModalOpen(false)
      await loadData()
    } catch (err) {
      console.error('Error saving instructor:', err)
      showToast(err instanceof Error ? err.message : 'Could not save instructor', 'error')
    } finally {
      setIsActionProcessing(false)
    }
  }

  const handleToggleInstructorStatus = async (inst: Instructor) => {
    if (isActionProcessing) return
    setIsActionProcessing(true)

    const nextStatus = !inst.isActive
    try {
      await setInstructorStatus(inst.id, nextStatus)
      showToast(`Instructor "${inst.name}" is now ${nextStatus ? 'Active' : 'Inactive'}.`)
      await loadData()
    } catch (err) {
      console.error('Error toggling instructor status:', err)
      showToast(err instanceof Error ? err.message : 'Could not update instructor status', 'error')
    } finally {
      setIsActionProcessing(false)
    }
  }

  return (
    <div className="surf-lessons-module">
      {/* Toast Notification */}
      {toast && (
        <div className={`surf-toast surf-toast-${toast.type}`} role="status">
          {toast.type === 'error' ? <IconAlertTriangle size={16} /> : <IconInfo size={16} />}
          <span>{toast.message}</span>
          <button
            type="button"
            className="surf-toast-close"
            onClick={() => setToast(null)}
            aria-label="Dismiss message"
          >
            <IconX size={14} />
          </button>
        </div>
      )}

      {/* Module Header */}
      <header className="surf-header">
        <div className="surf-header-title-block">
          <div className="surf-header-icon-wrap">
            <IconSurfLessons size={22} />
          </div>
          <div>
            <div style={{ marginBottom: '4px' }}>
              <span className="system-location-tag">🌊 Catamaran Surf Academy · Dewata Point</span>
            </div>
            <h1 className="surf-title">Surf Lessons &amp; Coaching</h1>
            <p className="surf-subtitle">
              Walk-in coaching sessions, fleet surfboard allocation & instructor roster
            </p>
          </div>
        </div>

        <div className="surf-header-actions">
          <button
            type="button"
            className="surf-btn surf-btn-secondary"
            onClick={() => void loadData()}
            disabled={isLoading || isActionProcessing}
            title="Refresh active records"
          >
            <IconRotateCcw
              size={14}
              style={isLoading ? { animation: 'spin 1s linear infinite' } : undefined}
            />
            <span>{isLoading ? 'Refreshing...' : 'Refresh'}</span>
          </button>

          <button
            type="button"
            className="surf-btn surf-btn-primary"
            onClick={() => void handleOpenWalkinModal()}
            title="Register a new walk-in lesson"
          >
            <IconPlus size={15} />
            <span>New Walk-in Lesson</span>
          </button>
        </div>
      </header>

      {/* Primary Module Navigation Tabs */}
      <nav className="surf-tabs-bar" aria-label="Surf Lessons Tabs">
        <button
          type="button"
          className={`surf-tab-item ${activeTab === 'lessons' ? 'surf-tab-active' : ''}`}
          onClick={() => setActiveTab('lessons')}
        >
          <IconSurfLessons size={16} />
          <span>Sessions & Schedule</span>
          <span className="surf-tab-counter">{lessons.length}</span>
        </button>

        <button
          type="button"
          className={`surf-tab-item ${activeTab === 'instructors' ? 'surf-tab-active' : ''}`}
          onClick={() => setActiveTab('instructors')}
        >
          <IconUser size={16} />
          <span>Instructor Management</span>
          <span className="surf-tab-counter">{instructors.length}</span>
        </button>
      </nav>

      {/* Error Banner */}
      {fetchError && (
        <div className="surf-alert-banner" role="alert">
          <IconAlertTriangle size={18} />
          <div className="surf-alert-content">
            <strong>Data Fetch Error</strong>
            <p>{fetchError}</p>
          </div>
          <button type="button" className="surf-btn surf-btn-sm" onClick={() => void loadData()}>
            Retry
          </button>
        </div>
      )}

      {/* ============================================================ */}
      {/* TAB 1: SESSIONS & SCHEDULE                                    */}
      {/* ============================================================ */}
      {activeTab === 'lessons' && (
        <section className="surf-tab-content">
          {/* Summary KPI Cards */}
          <div className="surf-kpi-grid">
            <div className="surf-kpi-card">
              <div className="surf-kpi-header">
                <span className="surf-kpi-label">Active Lessons</span>
                <span className="surf-kpi-badge surf-badge-cyan">In Water</span>
              </div>
              <div className="surf-kpi-value">{summaryMetrics.activeLessons}</div>
              <div className="surf-kpi-caption">Currently in progress</div>
            </div>

            <div className="surf-kpi-card">
              <div className="surf-kpi-header">
                <span className="surf-kpi-label">Completed</span>
                <span className="surf-kpi-badge surf-badge-emerald">Finished</span>
              </div>
              <div className="surf-kpi-value">{summaryMetrics.completedLessons}</div>
              <div className="surf-kpi-caption">
                Revenue: {formatLKR(summaryMetrics.completedRevenue)}
              </div>
            </div>

            <div className="surf-kpi-card">
              <div className="surf-kpi-header">
                <span className="surf-kpi-label">Unpaid Lessons</span>
                <span className="surf-kpi-badge surf-badge-amber">Pending</span>
              </div>
              <div className="surf-kpi-value text-amber">{summaryMetrics.unpaidLessons}</div>
              <div className="surf-kpi-caption">Awaiting settlement</div>
            </div>

            <div className="surf-kpi-card">
              <div className="surf-kpi-header">
                <span className="surf-kpi-label">Boards in Lessons</span>
                <span className="surf-kpi-badge surf-badge-teal">Fleet</span>
              </div>
              <div className="surf-kpi-value text-teal">{summaryMetrics.boardsInLessonCount}</div>
              <div className="surf-kpi-caption">Surfboards currently allocated</div>
            </div>
          </div>

          {/* Filtering Toolbar */}
          <div className="surf-toolbar-panel">
            <div className="surf-filter-row">
              <div className="surf-preset-group">
                <span className="surf-filter-title">Date Preset:</span>
                <button
                  type="button"
                  className={`surf-chip ${datePreset === 'today' ? 'surf-chip-active' : ''}`}
                  onClick={() => handlePresetChange('today')}
                >
                  Today
                </button>
                <button
                  type="button"
                  className={`surf-chip ${datePreset === 'this_month' ? 'surf-chip-active' : ''}`}
                  onClick={() => handlePresetChange('this_month')}
                >
                  This Month
                </button>
                <button
                  type="button"
                  className={`surf-chip ${datePreset === 'all' ? 'surf-chip-active' : ''}`}
                  onClick={() => handlePresetChange('all')}
                >
                  All Dates
                </button>
              </div>

              <div className="surf-date-inputs">
                <div className="surf-date-field">
                  <label htmlFor="lesson-start-date">From</label>
                  <input
                    id="lesson-start-date"
                    type="date"
                    value={startDate}
                    onChange={(e) => {
                      setStartDate(e.target.value)
                      setDatePreset('custom')
                    }}
                    max={endDate || undefined}
                  />
                </div>
                <div className="surf-date-field">
                  <label htmlFor="lesson-end-date">To</label>
                  <input
                    id="lesson-end-date"
                    type="date"
                    value={endDate}
                    onChange={(e) => {
                      setEndDate(e.target.value)
                      setDatePreset('custom')
                    }}
                    min={startDate || undefined}
                  />
                </div>
              </div>
            </div>

            <div className="surf-filter-row surf-filter-row-secondary">
              <div className="surf-search-input-wrap">
                <IconSearch size={14} className="surf-search-icon" />
                <input
                  type="text"
                  placeholder="Search customer, lesson #, instructor..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="surf-search-input"
                />
                {searchQuery && (
                  <button
                    type="button"
                    className="surf-search-clear"
                    onClick={() => setSearchQuery('')}
                    aria-label="Clear search"
                  >
                    <IconX size={12} />
                  </button>
                )}
              </div>

              <div className="surf-dropdown-group">
                <div className="surf-select-field">
                  <label htmlFor="status-filter">Status:</label>
                  <select
                    id="status-filter"
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                  >
                    <option value="All">All Statuses</option>
                    <option value="In Progress">In Progress</option>
                    <option value="Completed">Completed</option>
                    <option value="Cancelled">Cancelled</option>
                  </select>
                </div>

                <div className="surf-select-field">
                  <label htmlFor="payment-filter">Payment:</label>
                  <select
                    id="payment-filter"
                    value={paymentFilter}
                    onChange={(e) => setPaymentFilter(e.target.value)}
                  >
                    <option value="All">All Payments</option>
                    <option value="Paid">Paid</option>
                    <option value="Unpaid">Unpaid</option>
                  </select>
                </div>

                <div className="surf-select-field">
                  <label htmlFor="instructor-filter">Instructor:</label>
                  <select
                    id="instructor-filter"
                    value={instructorFilter}
                    onChange={(e) => setInstructorFilter(e.target.value)}
                  >
                    <option value="All">All Instructors</option>
                    {instructors.map((inst) => (
                      <option key={inst.id} value={inst.id}>
                        {inst.name}
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  type="button"
                  className="surf-btn-reset"
                  onClick={() => {
                    handlePresetChange('today')
                    setStatusFilter('All')
                    setPaymentFilter('All')
                    setInstructorFilter('All')
                    setSearchQuery('')
                  }}
                  title="Reset all filters"
                >
                  <IconFilter size={13} />
                  <span>Reset</span>
                </button>
              </div>
            </div>
          </div>

          {/* Lessons Table */}
          <div className="surf-table-container">
            {isLoading ? (
              <div className="surf-state-placeholder">
                <IconRotateCcw size={28} className="surf-spin-icon" />
                <p>Loading surf lessons...</p>
              </div>
            ) : filteredLessons.length === 0 ? (
              <div className="surf-state-placeholder">
                <IconSurfLessons size={36} className="surf-empty-icon" />
                <h3>No surf lessons found</h3>
                <p>
                  {searchQuery || statusFilter !== 'All' || paymentFilter !== 'All'
                    ? 'No records match the current filter criteria.'
                    : 'No lessons registered for the selected date range.'}
                </p>
                <button
                  type="button"
                  className="surf-btn surf-btn-primary"
                  style={{ marginTop: '12px' }}
                  onClick={() => void handleOpenWalkinModal()}
                >
                  <IconPlus size={14} />
                  <span>Register First Walk-in Lesson</span>
                </button>
              </div>
            ) : (
              <table className="surf-table">
                <thead>
                  <tr>
                    <th>Lesson #</th>
                    <th>Customer</th>
                    <th>Type</th>
                    <th>Students</th>
                    <th>Instructor</th>
                    <th>Time / Duration</th>
                    <th>Assigned Fleet</th>
                    <th>Total</th>
                    <th>Payment</th>
                    <th>Coconut</th>
                    <th>Status</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLessons.map((lesson) => {
                    const isCompleted = lesson.status === 'Completed'
                    const isInProgress = lesson.status === 'In Progress'
                    const isCancelled = lesson.status === 'Cancelled'
                    const isPaid = lesson.paymentStatus === 'Paid'

                    return (
                      <tr key={lesson.id} className={isCancelled ? 'surf-row-cancelled' : ''}>
                        {/* Lesson # */}
                        <td>
                          <span className="surf-lesson-num font-mono font-bold">
                            {lesson.lessonNumber}
                          </span>
                        </td>

                        {/* Customer */}
                        <td>
                          <div className="surf-customer-cell">
                            <span className="surf-cust-name font-semibold">{lesson.customerName}</span>
                            {lesson.customerContact && (
                              <span className="surf-cust-sub">{lesson.customerContact}</span>
                            )}
                          </div>
                        </td>

                        {/* Type */}
                        <td>
                          <span
                            className={`surf-type-badge ${
                              lesson.lessonType === 'Private' ? 'surf-badge-purple' : 'surf-badge-teal'
                            }`}
                          >
                            {lesson.lessonType}
                          </span>
                        </td>

                        {/* Students */}
                        <td>
                          <span className="font-semibold">{lesson.studentCount} pax</span>
                        </td>

                        {/* Instructor */}
                        <td>
                          <span className="surf-instructor-name">
                            {lesson.instructorName || 'Unassigned'}
                          </span>
                        </td>

                        {/* Schedule / Time */}
                        <td>
                          <div className="surf-schedule-cell">
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                              <IconClock size={12} style={{ color: 'var(--text-muted)' }} />
                              {lesson.startTime}
                            </span>
                            <span className="surf-duration-sub">{lesson.durationMinutes} mins</span>
                          </div>
                        </td>

                        {/* Assigned Boards */}
                        <td>
                          <div className="surf-boards-cell">
                            {lesson.assignedBoards && lesson.assignedBoards.length > 0 ? (
                              lesson.assignedBoards.map((b, idx) => (
                                <span key={idx} className="surf-board-chip" title={b.boardCategory}>
                                  <IconSurfboard size={11} />
                                  <span>{b.boardName}</span>
                                </span>
                              ))
                            ) : (
                              <span className="text-muted" style={{ fontSize: '11px' }}>
                                None assigned
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Total */}
                        <td>
                          <span className="font-bold">{formatLKR(lesson.total)}</span>
                        </td>

                        {/* Payment */}
                        <td>
                          <div className="surf-payment-cell">
                            <span
                              className={`surf-pill ${
                                isPaid ? 'surf-pill-emerald' : 'surf-pill-amber'
                              }`}
                            >
                              {lesson.paymentStatus}
                            </span>
                            <span className="surf-pay-sub">{lesson.paymentMethod}</span>
                          </div>
                        </td>

                        {/* Free King Coconut Status */}
                        <td>
                          {lesson.coconutIssued ? (
                            <span className="surf-coconut-badge surf-coconut-issued" title={`Issued by ${lesson.coconutIssuedBy || 'Cashier'}`}>
                              <IconCheck size={12} />
                              <span>Issued ({lesson.coconutsIssuedCount || 1}/{lesson.studentCount})</span>
                            </span>
                          ) : lesson.coconutDeclined ? (
                            <span
                              className="surf-coconut-badge"
                              style={{ backgroundColor: '#fef3c7', color: '#92400e', borderColor: '#fde68a' }}
                              title="Customer declined complimentary coconut"
                            >
                              Declined
                            </span>
                          ) : isCancelled ? (
                            <span className="surf-coconut-badge surf-coconut-na" title="Cancelled lesson">
                              N/A
                            </span>
                          ) : (
                            <button
                              type="button"
                              className="surf-btn-coconut"
                              onClick={() => void handleOpenCoconutModal(lesson)}
                              title="Click to hand over & issue complimentary King Coconut"
                            >
                              <span>Issue Free</span>
                            </button>
                          )}
                        </td>

                        {/* Status */}
                        <td>
                          <span
                            className={`surf-pill ${
                              isInProgress
                                ? 'surf-pill-cyan'
                                : isCompleted
                                  ? 'surf-pill-emerald'
                                  : 'surf-pill-rose'
                            }`}
                          >
                            {lesson.status}
                          </span>
                        </td>

                        {/* Actions */}
                        <td className="text-right">
                          <div className="surf-actions-group">
                            {/* View details */}
                            <button
                              type="button"
                              className="surf-icon-btn"
                              onClick={() => void handleOpenDetailModal(lesson)}
                              title="View lesson details & financial snapshot"
                              aria-label="View details"
                            >
                              <IconEye size={15} />
                            </button>

                            {/* Complete lesson */}
                            {isInProgress && (
                              <button
                                type="button"
                                className="surf-icon-btn surf-icon-btn-success"
                                onClick={() => setLessonToComplete(lesson)}
                                title="Complete lesson and release boards"
                                aria-label="Complete lesson"
                              >
                                <IconCheck size={15} />
                              </button>
                            )}

                            {/* Record Payment */}
                            {!isPaid && !isCancelled && (
                              <button
                                type="button"
                                className="surf-action-text-btn surf-btn-pay"
                                onClick={() => {
                                  setLessonToPay(lesson)
                                  setPayMethodSelection(lesson.paymentMethod || 'Cash')
                                }}
                                title="Record payment settlement"
                              >
                                Settle
                              </button>
                            )}

                            {/* Cancel lesson */}
                            {isInProgress && (
                              <button
                                type="button"
                                className="surf-icon-btn surf-icon-btn-danger"
                                onClick={() => {
                                  setLessonToCancel(lesson)
                                  setCancelReasonInput('')
                                }}
                                title="Cancel lesson"
                                aria-label="Cancel lesson"
                              >
                                <IconX size={15} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </section>
      )}

      {/* ============================================================ */}
      {/* TAB 2: INSTRUCTOR MANAGEMENT                                  */}
      {/* ============================================================ */}
      {activeTab === 'instructors' && (
        <section className="surf-tab-content">
          <div className="surf-toolbar-panel">
            <div className="surf-filter-row">
              <div className="surf-search-input-wrap">
                <IconSearch size={14} className="surf-search-icon" />
                <input
                  type="text"
                  placeholder="Search instructor by name, specialty, phone..."
                  value={instructorSearch}
                  onChange={(e) => setInstructorSearch(e.target.value)}
                  className="surf-search-input"
                />
                {instructorSearch && (
                  <button
                    type="button"
                    className="surf-search-clear"
                    onClick={() => setInstructorSearch('')}
                    aria-label="Clear search"
                  >
                    <IconX size={12} />
                  </button>
                )}
              </div>

              <div className="surf-preset-group">
                <span className="surf-filter-title">Filter:</span>
                <button
                  type="button"
                  className={`surf-chip ${instructorActiveFilter === 'all' ? 'surf-chip-active' : ''}`}
                  onClick={() => setInstructorActiveFilter('all')}
                >
                  All ({instructors.length})
                </button>
                <button
                  type="button"
                  className={`surf-chip ${instructorActiveFilter === 'active' ? 'surf-chip-active' : ''}`}
                  onClick={() => setInstructorActiveFilter('active')}
                >
                  Active ({instructors.filter((i) => i.isActive).length})
                </button>
                <button
                  type="button"
                  className={`surf-chip ${instructorActiveFilter === 'inactive' ? 'surf-chip-active' : ''}`}
                  onClick={() => setInstructorActiveFilter('inactive')}
                >
                  Inactive ({instructors.filter((i) => !i.isActive).length})
                </button>
              </div>

              <button
                type="button"
                className="surf-btn surf-btn-primary"
                onClick={handleOpenAddInstructor}
                title="Add new coach to roster"
              >
                <IconPlus size={14} />
                <span>Add Instructor</span>
              </button>
            </div>
          </div>

          {/* Instructors Table */}
          <div className="surf-table-container">
            {isLoading ? (
              <div className="surf-state-placeholder">
                <IconRotateCcw size={28} className="surf-spin-icon" />
                <p>Loading instructors...</p>
              </div>
            ) : filteredInstructors.length === 0 ? (
              <div className="surf-state-placeholder">
                <IconUser size={36} className="surf-empty-icon" />
                <h3>No instructors found</h3>
                <p>
                  {instructorSearch || instructorActiveFilter !== 'all'
                    ? 'No instructors match your current filter.'
                    : 'No coaches registered in the system.'}
                </p>
                <button
                  type="button"
                  className="surf-btn surf-btn-primary"
                  style={{ marginTop: '12px' }}
                  onClick={handleOpenAddInstructor}
                >
                  <IconPlus size={14} />
                  <span>Add First Instructor</span>
                </button>
              </div>
            ) : (
              <table className="surf-table">
                <thead>
                  <tr>
                    <th>Instructor Name</th>
                    <th>Specialties & Expertise</th>
                    <th>Phone</th>
                    <th>Email</th>
                    <th>Notes</th>
                    <th>Status</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredInstructors.map((inst) => (
                    <tr key={inst.id} className={!inst.isActive ? 'surf-row-inactive' : ''}>
                      <td>
                        <div className="surf-instructor-cell">
                          <strong className="surf-inst-name">{inst.name}</strong>
                          <span className="surf-inst-id font-mono">ID: {inst.id.slice(-6)}</span>
                        </div>
                      </td>
                      <td>
                        <span className="surf-inst-spec">{inst.specialties || 'All Levels'}</span>
                      </td>
                      <td>{inst.phone || <span className="text-faint">—</span>}</td>
                      <td>{inst.email || <span className="text-faint">—</span>}</td>
                      <td>
                        <span className="surf-inst-notes" title={inst.notes}>
                          {inst.notes || <span className="text-faint">—</span>}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`surf-pill ${
                            inst.isActive ? 'surf-pill-emerald' : 'surf-pill-slate'
                          }`}
                        >
                          {inst.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="text-right">
                        <div className="surf-actions-group">
                          <button
                            type="button"
                            className="surf-icon-btn"
                            onClick={() => handleOpenEditInstructor(inst)}
                            title="Edit instructor details"
                            aria-label="Edit instructor"
                          >
                            <IconEdit size={14} />
                          </button>

                          <button
                            type="button"
                            className={`surf-action-text-btn ${
                              inst.isActive ? 'surf-btn-deactivate' : 'surf-btn-activate'
                            }`}
                            onClick={() => void handleToggleInstructorStatus(inst)}
                            disabled={isActionProcessing}
                            title={inst.isActive ? 'Deactivate instructor' : 'Activate instructor'}
                          >
                            {inst.isActive ? 'Deactivate' : 'Activate'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      )}

      {/* ============================================================ */}
      {/* MODAL 1: VIEW LESSON DETAIL                                   */}
      {/* ============================================================ */}
      {selectedLessonDetail && (
        <div className="surf-modal-backdrop" onClick={() => setSelectedLessonDetail(null)}>
          <div
            className="surf-modal-dialog surf-detail-dialog"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="surf-modal-header">
              <div>
                <h3 className="surf-modal-title">
                  Lesson Details — #{selectedLessonDetail.lessonNumber}
                </h3>
                <p className="surf-modal-subtitle">
                  Recorded on {selectedLessonDetail.startDate} at {selectedLessonDetail.startTime}
                </p>
              </div>
              <button
                type="button"
                className="surf-modal-close-btn"
                onClick={() => setSelectedLessonDetail(null)}
                aria-label="Close modal"
              >
                <IconX size={16} />
              </button>
            </div>

            <div className="surf-modal-body">
              {/* Top highlights */}
              <div className="surf-detail-meta-grid">
                <div className="surf-meta-item">
                  <span className="surf-meta-label">Customer</span>
                  <strong className="surf-meta-val">{selectedLessonDetail.customerName}</strong>
                  {selectedLessonDetail.customerContact && (
                    <span className="surf-meta-sub">{selectedLessonDetail.customerContact}</span>
                  )}
                </div>

                <div className="surf-meta-item">
                  <span className="surf-meta-label">Lesson Type & Mode</span>
                  <strong className="surf-meta-val">
                    {selectedLessonDetail.lessonType} ({selectedLessonDetail.studentCount} pax)
                  </strong>
                  <span className="surf-meta-sub">{selectedLessonDetail.pricingMode}</span>
                </div>

                <div className="surf-meta-item">
                  <span className="surf-meta-label">Assigned Instructor</span>
                  <strong className="surf-meta-val">
                    {selectedLessonDetail.instructorName || 'Unassigned'}
                  </strong>
                  <span className="surf-meta-sub">
                    {selectedLessonDetail.durationMinutes} mins coaching
                  </span>
                </div>

                <div className="surf-meta-item">
                  <span className="surf-meta-label">Operational Status</span>
                  <strong
                    className={`surf-pill ${
                      selectedLessonDetail.status === 'In Progress'
                        ? 'surf-pill-cyan'
                        : selectedLessonDetail.status === 'Completed'
                          ? 'surf-pill-emerald'
                          : 'surf-pill-rose'
                    }`}
                  >
                    {selectedLessonDetail.status}
                  </strong>
                  {selectedLessonDetail.completedAt && (
                    <span className="surf-meta-sub">
                      Completed: {selectedLessonDetail.completedAt.slice(0, 16).replace('T', ' ')}
                    </span>
                  )}
                  {selectedLessonDetail.cancelledAt && (
                    <span className="surf-meta-sub text-rose">
                      Reason: {selectedLessonDetail.cancelReason || 'Cancelled by staff'}
                    </span>
                  )}
                </div>
              </div>

              {/* Financial Snapshot */}
              <div className="surf-detail-section">
                <h4 className="surf-section-heading">Financial Snapshot</h4>
                <div className="surf-financial-summary">
                  <div className="surf-fin-row">
                    <span>Pricing Base:</span>
                    <span>
                      {selectedLessonDetail.pricingMode === 'Per Person'
                        ? `${formatLKR(selectedLessonDetail.unitPrice)} × ${selectedLessonDetail.studentCount} students`
                        : `Fixed Session (${formatLKR(selectedLessonDetail.sessionPrice)})`}
                    </span>
                  </div>
                  <div className="surf-fin-row">
                    <span>Subtotal:</span>
                    <span>{formatLKR(selectedLessonDetail.subtotal)}</span>
                  </div>
                  {selectedLessonDetail.discount > 0 && (
                    <div className="surf-fin-row text-rose">
                      <span>Discount:</span>
                      <span>-{formatLKR(selectedLessonDetail.discount)}</span>
                    </div>
                  )}
                  <div className="surf-fin-row surf-fin-total font-bold">
                    <span>Total Charged:</span>
                    <span className="text-teal">{formatLKR(selectedLessonDetail.total)}</span>
                  </div>
                  <div className="surf-fin-row" style={{ marginTop: '8px' }}>
                    <span>Payment Status:</span>
                    <span>
                      <strong
                        className={
                          selectedLessonDetail.paymentStatus === 'Paid'
                            ? 'text-teal'
                            : 'text-amber'
                        }
                      >
                        {selectedLessonDetail.paymentStatus}
                      </strong>{' '}
                      via {selectedLessonDetail.paymentMethod}
                    </span>
                  </div>
                </div>
              </div>

              {/* Allocated Surfboards */}
              <div className="surf-detail-section">
                <h4 className="surf-section-heading">Allocated Surfboard Fleet</h4>
                {selectedLessonDetail.assignedBoards && selectedLessonDetail.assignedBoards.length > 0 ? (
                  <div className="surf-detail-boards-list">
                    {selectedLessonDetail.assignedBoards.map((b, idx) => (
                      <div key={idx} className="surf-detail-board-card">
                        <IconSurfboard size={16} />
                        <div>
                          <strong>{b.boardName}</strong>
                          <span className="surf-meta-sub">{b.boardCategory || 'Surfboard'}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted" style={{ fontSize: '12px' }}>
                    No surfboards linked to this lesson.
                  </p>
                )}
              </div>

              {/* Complimentary Coconut Entitlement */}
              <div className="surf-detail-section">
                <h4 className="surf-section-heading">King Coconut Entitlement</h4>
                <div className="surf-detail-coconut-box">
                  {selectedLessonDetail.coconutIssued ? (
                    <div className="surf-coconut-status-msg text-teal">
                      <IconCheck size={16} />
                      <span>
                        Complimentary King Coconut issued ({selectedLessonDetail.coconutsIssuedCount || 1} of {selectedLessonDetail.studentCount} students) on{' '}
                        {selectedLessonDetail.coconutIssuedAt?.slice(0, 16).replace('T', ' ')} by{' '}
                        {selectedLessonDetail.coconutIssuedBy || 'Cashier'}.
                      </span>
                    </div>
                  ) : selectedLessonDetail.coconutDeclined ? (
                    <div className="surf-coconut-status-msg" style={{ color: '#92400e' }}>
                      <IconInfo size={16} />
                      <span>Customer declined complimentary King Coconut (0 stock deducted).</span>
                    </div>
                  ) : selectedLessonDetail.status === 'Cancelled' ? (
                    <span className="text-muted">Not applicable for cancelled lessons.</span>
                  ) : (
                    <div className="surf-coconut-status-msg text-amber">
                      <IconInfo size={16} />
                      <span>
                        Complimentary King Coconut has not yet been issued to customer (eligible students: {selectedLessonDetail.studentCount}).
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="surf-modal-footer">
              <button
                type="button"
                className="surf-btn surf-btn-secondary"
                onClick={() => setSelectedLessonDetail(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL 2: COMPLETE LESSON CONFIRMATION                         */}
      {/* ============================================================ */}
      {lessonToComplete && (
        <div className="surf-modal-backdrop" onClick={() => !isActionProcessing && setLessonToComplete(null)}>
          <div
            className="surf-modal-dialog surf-confirm-dialog"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="surf-modal-header">
              <h3 className="surf-modal-title">Complete Lesson #{lessonToComplete.lessonNumber}?</h3>
              <button
                type="button"
                className="surf-modal-close-btn"
                onClick={() => !isActionProcessing && setLessonToComplete(null)}
                aria-label="Close"
              >
                <IconX size={16} />
              </button>
            </div>

            <div className="surf-modal-body">
              <p>
                You are about to mark the lesson for <strong>{lessonToComplete.customerName}</strong> as <strong>Completed</strong>.
              </p>
              {lessonToComplete.assignedBoards?.length > 0 && (
                <div className="surf-confirm-alert-box">
                  <IconInfo size={16} />
                  <span>
                    <strong>{lessonToComplete.assignedBoards.length} surfboard(s)</strong> (
                    {lessonToComplete.assignedBoards.map((b) => b.boardName).join(', ')}) will be safely released back to <strong>Available</strong> fleet status.
                  </span>
                </div>
              )}
              {lessonToComplete.paymentStatus === 'Unpaid' && (
                <div className="surf-confirm-warn-box">
                  <IconAlertTriangle size={16} />
                  <span>
                    Note: This lesson is currently marked <strong>Unpaid</strong>. You can record payment settlement before or after completion.
                  </span>
                </div>
              )}
            </div>

            <div className="surf-modal-footer">
              <button
                type="button"
                className="surf-btn surf-btn-secondary"
                onClick={() => setLessonToComplete(null)}
                disabled={isActionProcessing}
              >
                Go Back
              </button>
              <button
                type="button"
                className="surf-btn surf-btn-primary"
                onClick={() => void handleConfirmComplete()}
                disabled={isActionProcessing}
              >
                {isActionProcessing ? 'Completing...' : 'Confirm Completion'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL 3: CANCEL LESSON CONFIRMATION                           */}
      {/* ============================================================ */}
      {lessonToCancel && (
        <div className="surf-modal-backdrop" onClick={() => !isActionProcessing && setLessonToCancel(null)}>
          <div
            className="surf-modal-dialog surf-confirm-dialog"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="surf-modal-header">
              <h3 className="surf-modal-title text-rose">
                Cancel Lesson #{lessonToCancel.lessonNumber}?
              </h3>
              <button
                type="button"
                className="surf-modal-close-btn"
                onClick={() => !isActionProcessing && setLessonToCancel(null)}
                aria-label="Close"
              >
                <IconX size={16} />
              </button>
            </div>

            <div className="surf-modal-body">
              <p>
                Cancelling this lesson will immediately release any assigned surfboards back to the fleet and exclude this session from completed lesson revenue.
              </p>

              <div className="surf-form-group" style={{ marginTop: '12px' }}>
                <label htmlFor="cancel-reason-input" className="surf-form-label">
                  Reason for Cancellation:
                </label>
                <input
                  id="cancel-reason-input"
                  type="text"
                  placeholder="e.g. Customer weather request, rough sea conditions..."
                  value={cancelReasonInput}
                  onChange={(e) => setCancelReasonInput(e.target.value)}
                  className="surf-form-input"
                />
              </div>
            </div>

            <div className="surf-modal-footer">
              <button
                type="button"
                className="surf-btn surf-btn-secondary"
                onClick={() => setLessonToCancel(null)}
                disabled={isActionProcessing}
              >
                Keep Lesson
              </button>
              <button
                type="button"
                className="surf-btn surf-btn-danger"
                onClick={() => void handleConfirmCancel()}
                disabled={isActionProcessing}
              >
                {isActionProcessing ? 'Cancelling...' : 'Confirm Cancellation'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL 4: RECORD PAYMENT                                       */}
      {/* ============================================================ */}
      {lessonToPay && (
        <div className="surf-modal-backdrop" onClick={() => !isActionProcessing && setLessonToPay(null)}>
          <div
            className="surf-modal-dialog surf-confirm-dialog"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="surf-modal-header">
              <h3 className="surf-modal-title">Record Payment for Lesson #{lessonToPay.lessonNumber}</h3>
              <button
                type="button"
                className="surf-modal-close-btn"
                onClick={() => !isActionProcessing && setLessonToPay(null)}
                aria-label="Close"
              >
                <IconX size={16} />
              </button>
            </div>

            <div className="surf-modal-body">
              <div className="surf-pay-amount-box">
                <span className="surf-pay-label">Total Outstanding:</span>
                <span className="surf-pay-amount text-teal">{formatLKR(lessonToPay.total)}</span>
              </div>

              <div className="surf-form-group" style={{ marginTop: '16px' }}>
                <label htmlFor="pay-method-select" className="surf-form-label">
                  Payment Method Received:
                </label>
                <select
                  id="pay-method-select"
                  value={payMethodSelection}
                  onChange={(e) => setPayMethodSelection(e.target.value as LessonPaymentMethod)}
                  className="surf-form-input"
                >
                  <option value="Cash">Cash</option>
                  <option value="Card">Card</option>
                  <option value="Online / QR">Online / QR</option>
                  <option value="Room Charge">Room Charge</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </div>

            <div className="surf-modal-footer">
              <button
                type="button"
                className="surf-btn surf-btn-secondary"
                onClick={() => setLessonToPay(null)}
                disabled={isActionProcessing}
              >
                Cancel
              </button>
              <button
                type="button"
                className="surf-btn surf-btn-primary"
                onClick={() => void handleConfirmPayment()}
                disabled={isActionProcessing}
              >
                {isActionProcessing ? 'Saving...' : 'Record Payment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL 5: ISSUE COMPLIMENTARY KING COCONUT                    */}
      {/* ============================================================ */}
      {lessonForCoconut && (
        <div className="surf-modal-backdrop" onClick={() => !isActionProcessing && setLessonForCoconut(null)}>
          <div
            className="surf-modal-dialog surf-confirm-dialog"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="surf-modal-header">
              <h3 className="surf-modal-title">Complimentary King Coconut</h3>
              <button
                type="button"
                className="surf-modal-close-btn"
                onClick={() => !isActionProcessing && setLessonForCoconut(null)}
                aria-label="Close"
              >
                <IconX size={16} />
              </button>
            </div>

            <div className="surf-modal-body">
              <p>
                Customer <strong>{lessonForCoconut.customerName}</strong> (Lesson #{lessonForCoconut.lessonNumber}) has{' '}
                <strong>{lessonForCoconut.studentCount} student(s)</strong>.
              </p>

              <div style={{ margin: '14px 0' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                  Quantity Handed Over (Requested):
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <select
                    value={coconutQuantity}
                    onChange={(e) => setCoconutQuantity(Number(e.target.value))}
                    className="surf-form-input"
                    style={{ maxWidth: '140px' }}
                  >
                    {Array.from({ length: lessonForCoconut.studentCount || 1 }, (_, idx) => idx + 1).map((n) => (
                      <option key={n} value={n}>
                        {n} {n === 1 ? 'Coconut' : 'Coconuts'}
                      </option>
                    ))}
                  </select>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    (up to {lessonForCoconut.studentCount} for this lesson)
                  </span>
                </div>
              </div>

              {coconutStockAvailable !== null && (
                <div
                  className="surf-confirm-alert-box"
                  style={{
                    backgroundColor: coconutStockAvailable < coconutQuantity ? '#fef2f2' : '#f0fdf4',
                    borderColor: coconutStockAvailable < coconutQuantity ? '#fecaca' : '#bbf7d0',
                    color: coconutStockAvailable < coconutQuantity ? '#991b1b' : '#166534',
                    marginBottom: '10px'
                  }}
                >
                  <IconInfo size={16} />
                  <span>
                    Current King Coconut stock in inventory: <strong>{coconutStockAvailable} units</strong>.
                    {coconutStockAvailable < coconutQuantity && ' Insufficient stock to issue this quantity!'}
                  </span>
                </div>
              )}

              <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                If the customer declined or did not request a coconut, click <strong>"Customer Declined"</strong> below to record it without deducting any stock.
              </p>
            </div>

            <div className="surf-modal-footer" style={{ justifyContent: 'space-between' }}>
              <button
                type="button"
                className="surf-btn surf-btn-secondary"
                style={{ color: '#b45309', borderColor: '#fde68a', backgroundColor: '#fef3c7' }}
                onClick={() => void handleConfirmDeclineCoconut()}
                disabled={isActionProcessing}
              >
                Customer Declined
              </button>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  className="surf-btn surf-btn-secondary"
                  onClick={() => setLessonForCoconut(null)}
                  disabled={isActionProcessing}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="surf-btn surf-btn-primary"
                  onClick={() => void handleConfirmIssueCoconut()}
                  disabled={isActionProcessing || (coconutStockAvailable !== null && coconutStockAvailable < coconutQuantity)}
                >
                  {isActionProcessing ? 'Issuing...' : `Hand Over & Deduct (${coconutQuantity})`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL 6: ADD / EDIT INSTRUCTOR                                */}
      {/* ============================================================ */}
      {isInstructorModalOpen && (
        <div className="surf-modal-backdrop" onClick={() => !isActionProcessing && setIsInstructorModalOpen(false)}>
          <div
            className="surf-modal-dialog"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="surf-modal-header">
              <h3 className="surf-modal-title">
                {editingInstructor ? `Edit Instructor: ${editingInstructor.name}` : 'Add New Instructor'}
              </h3>
              <button
                type="button"
                className="surf-modal-close-btn"
                onClick={() => !isActionProcessing && setIsInstructorModalOpen(false)}
                aria-label="Close"
              >
                <IconX size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveInstructor}>
              <div className="surf-modal-body">
                <div className="surf-form-group">
                  <label htmlFor="inst-name" className="surf-form-label">
                    Full Name <span className="text-rose">*</span>
                  </label>
                  <input
                    id="inst-name"
                    type="text"
                    required
                    placeholder="e.g. Sanjeewa Silva"
                    value={instructorForm.name}
                    onChange={(e) => setInstructorForm({ ...instructorForm, name: e.target.value })}
                    className="surf-form-input"
                  />
                </div>

                <div className="surf-form-grid-2">
                  <div className="surf-form-group">
                    <label htmlFor="inst-phone" className="surf-form-label">
                      Phone Number
                    </label>
                    <input
                      id="inst-phone"
                      type="text"
                      placeholder="+94 77 123 4567"
                      value={instructorForm.phone}
                      onChange={(e) => setInstructorForm({ ...instructorForm, phone: e.target.value })}
                      className="surf-form-input"
                    />
                  </div>

                  <div className="surf-form-group">
                    <label htmlFor="inst-email" className="surf-form-label">
                      Email Address
                    </label>
                    <input
                      id="inst-email"
                      type="email"
                      placeholder="coach@catamaran.lk"
                      value={instructorForm.email}
                      onChange={(e) => setInstructorForm({ ...instructorForm, email: e.target.value })}
                      className="surf-form-input"
                    />
                  </div>
                </div>

                <div className="surf-form-group">
                  <label htmlFor="inst-specialties" className="surf-form-label">
                    Specialties & Levels
                  </label>
                  <input
                    id="inst-specialties"
                    type="text"
                    placeholder="e.g. Beginners, Kids Foamies, Ocean Safety & Wave Reading"
                    value={instructorForm.specialties}
                    onChange={(e) =>
                      setInstructorForm({ ...instructorForm, specialties: e.target.value })
                    }
                    className="surf-form-input"
                  />
                </div>

                <div className="surf-form-group">
                  <label htmlFor="inst-notes" className="surf-form-label">
                    Notes & Qualifications
                  </label>
                  <textarea
                    id="inst-notes"
                    rows={2}
                    placeholder="Certifications, availability or internal notes..."
                    value={instructorForm.notes}
                    onChange={(e) => setInstructorForm({ ...instructorForm, notes: e.target.value })}
                    className="surf-form-input"
                  />
                </div>

                <div className="surf-form-checkbox-row">
                  <label className="surf-checkbox-label">
                    <input
                      type="checkbox"
                      checked={instructorForm.isActive}
                      onChange={(e) =>
                        setInstructorForm({ ...instructorForm, isActive: e.target.checked })
                      }
                    />
                    <span>Active Instructor (Available for active lesson assignments)</span>
                  </label>
                </div>
              </div>

              <div className="surf-modal-footer">
                <button
                  type="button"
                  className="surf-btn surf-btn-secondary"
                  onClick={() => setIsInstructorModalOpen(false)}
                  disabled={isActionProcessing}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="surf-btn surf-btn-primary"
                  disabled={isActionProcessing}
                >
                  {isActionProcessing ? 'Saving...' : editingInstructor ? 'Save Changes' : 'Create Instructor'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL 7: NEW WALKIN LESSON (PHASE 4B IMPLEMENTATION)         */}
      {/* ============================================================ */}
      {isWalkinModalOpen && (
        <div className="surf-modal-backdrop" onClick={handleCloseWalkinModal}>
          <div
            className="surf-modal-dialog surf-walkin-dialog"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="surf-modal-header">
              <div className="surf-title-with-icon">
                <IconSurfLessons size={20} />
                <div>
                  <h3 className="surf-modal-title">New Walk-in Lesson Registration</h3>
                  <div className="surf-modal-subtitle">
                    Instant walk-in registration, instructor assignment & board checkout
                  </div>
                </div>
              </div>
              <button
                type="button"
                className="surf-modal-close-btn"
                onClick={handleCloseWalkinModal}
                disabled={isSubmittingWalkin}
                aria-label="Close"
              >
                <IconX size={16} />
              </button>
            </div>

            <form
              onSubmit={handleSubmitWalkinLesson}
              style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}
            >
              <div className="surf-modal-body" style={{ flex: 1, overflowY: 'auto' }}>
                {/* Form Error Banner */}
                {walkinError && (
                  <div className="surf-form-error-banner" role="alert">
                    <div className="surf-form-error-banner-left">
                      <IconAlertTriangle size={18} />
                      <span>{walkinError}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setWalkinError(null)}
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: 'inherit',
                        padding: 0
                      }}
                      aria-label="Dismiss error"
                    >
                      <IconX size={15} />
                    </button>
                  </div>
                )}

                {/* Section 1: Customer & Lesson Details */}
                <div className="surf-form-section">
                  <div className="surf-section-header">
                    <span className="surf-section-title">
                      <IconUser size={14} />
                      <span>1. Customer & Session Details</span>
                    </span>
                    <span className="surf-section-badge">Walk-in</span>
                  </div>

                  <div className="surf-form-grid-2">
                    <div className="surf-form-group">
                      <label htmlFor="walkin-customer-name" className="surf-form-label">
                        Customer Full Name <span style={{ color: '#ef4444' }}>*</span>
                      </label>
                      <input
                        id="walkin-customer-name"
                        type="text"
                        required
                        placeholder="e.g. Liam Smith / Ananya Patel"
                        value={walkinForm.customerName}
                        onChange={(e) =>
                          setWalkinForm({ ...walkinForm, customerName: e.target.value })
                        }
                        className="surf-form-input"
                        autoFocus
                      />
                    </div>

                    <div className="surf-form-group">
                      <label htmlFor="walkin-customer-contact" className="surf-form-label">
                        Contact Phone / WhatsApp
                      </label>
                      <input
                        id="walkin-customer-contact"
                        type="tel"
                        placeholder="e.g. +94 77 123 4567"
                        value={walkinForm.customerContact}
                        onChange={(e) =>
                          setWalkinForm({ ...walkinForm, customerContact: e.target.value })
                        }
                        className="surf-form-input"
                      />
                    </div>
                  </div>

                  <div className="surf-form-grid-3">
                    <div className="surf-form-group">
                      <label htmlFor="walkin-customer-id" className="surf-form-label">
                        Passport / National ID
                      </label>
                      <input
                        id="walkin-customer-id"
                        type="text"
                        placeholder="e.g. N1234567"
                        value={walkinForm.customerPassportOrId}
                        onChange={(e) =>
                          setWalkinForm({
                            ...walkinForm,
                            customerPassportOrId: e.target.value
                          })
                        }
                        className="surf-form-input"
                      />
                    </div>

                    <div className="surf-form-group">
                      <label htmlFor="walkin-student-count" className="surf-form-label">
                        Student Count <span style={{ color: '#ef4444' }}>*</span>
                      </label>
                      <input
                        id="walkin-student-count"
                        type="number"
                        min="1"
                        max="50"
                        required
                        value={walkinForm.studentCount}
                        onChange={(e) => {
                          const val = Math.max(1, parseInt(e.target.value, 10) || 1)
                          setWalkinForm({ ...walkinForm, studentCount: val })
                        }}
                        className="surf-form-input"
                      />
                    </div>

                    <div className="surf-form-group">
                      <label htmlFor="walkin-lesson-type" className="surf-form-label">
                        Lesson Type
                      </label>
                      <select
                        id="walkin-lesson-type"
                        value={walkinForm.lessonType}
                        onChange={(e) =>
                          setWalkinForm({
                            ...walkinForm,
                            lessonType: e.target.value as LessonType
                          })
                        }
                        className="surf-form-input"
                      >
                        <option value="Private">Private (1-on-1 Coaching)</option>
                        <option value="Group">Group (Multi-Student)</option>
                      </select>
                    </div>
                  </div>

                  <div className="surf-form-grid-2">
                    <div className="surf-form-group">
                      <label htmlFor="walkin-duration" className="surf-form-label">
                        Lesson Duration
                      </label>
                      <select
                        id="walkin-duration"
                        value={walkinForm.durationMinutes}
                        onChange={(e) =>
                          setWalkinForm({
                            ...walkinForm,
                            durationMinutes: Number(e.target.value)
                          })
                        }
                        className="surf-form-input"
                      >
                        <option value={30}>30 Minutes (Quick Intro / Refresher)</option>
                        <option value={60}>60 Minutes (Standard 1 Hour)</option>
                        <option value={90}>90 Minutes (1.5 Hours Intensive)</option>
                        <option value={120}>120 Minutes (2 Hours Extended)</option>
                        <option value={180}>180 Minutes (3 Hours Half-Day Workshop)</option>
                      </select>
                    </div>

                    <div className="surf-form-group">
                      <label className="surf-form-label">Session Schedule</label>
                      <div
                        className="surf-form-input"
                        style={{
                          background: '#f1f5f9',
                          color: '#475569',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px'
                        }}
                      >
                        <IconClock size={14} />
                        <span>Immediate Walk-in (Current Time: {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Section 2: Pricing & Live Financial Calculator */}
                <div className="surf-form-section">
                  <div className="surf-section-header">
                    <span className="surf-section-title">
                      <span>2. Pricing Mode & Live Calculator</span>
                    </span>
                    <div className="surf-pricing-mode-toggle">
                      <button
                        type="button"
                        className={`surf-mode-btn ${walkinForm.pricingMode === 'Per Person' ? 'surf-mode-btn-active' : ''}`}
                        onClick={() => setWalkinForm({ ...walkinForm, pricingMode: 'Per Person' })}
                      >
                        Per Person Mode
                      </button>
                      <button
                        type="button"
                        className={`surf-mode-btn ${walkinForm.pricingMode === 'Fixed Session' ? 'surf-mode-btn-active' : ''}`}
                        onClick={() => setWalkinForm({ ...walkinForm, pricingMode: 'Fixed Session' })}
                      >
                        Fixed Session Mode
                      </button>
                    </div>
                  </div>

                  <div className="surf-form-grid-2">
                    {walkinForm.pricingMode === 'Per Person' ? (
                      <div className="surf-form-group">
                        <label htmlFor="walkin-unit-price" className="surf-form-label">
                          Unit Price per Student (LKR) <span style={{ color: '#ef4444' }}>*</span>
                        </label>
                        <input
                          id="walkin-unit-price"
                          type="number"
                          min="0"
                          step="100"
                          placeholder="e.g. 6000"
                          value={walkinForm.unitPrice}
                          onChange={(e) =>
                            setWalkinForm({ ...walkinForm, unitPrice: e.target.value })
                          }
                          className="surf-form-input"
                          required
                        />
                      </div>
                    ) : (
                      <div className="surf-form-group">
                        <label htmlFor="walkin-session-price" className="surf-form-label">
                          Fixed Session Total Price (LKR) <span style={{ color: '#ef4444' }}>*</span>
                        </label>
                        <input
                          id="walkin-session-price"
                          type="number"
                          min="0"
                          step="100"
                          placeholder="e.g. 15000"
                          value={walkinForm.sessionPrice}
                          onChange={(e) =>
                            setWalkinForm({ ...walkinForm, sessionPrice: e.target.value })
                          }
                          className="surf-form-input"
                          required
                        />
                      </div>
                    )}

                    <div className="surf-form-group">
                      <label htmlFor="walkin-discount" className="surf-form-label">
                        Discount Allowed (LKR)
                      </label>
                      <input
                        id="walkin-discount"
                        type="number"
                        min="0"
                        step="100"
                        placeholder="0"
                        value={walkinForm.discount}
                        onChange={(e) =>
                          setWalkinForm({ ...walkinForm, discount: e.target.value })
                        }
                        className="surf-form-input"
                      />
                    </div>
                  </div>

                  {/* Live Financial Calculation Card */}
                  <div className="surf-calc-card">
                    <div className="surf-calc-breakdown">
                      {walkinForm.pricingMode === 'Per Person'
                        ? `Breakdown: ${formatLKR(liveCalculation.unitPrice)} × ${liveCalculation.students} student${liveCalculation.students > 1 ? 's' : ''}`
                        : `Breakdown: Fixed Flat Session Charge`}
                    </div>
                    <div className="surf-calc-row">
                      <span>Subtotal:</span>
                      <strong>{formatLKR(liveCalculation.subtotal)}</strong>
                    </div>
                    {liveCalculation.discount > 0 && (
                      <div className="surf-calc-row" style={{ color: '#dc2626' }}>
                        <span>Discount Applied:</span>
                        <span>- {formatLKR(liveCalculation.discount)}</span>
                      </div>
                    )}
                    <div className="surf-calc-row surf-calc-row-total">
                      <span>Payable Net Total:</span>
                      <span>{formatLKR(liveCalculation.total)}</span>
                    </div>
                  </div>

                  {/* Payment Details */}
                  <div className="surf-form-grid-2">
                    <div className="surf-form-group">
                      <label htmlFor="walkin-pay-status" className="surf-form-label">
                        Payment Status
                      </label>
                      <select
                        id="walkin-pay-status"
                        value={walkinForm.paymentStatus}
                        onChange={(e) =>
                          setWalkinForm({
                            ...walkinForm,
                            paymentStatus: e.target.value as LessonPaymentStatus
                          })
                        }
                        className="surf-form-input"
                      >
                        <option value="Paid">Paid Now (Instant Payment)</option>
                        <option value="Unpaid">Unpaid (Pay Later / Post-Session)</option>
                      </select>
                    </div>

                    <div className="surf-form-group">
                      <label htmlFor="walkin-pay-method" className="surf-form-label">
                        Payment Method
                      </label>
                      <select
                        id="walkin-pay-method"
                        value={walkinForm.paymentMethod}
                        onChange={(e) =>
                          setWalkinForm({
                            ...walkinForm,
                            paymentMethod: e.target.value as LessonPaymentMethod
                          })
                        }
                        className="surf-form-input"
                        disabled={walkinForm.paymentStatus === 'Unpaid'}
                      >
                        <option value="Cash">Cash</option>
                        <option value="Card">Card</option>
                        <option value="Online / QR">Online / QR</option>
                        <option value="Room Charge">Room Charge</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Section 3: Instructor Assignment */}
                <div className="surf-form-section">
                  <div className="surf-section-header">
                    <span className="surf-section-title">
                      <IconUser size={14} />
                      <span>3. Instructor Assignment</span>
                    </span>
                    <span className="surf-section-badge surf-section-badge-teal">
                      {activeInstructors.length} Active Coaches
                    </span>
                  </div>

                  <div className="surf-form-group">
                    <label htmlFor="walkin-instructor" className="surf-form-label">
                      Assigned Instructor (Active Only)
                    </label>
                    <select
                      id="walkin-instructor"
                      value={walkinForm.instructorId}
                      onChange={(e) =>
                        setWalkinForm({ ...walkinForm, instructorId: e.target.value })
                      }
                      className="surf-form-input"
                    >
                      <option value="">-- No Coach Assigned (Self-guided / Unassigned) --</option>
                      {activeInstructors.map((inst) => (
                        <option key={inst.id} value={inst.id}>
                          {inst.name} {inst.specialties ? `• ${inst.specialties}` : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Selected Instructor Helper Preview */}
                  {walkinForm.instructorId && (
                    (() => {
                      const selectedInst = activeInstructors.find(
                        (i) => i.id === walkinForm.instructorId
                      )
                      if (!selectedInst) return null
                      return (
                        <div className="surf-instructor-helper-card">
                          <div>
                            <span className="surf-instructor-helper-title">{selectedInst.name}</span>
                            <span className="surf-instructor-helper-spec">
                              {selectedInst.specialties || 'All skill levels'}
                            </span>
                          </div>
                          <span className="surf-badge surf-badge-available">Active Coach</span>
                        </div>
                      )
                    })()
                  )}
                </div>

                {/* Section 4: Available Surfboard Allocation */}
                <div className="surf-form-section">
                  <div className="surf-section-header">
                    <span className="surf-section-title">
                      <IconSurfboard size={14} />
                      <span>4. Surfboard Allocation</span>
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span className="surf-section-badge surf-section-badge-teal">
                        {walkinForm.selectedBoardIds.length} / {walkinForm.studentCount} Assigned
                      </span>
                      {walkinForm.selectedBoardIds.length > 0 && (
                        <button
                          type="button"
                          className="surf-btn-link text-danger"
                          onClick={handleClearSelectedBoards}
                          style={{
                            fontSize: '11px',
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer'
                          }}
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Filter and Search for Fleet */}
                  <div className="surf-board-filter-bar">
                    <input
                      type="text"
                      placeholder="Search available boards by name/size..."
                      value={boardSearchQuery}
                      onChange={(e) => setBoardSearchQuery(e.target.value)}
                      className="surf-form-input"
                      style={{ flex: 2, padding: '6px 10px', fontSize: '12px' }}
                    />
                    <select
                      value={boardCategoryFilter}
                      onChange={(e) => setBoardCategoryFilter(e.target.value)}
                      className="surf-form-input"
                      style={{ flex: 1, padding: '6px 10px', fontSize: '12px' }}
                    >
                      {availableBoardCategories.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Boards Grid */}
                  {filteredAvailableBoards.length === 0 ? (
                    <div className="surf-board-empty-alert">
                      {availableBoards.length === 0
                        ? 'No surfboards are currently marked "Available". (Boards may be rented or in lessons).'
                        : 'No available boards match your search filter.'}
                    </div>
                  ) : (
                    <div className="surf-board-picker-grid">
                      {filteredAvailableBoards.map((b) => {
                        const isSelected = walkinForm.selectedBoardIds.includes(b.id)
                        return (
                          <div
                            key={b.id}
                            className={`surf-board-pick-card ${isSelected ? 'surf-board-pick-card-selected' : ''}`}
                            onClick={() => handleToggleBoardSelection(b.id)}
                            role="checkbox"
                            aria-checked={isSelected}
                            tabIndex={0}
                            onKeyDown={(e) => {
                              if (e.key === ' ' || e.key === 'Enter') {
                                e.preventDefault()
                                handleToggleBoardSelection(b.id)
                              }
                            }}
                          >
                            <div className="surf-board-pick-name">
                              <span>{b.name}</span>
                              {isSelected ? (
                                <IconCheck size={14} style={{ color: 'var(--teal-primary)' }} />
                              ) : null}
                            </div>
                            <div className="surf-board-pick-meta">
                              {b.category} {b.length ? `• ${b.length}` : ''}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>

                {/* Section 5: Complimentary King Coconut & Notes */}
                <div className="surf-coconut-banner">
                  <IconInfo size={16} style={{ flexShrink: 0 }} />
                  <div>
                    <strong>Complimentary King Coconut Included</strong>
                    <div style={{ fontSize: '11px', marginTop: '2px', opacity: 0.9 }}>
                      One fresh King Coconut is included with each lesson. Stock is deducted only upon physical handover via the active lesson card.
                    </div>
                  </div>
                </div>

                <div className="surf-form-group">
                  <label htmlFor="walkin-notes" className="surf-form-label">
                    Session Notes / Student Skill Level / Medical Requirements
                  </label>
                  <textarea
                    id="walkin-notes"
                    rows={2}
                    placeholder="e.g. First time surfing, confident swimmer, requires rash guard..."
                    value={walkinForm.notes}
                    onChange={(e) => setWalkinForm({ ...walkinForm, notes: e.target.value })}
                    className="surf-form-input"
                  />
                </div>
              </div>

              <div className="surf-modal-footer" style={{ justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    {walkinForm.paymentStatus === 'Paid'
                      ? 'Total Payable (Paid Now):'
                      : 'Total Payable (Pay Later):'}
                  </span>
                  <span
                    style={{
                      fontSize: '16px',
                      fontWeight: 800,
                      color: 'var(--teal-primary)'
                    }}
                  >
                    {formatLKR(liveCalculation.total)}
                  </span>
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    className="surf-btn surf-btn-secondary"
                    onClick={handleCloseWalkinModal}
                    disabled={isSubmittingWalkin}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="surf-btn surf-btn-primary"
                    disabled={isSubmittingWalkin}
                  >
                    <IconPlus size={15} />
                    <span>{isSubmittingWalkin ? 'Registering...' : 'Register Lesson'}</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
