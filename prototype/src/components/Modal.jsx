import React, { useEffect } from 'react';
import { pal, CAR, btn } from '../design/calm.js';

export default function Modal({ open, onClose, title, children, width = 560 }) {
  useEffect(() => {
    if (!open) return;
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(28,26,23,0.5)',
        backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: pal.card,
          borderRadius: 24,
          width: '100%',
          maxWidth: width,
          maxHeight: '85vh',
          overflow: 'auto',
          boxShadow: '0 24px 72px rgba(0,0,0,0.22)',
        }}
      >
        {title && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '20px 24px 16px',
            borderBottom: `1px solid ${pal.cardEdge}`,
          }}>
            <h2 style={{ fontSize: CAR.fontSize.md, fontWeight: 700, color: pal.ink }}>{title}</h2>
            <button
              onClick={onClose}
              style={{
                width: 40, height: 40, borderRadius: '50%',
                border: 'none', background: pal.bg,
                cursor: 'pointer', fontSize: 20, color: pal.inkDim,
                display: 'grid', placeItems: 'center',
              }}
            >×</button>
          </div>
        )}
        <div style={{ padding: 24 }}>
          {children}
        </div>
      </div>
    </div>
  );
}

export function BottomSheet({ open, onClose, title, children }) {
  useEffect(() => {
    if (!open) return;
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(28,26,23,0.5)',
        backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: pal.card,
          borderRadius: '24px 24px 0 0',
          width: '100%',
          maxWidth: 700,
          maxHeight: '80vh',
          overflow: 'auto',
          boxShadow: '0 -12px 48px rgba(0,0,0,0.18)',
        }}
      >
        {/* Drag handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '14px 24px 0' }}>
          <div style={{ width: 44, height: 5, borderRadius: 3, background: pal.cardEdge }} />
        </div>
        {title && (
          <div style={{
            padding: '16px 24px 14px',
            borderBottom: `1px solid ${pal.cardEdge}`,
            fontSize: CAR.fontSize.md, fontWeight: 700, color: pal.ink,
          }}>{title}</div>
        )}
        <div style={{ padding: 24 }}>
          {children}
        </div>
      </div>
    </div>
  );
}
