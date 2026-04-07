import React, { useState } from 'react';

interface ValidActions {
  fold?: boolean; check?: boolean; call?: number;
  raise?: { min: number; max: number; buttons: Record<string, number> };
  all_in?: number;
}

interface Props {
  validActions: ValidActions;
  onAction: (action: string, amount: number) => void;
  pot: number;
  disabled?: boolean;
}

export default function RaiseControl({ validActions, onAction, pot, disabled = false }: Props) {
  const [showRaise, setShowRaise] = useState(false);
  const [raiseAmount, setRaiseAmount] = useState('');
  const ra = validActions.raise;
  const callAmt = validActions.call ?? 0;

  const parsedAmount = (() => {
    if (!ra) return 0;
    const n = parseInt(raiseAmount);
    if (isNaN(n)) return ra.min;
    return Math.max(ra.min, Math.min(ra.max, n));
  })();

  const handleRaise = () => {
    if (!ra) return;
    onAction('raise', parsedAmount);
    setShowRaise(false);
    setRaiseAmount('');
  };

  const btnStyle = (bg: string, color: string, border?: string): React.CSSProperties => ({
    flex: 1, minWidth: 64, padding: '13px 8px',
    background: bg, border: border ?? `1px solid ${bg}`,
    borderRadius: 14, fontSize: 13, fontWeight: 900,
    color, cursor: disabled ? 'default' : 'pointer',
    letterSpacing: 0.5,
    transition: 'opacity 0.15s',
    opacity: disabled ? 0.5 : 1,
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* Main buttons */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {validActions.fold && (
          <button style={btnStyle('#131a2a', '#ef4444', '1px solid #ef444440')}
            onClick={() => { if (!disabled) { onAction('fold', 0); setShowRaise(false); } }}>
            FOLD
          </button>
        )}
        {validActions.check && (
          <button style={btnStyle('#131a2a', '#ffffff', '1px solid #33415544')}
            onClick={() => { if (!disabled) { onAction('check', 0); setShowRaise(false); } }}>
            CHECK
          </button>
        )}
        {callAmt > 0 && (
          <button style={btnStyle('#1e40af', '#ffffff', '1px solid #3b82f6')}
            onClick={() => { if (!disabled) { onAction('call', 0); setShowRaise(false); } }}>
            CALL {callAmt.toLocaleString()}
          </button>
        )}
        {ra && (
          <button style={btnStyle(showRaise ? '#e6a600' : '#ffb800', '#0a0f1a')}
            onClick={() => !disabled && setShowRaise(v => !v)}>
            RAISE ▲
          </button>
        )}
        {validActions.all_in !== undefined && (
          <button style={btnStyle('#7c3aed', '#ffffff', '1px solid #a78bfa')}
            onClick={() => { if (!disabled) { onAction('all_in', 0); setShowRaise(false); } }}>
            ALL IN
          </button>
        )}
      </div>

      {/* Raise panel */}
      {showRaise && ra && (
        <div style={{
          background: '#131a2a', borderRadius: 16, border: '1px solid #1e293b', padding: 12,
          display: 'flex', flexDirection: 'column', gap: 10,
        }}>
          {/* Preset buttons */}
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
            {Object.entries(ra.buttons).map(([label, amt]) => (
              <button
                key={label}
                onClick={() => { setRaiseAmount(String(amt)); onAction('raise', amt); setShowRaise(false); }}
                style={{
                  background: '#1e293b', border: '1px solid #334155',
                  borderRadius: 10, padding: '6px 10px',
                  cursor: 'pointer', flexShrink: 0, textAlign: 'center',
                }}
              >
                <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700 }}>{label}</div>
                <div style={{ fontSize: 12, color: '#ffffff', fontWeight: 800, marginTop: 2 }}>{amt.toLocaleString()}</div>
              </button>
            ))}
          </div>

          {/* Slider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 10, color: '#64748b', width: 40, textAlign: 'right' }}>{ra.min.toLocaleString()}</span>
            <input
              type="range"
              min={ra.min} max={ra.max}
              value={parsedAmount || ra.min}
              step={1}
              onChange={e => setRaiseAmount(e.target.value)}
              style={{ flex: 1, accentColor: '#00f0ff' }}
            />
            <span style={{ fontSize: 10, color: '#64748b', width: 40 }}>{ra.max.toLocaleString()}</span>
          </div>

          {/* Input + Confirm */}
          <div style={{ display: 'flex', gap: 10 }}>
            <input
              type="number"
              value={raiseAmount}
              onChange={e => setRaiseAmount(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleRaise()}
              placeholder={String(ra.min)}
              style={{
                flex: 1, background: '#0a0f1a', border: '1px solid #1e293b',
                borderRadius: 10, padding: '10px 12px', color: '#ffffff', fontSize: 16,
                fontWeight: 700, outline: 'none',
              }}
            />
            <button
              onClick={handleRaise}
              style={{
                background: '#ffb800', border: 'none', borderRadius: 10,
                padding: '0 16px', fontSize: 13, fontWeight: 900, color: '#0a0f1a',
                cursor: 'pointer',
              }}
            >
              RAISE {parsedAmount.toLocaleString()}
            </button>
          </div>

          <div style={{ fontSize: 10, color: '#475569', textAlign: 'center' }}>
            Pot: {pot.toLocaleString()} · Min: {ra.min.toLocaleString()} · Max (pot): {ra.max.toLocaleString()}
          </div>
        </div>
      )}
    </div>
  );
}
