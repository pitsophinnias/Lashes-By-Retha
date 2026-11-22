import { useId, useState } from 'react'

const addDays = (dateStr, days) => {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

const toInputDate = (value) => (value ? String(value).slice(0, 10) : '')

// Same visual shell as ConfirmDialog/MessageCustomerPanel. Confirms the
// real start/end dates Retha agreed with a student - start defaults to
// whatever they originally typed in (preferredStartDate), end is
// auto-calculated from the course's duration but freely editable (holidays,
// changes). Reminders and message templates use end_date only, never
// preferredStartDate, from the moment this is first saved.
// onSave(startDate, endDate) performs the actual PATCH (via the parent's
// own apiFetch, which already handles auth headers and session expiry) and
// either throws with a message or returns the saved student.
export default function StudentDatesDialog({ student, durationDays, onClose, onSave }) {
  const titleId = useId()
  const [startDate, setStartDate] = useState(
    toInputDate(student.startDate) || toInputDate(student.preferredStartDate) || new Date().toISOString().slice(0, 10)
  )
  const [endDate, setEndDate] = useState(
    toInputDate(student.endDate) ||
    (durationDays ? addDays(toInputDate(student.startDate) || toInputDate(student.preferredStartDate) || new Date().toISOString().slice(0, 10), durationDays) : '')
  )
  const [endDateTouched, setEndDateTouched] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const handleStartChange = (value) => {
    setStartDate(value)
    if (!endDateTouched && durationDays) setEndDate(addDays(value, durationDays))
  }

  const handleSave = async () => {
    if (!startDate || !endDate) {
      setError('Both a start date and an end date are required.')
      return
    }
    if (endDate < startDate) {
      setError('End date must be on or after the start date.')
      return
    }
    setSaving(true)
    setError('')
    try {
      await onSave(startDate, endDate)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="confirm-overlay" onClick={onClose}>
      <div
        className="confirm-card message-panel-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="confirm-header">
          <h2 id={titleId} className="confirm-title">Course dates for {student.name}</h2>
          <button type="button" className="confirm-close-btn" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="message-panel-field">
          <label className="message-panel-label" htmlFor={`${titleId}-start`}>Start date</label>
          <input
            id={`${titleId}-start`}
            type="date"
            className="message-panel-input"
            value={startDate}
            onChange={(e) => handleStartChange(e.target.value)}
          />
        </div>

        <div className="message-panel-field">
          <label className="message-panel-label" htmlFor={`${titleId}-end`}>End date</label>
          <input
            id={`${titleId}-end`}
            type="date"
            className="message-panel-input"
            value={endDate}
            onChange={(e) => { setEndDateTouched(true); setEndDate(e.target.value) }}
          />
          <div className="message-panel-hint" style={{ marginTop: 6, marginBottom: 0 }}>
            Tuition must be paid in full before this date - reminders and messages count down from it.
          </div>
        </div>

        {error && <div className="error-msg confirm-error">{error}</div>}

        <div className="message-panel-actions">
          <button type="button" className="message-panel-btn message-panel-btn-email" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save dates'}
          </button>
        </div>
      </div>
    </div>
  )
}
