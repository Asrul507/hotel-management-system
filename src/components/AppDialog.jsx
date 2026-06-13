import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const DialogContext = createContext(null);
const defaultOptions = { title: 'Konfirmasi', message: '', confirmLabel: 'OK', cancelLabel: 'Batal', fields: [] };

export function AppDialogProvider({ children }) {
  const [dialog, setDialog] = useState(null);

  const openDialog = useCallback((options) => new Promise((resolve) => {
    setDialog({ ...defaultOptions, ...options, resolve });
  }), []);

  const close = useCallback((result) => {
    setDialog((current) => {
      current?.resolve(result);
      return null;
    });
  }, []);

  useEffect(() => {
    if (!dialog) return undefined;
    function onKeyDown(event) {
      if (event.key === 'Escape') close({ confirmed: false, values: {} });
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [dialog, close]);

  const api = useMemo(() => ({
    confirm: async (options) => {
      const result = await openDialog({ ...options, fields: [] });
      return result.confirmed;
    },
    form: async (options) => openDialog(options)
  }), [openDialog]);

  return <DialogContext.Provider value={api}>
    {children}
    {dialog && <DialogModal dialog={dialog} onClose={close} />}
  </DialogContext.Provider>;
}

export function useAppDialog() {
  const context = useContext(DialogContext);
  if (!context) throw new Error('useAppDialog must be used inside AppDialogProvider');
  return context;
}

function DialogModal({ dialog, onClose }) {
  const initialValues = Object.fromEntries((dialog.fields || []).map((field) => [field.name, field.defaultValue ?? '']));
  const [values, setValues] = useState(initialValues);
  const hasFields = (dialog.fields || []).length > 0;

  return <div className="modal-backdrop app-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose({ confirmed: false, values }); }}>
    <section className="modal-card app-dialog-card" role="dialog" aria-modal="true" aria-labelledby="app-dialog-title">
      <div className="modal-header">
        <div><p className="eyebrow">Hotel PMS</p><h2 id="app-dialog-title">{dialog.title}</h2></div>
        <button type="button" className="modal-close" aria-label="Tutup" onClick={() => onClose({ confirmed: false, values })}>×</button>
      </div>
      {dialog.message && <p className="dialog-message">{dialog.message}</p>}
      {hasFields && <div className="form-grid dialog-fields">{dialog.fields.map((field) => <label key={field.name} className={field.full ? 'full' : ''}>{field.label}<input type={field.type || 'text'} min={field.min} step={field.step} value={values[field.name] ?? ''} onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.value }))} placeholder={field.placeholder || ''} autoFocus={field.autoFocus} /></label>)}</div>}
      <div className="modal-footer dialog-actions">
        <button type="button" className="secondary" onClick={() => onClose({ confirmed: false, values })}>{dialog.cancelLabel || 'Batal'}</button>
        <button type="button" className={dialog.danger ? 'danger' : ''} onClick={() => onClose({ confirmed: true, values })}>{dialog.confirmLabel || 'OK'}</button>
      </div>
    </section>
  </div>;
}
