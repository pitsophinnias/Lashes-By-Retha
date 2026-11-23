import { useId, useMemo, useState } from 'react'

// Half the lowest effective price, rounded to the nearest R10 - the
// dialog's own suggestion, deliberately simpler than (and separate from)
// the Edit form's suggestedPreorderDeposit, which exists for a different
// situation (an already-priced product switching pre-order on).
const suggestDeposit = (lowest) => Math.max(10, Math.round((lowest / 2) / 10) * 10)

const IconSearch = (props) => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
)

// Same visual shell as ConfirmDialog/MessageCustomerPanel (.confirm-overlay/
// .confirm-card, .message-panel-* field styling - both defined once in
// ConfirmDialog.jsx so they're always available, not tied to any one
// dialog's own mount state). Three shapes in one component, since they
// share almost everything: 'add' is a two-step wizard (choose products,
// then review/price them, one bulk save); 'edit' skips straight to a
// single-row version of the review step, for one existing pre-order
// product's deposit/date.
export default function PreorderProductDialog({ mode, product, productsAvailable, search, onSearchChange, onClose, onSaveSingle, onSaveBulk }) {
  const titleId = useId()
  const isEdit = mode === 'edit'
  const [step, setStep] = useState(isEdit ? 2 : 1)
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [sectionFilter, setSectionFilter] = useState('All')
  const [sharedExpectedDate, setSharedExpectedDate] = useState(isEdit ? (product.preorderExpectedDate || '').slice(0, 10) : '')
  const [rowDrafts, setRowDrafts] = useState(() => (
    isEdit
      ? { [product.id]: { deposit: String(product.preorderDeposit ?? suggestDeposit(product.lowestPrice)), expectedDate: (product.preorderExpectedDate || '').slice(0, 10), useSharedDate: false } }
      : {}
  ))
  const [fieldErrors, setFieldErrors] = useState({})
  const [generalError, setGeneralError] = useState('')
  const [saving, setSaving] = useState(false)

  const eligible = (p) => !p.preorderEnabled

  const sections = useMemo(() => {
    const names = new Set(productsAvailable.filter(eligible).map(p => p.categoryName))
    return ['All', ...Array.from(names).sort()]
  }, [productsAvailable])

  const filtered = useMemo(() => productsAvailable.filter(p =>
    (sectionFilter === 'All' || p.categoryName === sectionFilter) &&
    p.name.toLowerCase().includes(search.trim().toLowerCase())
  ), [productsAvailable, sectionFilter, search])

  const grouped = useMemo(() => {
    const byName = {}
    filtered.forEach(p => { (byName[p.categoryName] ||= []).push(p) })
    return Object.entries(byName).sort((a, b) => a[0].localeCompare(b[0]))
  }, [filtered])

  const toggleOne = (p) => {
    if (!eligible(p)) return
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(p.id) ? next.delete(p.id) : next.add(p.id)
      return next
    })
  }

  const toggleSection = (sectionProducts) => {
    const selectable = sectionProducts.filter(eligible)
    const allSelected = selectable.length > 0 && selectable.every(p => selectedIds.has(p.id))
    setSelectedIds(prev => {
      const next = new Set(prev)
      selectable.forEach(p => (allSelected ? next.delete(p.id) : next.add(p.id)))
      return next
    })
  }

  const priceLabel = (p) => (p.highestPrice > p.lowestPrice ? `R ${p.lowestPrice.toFixed(2)} – R ${p.highestPrice.toFixed(2)}` : `R ${p.lowestPrice.toFixed(2)}`)

  const goToReview = () => {
    const chosen = productsAvailable.filter(p => selectedIds.has(p.id) && eligible(p))
    const drafts = {}
    chosen.forEach(p => { drafts[p.id] = { deposit: String(suggestDeposit(p.lowestPrice)), expectedDate: '', useSharedDate: true } })
    setRowDrafts(drafts)
    setFieldErrors({})
    setStep(2)
  }

  const reviewProducts = isEdit ? [product] : productsAvailable.filter(p => selectedIds.has(p.id) && eligible(p))

  const updateRow = (id, patch) => setRowDrafts(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }))

  const handleSave = async () => {
    setSaving(true)
    setGeneralError('')
    try {
      if (isEdit) {
        const draft = rowDrafts[product.id]
        const deposit = parseFloat(draft.deposit)
        if (!Number.isFinite(deposit) || deposit <= 0) {
          setFieldErrors({ [product.id]: 'Enter a deposit greater than R0.' })
          return
        }
        if (deposit > product.lowestPrice) {
          setFieldErrors({ [product.id]: `Can't be more than R ${product.lowestPrice.toFixed(2)} (the lowest price).` })
          return
        }
        setFieldErrors({})
        await onSaveSingle(product, deposit, draft.expectedDate)
      } else {
        const items = reviewProducts.map(p => {
          const draft = rowDrafts[p.id] || {}
          return {
            id: p.id, name: p.name,
            deposit: parseFloat(draft.deposit),
            expectedDate: draft.useSharedDate !== false ? sharedExpectedDate : draft.expectedDate,
            lowestPrice: p.lowestPrice,
          }
        })
        const errs = {}
        items.forEach(i => {
          if (!Number.isFinite(i.deposit) || i.deposit <= 0) errs[i.id] = 'Enter a deposit greater than R0.'
          else if (i.deposit > i.lowestPrice) errs[i.id] = `Can't be more than R ${i.lowestPrice.toFixed(2)} (the lowest price).`
        })
        if (Object.keys(errs).length > 0) {
          setFieldErrors(errs)
          return
        }
        setFieldErrors({})
        await onSaveBulk(items)
      }
    } catch (err) {
      if (err.errors && Object.keys(err.errors).length > 0) setFieldErrors(err.errors)
      else setGeneralError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="confirm-overlay" onClick={onClose}>
      <div
        className="confirm-card message-panel-card"
        style={{ maxWidth: 600 }}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="confirm-header">
          <h2 id={titleId} className="confirm-title">
            {isEdit ? `Pre-order: ${product.name}` : step === 1 ? 'Add products to pre-order' : `Review (${reviewProducts.length})`}
          </h2>
          <button type="button" className="confirm-close-btn" onClick={onClose} aria-label="Close">×</button>
        </div>

        {!isEdit && step === 1 && (
          <>
            <div className="message-panel-field" style={{ position: 'relative' }}>
              <IconSearch style={{ position: 'absolute', left: 12, top: 12, color: '#9A8A8E' }} />
              <input
                className="message-panel-input"
                style={{ paddingLeft: 36 }}
                value={search}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Search products…"
                autoFocus
              />
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
              {sections.map(name => (
                <button
                  key={name}
                  type="button"
                  onClick={() => setSectionFilter(name)}
                  style={{
                    padding: '5px 12px', borderRadius: 14, fontSize: 12, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
                    border: `1px solid ${sectionFilter === name ? '#C47A8A' : '#EDD5DB'}`,
                    background: sectionFilter === name ? '#C47A8A' : 'white',
                    color: sectionFilter === name ? 'white' : '#7A6670',
                  }}
                >
                  {name}
                </button>
              ))}
            </div>

            <div style={{ maxHeight: 320, overflowY: 'auto', border: '1px solid #EDD5DB', borderRadius: 8, marginBottom: 14 }}>
              {grouped.length === 0 && (
                <div style={{ padding: 16, fontSize: 13, color: '#9A8A8E', textAlign: 'center' }}>No matching products.</div>
              )}
              {grouped.map(([sectionName, sectionProducts]) => {
                const selectable = sectionProducts.filter(eligible)
                const selectedCount = selectable.filter(p => selectedIds.has(p.id)).length
                return (
                  <div key={sectionName}>
                    <label
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: '#FAF6F4',
                        borderBottom: '1px solid #F0E8E8', fontSize: 12, fontWeight: 700, color: '#7A6670',
                        cursor: selectable.length > 0 ? 'pointer' : 'default',
                      }}
                    >
                      <input
                        type="checkbox"
                        disabled={selectable.length === 0}
                        checked={selectable.length > 0 && selectedCount === selectable.length}
                        ref={(el) => { if (el) el.indeterminate = selectedCount > 0 && selectedCount < selectable.length }}
                        onChange={() => toggleSection(sectionProducts)}
                      />
                      Select all in {sectionName} ({selectable.length})
                    </label>
                    {sectionProducts.map(p => {
                      const disabled = !eligible(p)
                      return (
                        <div
                          key={p.id}
                          onClick={() => toggleOne(p)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                            borderBottom: '1px solid #F7EEF0', cursor: disabled ? 'default' : 'pointer',
                            opacity: disabled ? 0.5 : 1,
                          }}
                        >
                          <input type="checkbox" checked={selectedIds.has(p.id)} disabled={disabled} onChange={() => toggleOne(p)} onClick={(e) => e.stopPropagation()} />
                          <div style={{ width: 36, height: 36, borderRadius: 6, overflow: 'hidden', background: '#F7EEF0', flexShrink: 0 }}>
                            {p.thumbnail && <img src={p.thumbnail} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: '#2C1A20' }}>{p.name}</div>
                            <div style={{ fontSize: 11, color: '#9A8A8E' }}>{priceLabel(p)}</div>
                          </div>
                          {disabled && (
                            <span style={{ fontSize: 10, fontWeight: 700, color: '#9A8A8E', background: '#F0E8E8', borderRadius: 4, padding: '3px 7px', textTransform: 'uppercase' }}>
                              Already on pre-order
                            </span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 12, color: '#9A8A8E' }}>
                {selectedIds.size} selected
                {selectedIds.size > 0 && (
                  <button type="button" onClick={() => setSelectedIds(new Set())} style={{ marginLeft: 10, background: 'none', border: 'none', color: '#C47A8A', fontWeight: 600, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
                    Clear
                  </button>
                )}
              </div>
              <button type="button" className="message-panel-btn message-panel-btn-email" style={{ width: 'auto', padding: '10px 20px' }} onClick={goToReview} disabled={selectedIds.size === 0}>
                Next
              </button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            {!isEdit && (
              <div className="message-panel-field">
                <label className="message-panel-label" htmlFor={`${titleId}-shared-date`}>Expected arrival date (optional, applies to all unless overridden below)</label>
                <input
                  id={`${titleId}-shared-date`}
                  type="date"
                  className="message-panel-input"
                  value={sharedExpectedDate}
                  onChange={(e) => setSharedExpectedDate(e.target.value)}
                />
              </div>
            )}

            <div style={{ maxHeight: 360, overflowY: 'auto' }}>
              {reviewProducts.map(p => {
                const draft = rowDrafts[p.id] || {}
                const error = fieldErrors[p.id]
                return (
                  <div key={p.id} style={{ border: '1px solid #EDD5DB', borderRadius: 8, padding: 10, marginBottom: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                      <div style={{ width: 36, height: 36, borderRadius: 6, overflow: 'hidden', background: '#F7EEF0', flexShrink: 0 }}>
                        {p.thumbnail && <img src={p.thumbnail} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                      </div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#2C1A20' }}>{p.name}</div>
                        <div style={{ fontSize: 11, color: '#9A8A8E' }}>{priceLabel(p)}</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      <div style={{ flex: '1 1 120px' }}>
                        <label className="message-panel-label" htmlFor={`${titleId}-deposit-${p.id}`}>Deposit (R)</label>
                        <input
                          id={`${titleId}-deposit-${p.id}`}
                          type="number"
                          min="0.01"
                          step="0.01"
                          className="message-panel-input"
                          value={draft.deposit ?? ''}
                          onChange={(e) => updateRow(p.id, { deposit: e.target.value })}
                        />
                      </div>
                      {!isEdit && (
                        <div style={{ flex: '1 1 160px' }}>
                          <label className="message-panel-label" htmlFor={`${titleId}-date-${p.id}`}>
                            <input
                              type="checkbox"
                              checked={draft.useSharedDate === false}
                              onChange={(e) => updateRow(p.id, { useSharedDate: !e.target.checked })}
                              style={{ marginRight: 6 }}
                            />
                            Different date for this one
                          </label>
                          {draft.useSharedDate === false && (
                            <input
                              id={`${titleId}-date-${p.id}`}
                              type="date"
                              className="message-panel-input"
                              value={draft.expectedDate || ''}
                              onChange={(e) => updateRow(p.id, { expectedDate: e.target.value })}
                            />
                          )}
                        </div>
                      )}
                      {isEdit && (
                        <div style={{ flex: '1 1 160px' }}>
                          <label className="message-panel-label" htmlFor={`${titleId}-date-${p.id}`}>Expected arrival date (optional)</label>
                          <input
                            id={`${titleId}-date-${p.id}`}
                            type="date"
                            className="message-panel-input"
                            value={draft.expectedDate || ''}
                            onChange={(e) => updateRow(p.id, { expectedDate: e.target.value })}
                          />
                        </div>
                      )}
                    </div>
                    {error && <div className="error-msg" style={{ marginTop: 6 }}>{error}</div>}
                  </div>
                )
              })}
            </div>

            {generalError && <div className="error-msg confirm-error">{generalError}</div>}

            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              {!isEdit && (
                <button type="button" className="message-panel-btn message-panel-btn-copy" style={{ width: 'auto', padding: '11px 18px' }} onClick={() => setStep(1)} disabled={saving}>
                  Back
                </button>
              )}
              <button type="button" className="message-panel-btn message-panel-btn-email" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : isEdit ? 'Save' : `Add ${reviewProducts.length} product${reviewProducts.length !== 1 ? 's' : ''} to pre-order`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
