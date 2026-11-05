
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  cancelExpense,
  createExpense,
  EXPENSE_CATEGORIES,
  EXPENSE_PAYMENT_METHODS,
  getExpenses,
  type ExpenseCategory,
  type ExpensePaymentMethod,
  type ExpenseRecord
} from '../services/api'

const today = (): string => {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const money = (amount: number): string =>
  `Rs. ${amount.toLocaleString('en-LK', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`

const initialForm = () => ({
  description: '',
  category: 'Other' as ExpenseCategory,
  amount: '',
  date: today(),
  paymentMethod: 'Cash' as ExpensePaymentMethod,
  notes: ''
})

export function Expenses(): React.JSX.Element {
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([])
  const [form, setForm] = useState(initialForm)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<'Recorded' | 'Cancelled'>('Recorded')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [cancellingId, setCancellingId] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const loadExpenses = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const result = await getExpenses({
        status: statusFilter
      })
      setExpenses(result)
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to load expenses.'
      )
    } finally {
      setLoading(false)
    }
  }, [statusFilter])

  useEffect(() => {
    void loadExpenses()
  }, [loadExpenses])

  const filteredExpenses = useMemo(() => {
    return expenses.filter((expense) => {
      if (startDate && expense.date < startDate) return false
      if (endDate && expense.date > endDate) return false
      if (categoryFilter && expense.category !== categoryFilter) return false
      return true
    })
  }, [expenses, startDate, endDate, categoryFilter])

  const totalFiltered = filteredExpenses.reduce(
    (sum, expense) => sum + expense.amount,
    0
  )

  const totalToday = expenses
    .filter((expense) => expense.date === today() && expense.status === 'Recorded')
    .reduce((sum, expense) => sum + expense.amount, 0)

  const currentMonth = today().slice(0, 7)

  const totalMonth = expenses
    .filter(
      (expense) =>
        expense.date.startsWith(currentMonth) &&
        expense.status === 'Recorded'
    )
    .reduce((sum, expense) => sum + expense.amount, 0)

  const updateForm = <K extends keyof ReturnType<typeof initialForm>>(
    key: K,
    value: ReturnType<typeof initialForm>[K]
  ) => {
    setForm((previous) => ({ ...previous, [key]: value }))
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setSuccess('')

    const amount = Number(form.amount)

    if (!form.description.trim()) {
      setError('Please enter an expense description.')
      return
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Amount must be greater than zero.')
      return
    }

    if (!form.date || form.date.length !== 10) {
      setError('Please select a valid expense date.')
      return
    }

    setSaving(true)

    try {
      const saved = await createExpense({
        description: form.description.trim(),
        category: form.category,
        amount,
        date: form.date,
        paymentMethod: form.paymentMethod,
        notes: form.notes.trim(),
        recordedBy: 'Store Manager'
      })

      setForm(initialForm())
      setStatusFilter('Recorded')
      setStartDate('')
      setEndDate('')
      setCategoryFilter('')
      setSuccess(`Expense saved successfully: ${saved.description}`)
      await loadExpenses()
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not save the expense.'
      )
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = async (expense: ExpenseRecord) => {
    const confirmed = window.confirm(
      `Cancel this expense?\n\n${expense.description}\n${money(expense.amount)}\n\nThe record will be retained in the database.`
    )

    if (!confirmed) return

    setError('')
    setSuccess('')
    setCancellingId(expense.id)

    try {
      await cancelExpense(expense.id)
      setSuccess('Expense cancelled. The original record has been retained.')
      await loadExpenses()
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not cancel the expense.'
      )
    } finally {
      setCancellingId('')
    }
  }

  return (
    <section className="expenses-page">
      <header className="expenses-header">
        <div>
          <p className="expenses-eyebrow">💰 FINANCIAL OPERATIONS &amp; EXPENSE AUDITING</p>
          <h1>Expenses</h1>
          <p className="expenses-subtitle">
            Track operating costs and monitor restaurant spending.
          </p>
        </div>

        <button
          type="button"
          className="expenses-refresh"
          onClick={() => void loadExpenses()}
          disabled={loading}
        >
          {loading ? 'Loading...' : '↻ Refresh'}
        </button>
      </header>

      {error && (
        <div className="expenses-alert expenses-alert-error" role="alert">
          {error}
        </div>
      )}

      {success && (
        <div className="expenses-alert expenses-alert-success" role="status">
          {success}
        </div>
      )}

      <div className="expenses-summary">
        <article className="expenses-summary-card">
          <span>Today's Expenses</span>
          <strong>{money(totalToday)}</strong>
          <small>Recorded expenses for today</small>
        </article>

        <article className="expenses-summary-card">
          <span>This Month</span>
          <strong>{money(totalMonth)}</strong>
          <small>Recorded expenses this month</small>
        </article>

        <article className="expenses-summary-card">
          <span>Filtered Total</span>
          <strong>{money(totalFiltered)}</strong>
          <small>{filteredExpenses.length} matching records</small>
        </article>
      </div>

      <div className="expenses-layout">
        <section className="expenses-panel">
          <div className="expenses-panel-heading">
            <div>
              <h2>Record an Expense</h2>
              <p>Add a business operating expense.</p>
            </div>
          </div>

          <form className="expenses-form" onSubmit={handleSubmit}>
            <label className="expenses-field expenses-field-full">
              Description *
              <input
                type="text"
                maxLength={200}
                value={form.description}
                onChange={(event) =>
                  updateForm('description', event.target.value)
                }
                placeholder="e.g. Electricity bill"
                required
              />
            </label>

            <label className="expenses-field">
              Category *
              <select
                value={form.category}
                onChange={(event) =>
                  updateForm('category', event.target.value as ExpenseCategory)
                }
                required
              >
                {EXPENSE_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </label>

            <label className="expenses-field">
              Amount (LKR) *
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={form.amount}
                onChange={(event) => updateForm('amount', event.target.value)}
                placeholder="0.00"
                required
              />
            </label>

            <label className="expenses-field">
              Expense Date *
              <input
                type="date"
                value={form.date}
                onChange={(event) => updateForm('date', event.target.value)}
                required
              />
            </label>

            <label className="expenses-field">
              Payment Method *
              <select
                value={form.paymentMethod}
                onChange={(event) =>
                  updateForm(
                    'paymentMethod',
                    event.target.value as ExpensePaymentMethod
                  )
                }
                required
              >
                {EXPENSE_PAYMENT_METHODS.map((method) => (
                  <option key={method} value={method}>
                    {method}
                  </option>
                ))}
              </select>
            </label>

            <label className="expenses-field expenses-field-full">
              Notes
              <textarea
                maxLength={500}
                rows={3}
                value={form.notes}
                onChange={(event) => updateForm('notes', event.target.value)}
                placeholder="Optional details or reference..."
              />
            </label>

            <button
              type="submit"
              className="expenses-submit"
              disabled={saving}
            >
              {saving ? 'Saving Expense...' : '+ Save Expense'}
            </button>
          </form>
        </section>

        <section className="expenses-panel expenses-history-panel">
          <div className="expenses-panel-heading">
            <div>
              <h2>Expense History</h2>
              <p>Review records and filter by date or category.</p>
            </div>
          </div>

          <div className="expenses-filters">
            <label className="expenses-field">
              From
              <input
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
              />
            </label>

            <label className="expenses-field">
              To
              <input
                type="date"
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
              />
            </label>

            <label className="expenses-field">
              Category
              <select
                value={categoryFilter}
                onChange={(event) => setCategoryFilter(event.target.value)}
              >
                <option value="">All categories</option>
                {EXPENSE_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </label>

            <label className="expenses-field">
              Status
              <select
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(event.target.value as 'Recorded' | 'Cancelled')
                }
              >
                <option value="Recorded">Recorded</option>
                <option value="Cancelled">Cancelled</option>
              </select>
            </label>
          </div>

          <div className="expenses-table-wrap">
            <table className="expenses-table">
              <thead>
                <tr>
                  <th>Date / Description</th>
                  <th>Category</th>
                  <th>Payment</th>
                  <th>Amount</th>
                  <th>Status / Action</th>
                </tr>
              </thead>

              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={5} className="expenses-empty">
                      Loading expenses...
                    </td>
                  </tr>
                ) : filteredExpenses.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="expenses-empty">
                      <strong>No expenses found</strong>
                      <span>Try changing the filters or add a new expense.</span>
                    </td>
                  </tr>
                ) : (
                  filteredExpenses.map((expense) => (
                    <tr key={expense.id}>
                      <td>
                        <strong>{expense.description}</strong>
                        <span className="expenses-cell-secondary">
                          {expense.date}
                          {expense.notes ? ` · ${expense.notes}` : ''}
                        </span>
                      </td>
                      <td>{expense.category}</td>
                      <td>{expense.paymentMethod}</td>
                      <td className="expenses-amount">
                        {money(expense.amount)}
                      </td>
                      <td>
                        <div className="expenses-row-actions">
                          <span
                            className={`expenses-status ${
                              expense.status === 'Cancelled'
                                ? 'expenses-status-cancelled'
                                : 'expenses-status-recorded'
                            }`}
                          >
                            {expense.status}
                          </span>

                          {expense.status === 'Recorded' && (
                            <button
                              type="button"
                              className="expenses-cancel"
                              onClick={() => void handleCancel(expense)}
                              disabled={cancellingId === expense.id}
                            >
                              {cancellingId === expense.id
                                ? 'Cancelling...'
                                : 'Cancel'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <footer className="expenses-table-footer">
            <span>{filteredExpenses.length} records</span>
            <strong>Total: {money(totalFiltered)}</strong>
          </footer>
        </section>
      </div>
    </section>
  )
}
