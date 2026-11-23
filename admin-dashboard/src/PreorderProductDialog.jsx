import { useId, useState } from 'react'

// Same visual shell as ConfirmDialog/StudentDatesDialog. Handles both
// "Add product to pre-order" (productsAvailable is a searchable list,
// nothing picked yet) and "Edit" on an existing pre-order product
// (mode is 'edit', product is already fixed) - the same fields and the
// same save either way, since both end up PATCHing the same product
// fields (see savePreorderProduct in App.jsx).
export default function PreorderProductDialog({ mode, product, productsAvailable, search, onSearchChange, onClose, onSave }) {
  const titleId = useId()
  const [selected, setSelected] = useState(mode === 'edit' ? product : null)
  const [deposit, setDeposit] = useState(mode === 'edit' ? String(product.preorderDeposit ?? '') : '')
  const [expectedDate, setExpectedDate] = useState(mode === 'edit' ? (product.preorderExpectedDate || '').slice(0, 10) : '')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const filtered = search.trim()
    ? productsAvailable.filter(p => p.name.toLowerCase().includes(search.trim().toLowerCase()))
    : productsAvailable

  const pickProduct = (p) => {
    setSelected(p)
    // Half the lowest effective price, rounded to the nearest R10 - a
    // different (simpler) suggestion than the Edit form's own
    // suggestedPreorderDeposit, which exists for a different situation
    // (an already-priced product switching pre-order on) - see the README.
    const suggested = Math.max(10, Math.round((p.lowestPrice / 2) / 10) * 10)
    setDeposit(String(suggested))
  }

  const handleSave = async () => {
    const depositNum = parseFloat(deposit)
    if (!Number.isFinite(depositNum) || depositNum <= 0) {
      setError('Enter a deposit amount greater than R0.')
      return
    }
    if (depositNum > selected.lowestPrice) {
      setError(`Deposit can't be more than the lowest price (R ${selected.lowestPrice.toFixed(2)}).`)
      return
    }
    setSaving(true)
    setError('')
    try {
      await onSave(selected, depositNum, expectedDate)
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
          <h2 id={titleId} className="confirm-title">
            {mode === 'edit' ? `Pre-order: ${product.name}` : 'Add product to pre-order'}
          </h2>
          <button type="button" className="confirm-close-btn" onClick={onClose} aria-label="Close">×</button>
        </div>

        {mode === 'add' && !selected && (
          <div className="message-panel-field">
            <label className="message-panel-label" htmlFor={`${titleId}-search`}>Product</label>
            <input
              id={`${titleId}-search`}
              className="message-panel-input"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search products..."
              autoFocus
            />
            <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid #EDD5DB', borderRadius: 8, marginTop: 8 }}>
              {filtered.length === 0 && (
                <div style={{ padding: 14, fontSize: 13, color: '#9A8A8E', textAlign: 'center' }}>
                  {productsAvailable.length === 0 ? 'Every active product is already on pre-order.' : 'No matches.'}
                </div>
              )}
              {filtered.map(p => (
                <div
                  key={p.id}
                  onClick={() => pickProduct(p)}
                  style={{ padding: '10px 12px', borderBottom: '1px solid #F7EEF0', cursor: 'pointer', fontSize: 13, color: '#2C1A20' }}
                >
                  {p.name} <span style={{ color: '#9A8A8E' }}>· R {p.lowestPrice.toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {selected && (
          <>
            {mode === 'add' && (
              <div className="message-panel-field">
                <div className="message-panel-label">Product</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#2C1A20' }}>{selected.name}</div>
                <button type="button" className="message-panel-btn message-panel-btn-copy" style={{ marginTop: 8 }} onClick={() => setSelected(null)}>
                  Choose a different product
                </button>
              </div>
            )}

            <div className="message-panel-field">
              <label className="message-panel-label" htmlFor={`${titleId}-deposit`}>Deposit amount (R)</label>
              <input
                id={`${titleId}-deposit`}
                type="number"
                min="0.01"
                step="0.01"
                className="message-panel-input"
                value={deposit}
                onChange={(e) => setDeposit(e.target.value)}
              />
              <div className="message-panel-hint" style={{ marginTop: 6, marginBottom: 0 }}>
                Can't be more than the lowest price (R {selected.lowestPrice.toFixed(2)}).
              </div>
            </div>

            <div className="message-panel-field">
              <label className="message-panel-label" htmlFor={`${titleId}-date`}>Expected arrival date (optional)</label>
              <input
                id={`${titleId}-date`}
                type="date"
                className="message-panel-input"
                value={expectedDate}
                onChange={(e) => setExpectedDate(e.target.value)}
              />
            </div>

            {error && <div className="error-msg confirm-error">{error}</div>}

            <div className="message-panel-actions">
              <button type="button" className="message-panel-btn message-panel-btn-email" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
