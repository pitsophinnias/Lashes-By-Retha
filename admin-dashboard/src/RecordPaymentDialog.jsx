import { useId, useState } from 'react'

// Same visual shell as StudentDatesDialog/MessageCustomerPanel. Records a
// manual payment (EFT, cash, anything outside the Ozow/Payflex gateways) -
// amount_paid/payment_status/certificate_on_hold are all recomputed
// server-side from this and every other payment in one place (see
// backend/src/students/balance.js), so this dialog itself just collects
// the amount. onSave resolves to whatever the parent's apiFetch call
// returns, and the parent (not this dialog) decides whether to show the
// "certificate can now be issued" toast immediately.
export default function RecordPaymentDialog({ student, onClose, onSave }) {
  const titleId = useId()
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    const parsed = parseFloat(amount)
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError('Enter an amount greater than 0.')
      return
    }
    setSaving(true)
    setError('')
    try {
      await onSave(parsed, note.trim())
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
          <h2 id={titleId} className="confirm-title">Record payment for {student.name}</h2>
          <button type="button" className="confirm-close-btn" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="message-panel-field">
          <label className="message-panel-label" htmlFor={`${titleId}-amount`}>Amount (R)</label>
          <input
            id={`${titleId}-amount`}
            type="number"
            min="0.01"
            step="0.01"
            className="message-panel-input"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            autoFocus
          />
        </div>

        <div className="message-panel-field">
          <label className="message-panel-label" htmlFor={`${titleId}-note`}>Note (optional)</label>
          <input
            id={`${titleId}-note`}
            className="message-panel-input"
            placeholder="e.g. EFT, cash, bank reference"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>

        {error && <div className="error-msg confirm-error">{error}</div>}

        <div className="message-panel-actions">
          <button type="button" className="message-panel-btn message-panel-btn-email" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Record payment'}
          </button>
        </div>
      </div>
    </div>
  )
}
