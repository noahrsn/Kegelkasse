import React, { useEffect } from 'react';
import { pal, btn } from '../design/calm.js';

export default function Modal({ open, onClose, title, children, width = 480 }) {
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
        background: 'rgba(28,26,23,0.45)',
        backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: pal.card,
          borderRadius: 20,
          width: '100%',
          maxWidth: width,
          maxHeight: '90vh',
          overflow: 'auto',
          boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
        }}
      >
        {title && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '18px 20px 14px',
            borderBottom: `1px solid ${pal.cardEdge}`,
          }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: pal.ink }}>{title}</h2>
            <button
              onClick={onClose}
              style={{
                width: 28, height: 28, borderRadius: '50%',
                border: 'none', background: pal.bg,
                cursor: 'pointer', fontSize: 16, color: pal.inkDim,
                display: 'grid', placeItems: 'center',
              }}
            >×</button>
          </div>
        )}
        <div style={{ padding: 20 }}>
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
        background: 'rgba(28,26,23,0.45)',
        backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: pal.card,
          borderRadius: '20px 20px 0 0',
          width: '100%',
          maxWidth: 600,
          maxHeight: '85vh',
          overflow: 'auto',
          boxShadow: '0 -8px 40px rgba(0,0,0,0.15)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 20px 0' }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: pal.cardEdge }} />
        </div>
        {title && (
          <div style={{
            padding: '14px 20px 12px',
            borderBottom: `1px solid ${pal.cardEdge}`,
            fontSize: 15, fontWeight: 700, color: pal.ink,
          }}>{title}</div>
        )}
        <div style={{ padding: 20 }}>
          {children}
        </div>
      </div>
    </div>
  );
}
