import { useEffect, useId, useMemo, useState } from 'react'
import { useToast } from './Toast.jsx'
import { renderTemplate } from './messaging/render.js'
import { whatsappLink, emailLink, copyToClipboard, MAILTO_SAFE_LENGTH } from './messaging/channels.js'
import { normalizeWhatsAppNumber } from './messaging/phone.js'
import {
  buildOrderTemplateData, buildPreorderTemplateData, buildStudentTemplateData,
  defaultTemplateIdForOrder, defaultTemplateIdForPreorder, defaultTemplateIdForStudent,
} from './messaging/buildData.js'

const GROUP_FOR_TYPE = { order: 'orders', preorder: 'preorders', student: 'training' }

const contactFor = (entityType, entity) => {
  if (entityType === 'student') return { phone: entity.whatsapp, email: entity.email }
  return { phone: entity.customerPhone, email: entity.customerEmail }
}

const nameFor = (entityType, entity) => (entityType === 'student' ? entity.name : entity.customerName)

// Same visual shell as ConfirmDialog (.confirm-overlay/.confirm-card/
// .confirm-header/.confirm-close-btn - that component's own <style> is
// always mounted alongside AppInner, so those class names are already
// available here) - wider, since this needs room for a dropdown and a
// multi-line message, with its own styles for what's unique to it.
export default function MessageCustomerPanel({ entityType, entity, course, templates, businessDetails, onClose }) {
  const toast = useToast()
  const titleId = useId()
  const group = GROUP_FOR_TYPE[entityType]
  const groupTemplates = useMemo(() => templates.filter((t) => t.group === group), [templates, group])

  const defaultTemplateId = useMemo(() => {
    if (entityType === 'order') return defaultTemplateIdForOrder(entity)
    if (entityType === 'preorder') return defaultTemplateIdForPreorder(entity)
    return defaultTemplateIdForStudent(entity)
  }, [entityType, entity])

  const [templateId, setTemplateId] = useState(defaultTemplateId)
  const selectedTemplate = groupTemplates.find((t) => t.id === templateId) || groupTemplates[0] || null

  const data = useMemo(() => {
    if (entityType === 'order') return buildOrderTemplateData(entity, businessDetails)
    if (entityType === 'preorder') return buildPreorderTemplateData(entity, businessDetails)
    return buildStudentTemplateData(entity, course, businessDetails)
  }, [entityType, entity, course, businessDetails])

  const [messageText, setMessageText] = useState('')
  const [subjectText, setSubjectText] = useState('')

  // Switching templates replaces the draft with the newly-selected one's
  // rendering - further edits are one-off and never write back to the
  // template itself.
  useEffect(() => {
    if (!selectedTemplate) return
    setMessageText(renderTemplate(selectedTemplate.body, data, { whatsapp: true }))
    setSubjectText(renderTemplate(selectedTemplate.emailSubject, data, { whatsapp: false }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTemplate?.id])

  const { phone, email } = contactFor(entityType, entity)
  const name = nameFor(entityType, entity)
  const normalizedPhone = normalizeWhatsAppNumber(phone)
  const emailBody = messageText.replace(/\*/g, '')
  const mailtoTooLong = !!email && (encodeURIComponent(subjectText).length + encodeURIComponent(emailBody).length) > MAILTO_SAFE_LENGTH
  const waLink = normalizedPhone ? whatsappLink(phone, messageText) : null
  const mailLink = email && !mailtoTooLong ? emailLink(email, subjectText, emailBody) : null

  const handleSendWhatsApp = () => {
    if (!waLink) return
    window.open(waLink, '_blank', 'noopener,noreferrer')
  }

  const handleSendEmail = () => {
    if (!mailLink) return
    window.location.href = mailLink
  }

  const handleCopy = async () => {
    const copied = await copyToClipboard(messageText)
    toast(copied ? 'Message copied' : 'Could not copy - please select and copy manually', copied ? 'success' : 'error')
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
          <h2 id={titleId} className="confirm-title">Message {name || 'Customer'}</h2>
          <button type="button" className="confirm-close-btn" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="message-panel-field">
          <label className="message-panel-label" htmlFor={`${titleId}-template`}>Template</label>
          <select
            id={`${titleId}-template`}
            className="message-panel-select"
            value={selectedTemplate?.id || ''}
            onChange={(e) => setTemplateId(e.target.value)}
          >
            {groupTemplates.map((t) => (
              <option key={t.id} value={t.id}>{t.label}</option>
            ))}
          </select>
        </div>

        <div className="message-panel-field">
          <label className="message-panel-label" htmlFor={`${titleId}-subject`}>Email subject</label>
          <input
            id={`${titleId}-subject`}
            className="message-panel-input"
            value={subjectText}
            onChange={(e) => setSubjectText(e.target.value)}
          />
        </div>

        <div className="message-panel-field">
          <label className="message-panel-label" htmlFor={`${titleId}-body`}>Message</label>
          <textarea
            id={`${titleId}-body`}
            className="message-panel-textarea"
            rows={10}
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
          />
        </div>

        {mailtoTooLong && (
          <div className="message-panel-hint">This message is too long to open as an email directly - use Copy and paste it into your email client instead.</div>
        )}

        <div className="message-panel-actions">
          <button type="button" className="message-panel-btn message-panel-btn-whatsapp" onClick={handleSendWhatsApp} disabled={!waLink}>
            Send on WhatsApp
          </button>
          {!waLink && <div className="message-panel-hint">No phone number on this {entityType === 'student' ? 'student' : entityType}.</div>}

          <button type="button" className="message-panel-btn message-panel-btn-email" onClick={handleSendEmail} disabled={!mailLink}>
            Send email
          </button>
          {!email && <div className="message-panel-hint">No email address on this {entityType === 'student' ? 'student' : entityType}.</div>}

          <button type="button" className="message-panel-btn message-panel-btn-copy" onClick={handleCopy}>
            Copy
          </button>
        </div>
      </div>

      <style>{`
        .message-panel-card { max-width: 560px; text-align: left; }
        .message-panel-field { margin-bottom: 14px; }
        .message-panel-label {
          display: block;
          font-size: 11px;
          font-weight: 700;
          color: #9A8A8E;
          text-transform: uppercase;
          letter-spacing: 1px;
          margin-bottom: 6px;
        }
        .message-panel-select, .message-panel-input, .message-panel-textarea {
          width: 100%;
          padding: 10px 14px;
          border-radius: 8px;
          border: 1px solid #EDD5DB;
          font-size: 13px;
          font-family: inherit;
          color: #2C1A20;
          background: white;
          outline: none;
          box-sizing: border-box;
        }
        .message-panel-textarea { resize: vertical; line-height: 1.5; }
        .message-panel-select:focus, .message-panel-input:focus, .message-panel-textarea:focus {
          border-color: #C47A8A;
          box-shadow: 0 0 0 3px rgba(196,122,138,0.15);
        }
        .message-panel-hint { font-size: 12px; color: #9A8A8E; margin: -4px 0 10px; }
        .message-panel-actions { display: flex; flex-direction: column; gap: 8px; margin-top: 4px; }
        .message-panel-btn {
          width: 100%;
          padding: 11px 16px;
          font-size: 13px;
          font-weight: 700;
          font-family: inherit;
          border-radius: 8px;
          border: none;
          cursor: pointer;
          transition: background 0.15s;
        }
        .message-panel-btn:disabled { opacity: 0.5; cursor: default; }
        .message-panel-btn-whatsapp { background: #25D366; color: white; }
        .message-panel-btn-whatsapp:hover:not(:disabled) { background: #1DA851; }
        .message-panel-btn-email { background: #C47A8A; color: white; }
        .message-panel-btn-email:hover:not(:disabled) { background: #A0566A; }
        .message-panel-btn-copy { background: #F7EEF0; color: #8C5A6A; border: 1px solid #EDD5DB; }
        .message-panel-btn-copy:hover { background: #EDD5DB; }
      `}</style>
    </div>
  )
}
