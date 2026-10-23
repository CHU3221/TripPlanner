import { useEffect, useState } from 'react'
import type { TimelineLabel } from '../model'
import { text as ui } from '../i18n/catalog'

export function LabelModal({ label, onClose, onSave, onDelete }: {
  label: TimelineLabel
  onClose: () => void
  onSave: (text: string) => void
  onDelete: () => void
}) {
  const [text, setText] = useState(label.text)
  useEffect(() => setText(label.text), [label])
  return <div className="modal-backdrop" onPointerDown={onClose}><section className="label-modal" onPointerDown={e => e.stopPropagation()}>
    <header><div><small>{ui.labelEditor.eyebrow}</small><strong>{ui.labelEditor.title}</strong></div><button onClick={onClose}><span className="material-symbols-rounded">close</span></button></header>
    <div className="label-editor"><input autoFocus value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === 'Enter' && text.trim() && onSave(text.trim())}/></div>
    <footer><button className="danger" onClick={onDelete}>{ui.common.delete}</button><div/><button onClick={onClose}>{ui.common.cancel}</button><button className="primary" disabled={!text.trim()} onClick={() => onSave(text.trim())}>{ui.common.save}</button></footer>
  </section></div>
}
