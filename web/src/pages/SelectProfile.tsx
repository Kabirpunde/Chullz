import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const PROFILES = [
  { username: 'AceKing',     avatar: '🦁', color: '#c9a227' },
  { username: 'BluffMaster', avatar: '🐺', color: '#3b82f6' },
  { username: 'CardShark',   avatar: '🦊', color: '#f97316' },
  { username: 'PokerPro',    avatar: '🐻', color: '#6b4226' },
  { username: 'AllInAndy',   avatar: '🦅', color: '#0891b2' },
  { username: 'HighRoller',  avatar: '🐯', color: '#dc2626' },
  { username: 'TableAdmin',  avatar: '👑', color: '#7c3aed', role: 'admin' as const },
];

type Profile = typeof PROFILES[0];

export default function SelectProfile() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [selected, setSelected] = useState<Profile | null>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [shake, setShake] = useState(false);

  useEffect(() => {
    if (pin.length === 4 && selected && !loading) handleLogin();
  }, [pin]);

  const handleSelectProfile = (p: Profile) => {
    setSelected(p);
    setPin('');
    setError('');
  };

  const handleNum = (n: string) => {
    if (loading || pin.length >= 4) return;
    setPin(prev => prev + n);
    setError('');
  };

  const handleDelete = () => {
    if (!loading) setPin(prev => prev.slice(0, -1));
  };

  const handleLogin = async () => {
    if (!selected || pin.length !== 4 || loading) return;
    setLoading(true);
    try {
      await login(selected.username, pin);
      const role = (selected as any).role;
      navigate(role === 'admin' ? '/admin' : '/lobby', { replace: true });
    } catch {
      setError('Wrong PIN. Try again.');
      setPin('');
      setShake(true);
      setTimeout(() => setShake(false), 500);
    } finally {
      setLoading(false);
    }
  };

  const closeModal = () => {
    if (!loading) { setSelected(null); setPin(''); setError(''); }
  };

  return (
    <div style={{
      minHeight: '100dvh', background: '#060b14',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center',
    }}>
      {/* Header */}
      <div style={{ textAlign: 'center', padding: 'clamp(24px, 5vh, 48px) 16px 24px', width: '100%' }}>
        <div style={{ fontSize: 22, color: '#00f0ff', letterSpacing: 8, marginBottom: 8 }}>♠ ♥ ♦ ♣</div>
        <div style={{ fontSize: 'clamp(28px, 5vw, 48px)', fontWeight: 900, color: '#ffb800', letterSpacing: 6 }}>CHULLZ</div>
        <div style={{ fontSize: 14, color: '#64748b', marginTop: 6 }}>Select your profile to enter</div>
      </div>

      {/* Profile Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
        gap: 16,
        padding: '0 clamp(16px, 5vw, 48px) 48px',
        width: '100%',
        maxWidth: 900,
        boxSizing: 'border-box',
      }}>
        {PROFILES.map(p => (
          <button
            key={p.username}
            onClick={() => handleSelectProfile(p)}
            style={{
              background: '#0a0f1a',
              border: '1px solid #1e293b',
              borderRadius: 20,
              padding: 'clamp(16px, 3vh, 28px) 16px',
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', gap: 10,
              cursor: 'pointer',
              transition: 'transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease',
              WebkitTapHighlightColor: 'transparent',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = p.color;
              e.currentTarget.style.transform = 'translateY(-3px)';
              e.currentTarget.style.boxShadow = `0 8px 24px ${p.color}20`;
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = '#1e293b';
              e.currentTarget.style.transform = 'none';
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            <div style={{
              width: 80, height: 80, borderRadius: '50%',
              border: `2.5px solid ${p.color}`,
              padding: 4,
            }}>
              <div style={{
                width: '100%', height: '100%', borderRadius: '50%',
                background: p.color + '30',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <span style={{ fontSize: 38 }}>{p.avatar}</span>
              </div>
            </div>
            <span style={{ fontSize: 15, fontWeight: 800, color: '#ffffff' }}>{p.username}</span>
            {(p as any).role === 'admin' ? (
              <span style={{
                fontSize: 10, color: '#a78bfa', fontWeight: 700,
                background: '#7c3aed22', border: '1px solid #7c3aed',
                borderRadius: 8, padding: '2px 10px', letterSpacing: 1.5,
              }}>ADMIN</span>
            ) : (
              <span style={{ fontSize: 12, color: '#64748b' }}>10,000 🪙</span>
            )}
          </button>
        ))}
      </div>

      {/* PIN Modal */}
      {selected && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 100, padding: 24,
          }}
          onClick={e => e.target === e.currentTarget && closeModal()}
        >
          <div
            className={shake ? 'shake' : ''}
            style={{
              background: '#0a0f1a',
              border: '1px solid #00f0ff44',
              borderRadius: 28,
              padding: 'clamp(24px, 5vw, 36px)',
              display: 'flex', flexDirection: 'column',
              alignItems: 'center',
              width: '100%', maxWidth: 360,
              boxShadow: '0 0 60px #00f0ff18',
            }}
          >
            {/* Avatar */}
            <div style={{
              width: 96, height: 96, borderRadius: '50%',
              border: `2.5px solid ${selected.color}`,
              padding: 5, marginBottom: 12,
            }}>
              <div style={{
                width: '100%', height: '100%', borderRadius: '50%',
                background: selected.color + '30',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <span style={{ fontSize: 46 }}>{selected.avatar}</span>
              </div>
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#ffffff', marginBottom: 4 }}>
              {selected.username}
            </div>
            <div style={{ fontSize: 12, color: '#64748b', letterSpacing: 2, marginBottom: 16 }}>ENTER PIN</div>

            {/* PIN Dots */}
            <div style={{ display: 'flex', gap: 16, marginBottom: 8 }}>
              {[0,1,2,3].map(i => (
                <div key={i} style={{
                  width: 20, height: 20, borderRadius: '50%',
                  border: `2px solid ${pin.length > i ? '#00f0ff' : '#334155'}`,
                  background: pin.length > i ? '#00f0ff' : 'transparent',
                  transition: 'all 0.15s ease',
                }} />
              ))}
            </div>

            <div style={{ height: 20, marginBottom: 8, color: '#ef4444', fontSize: 13 }}>
              {error}
            </div>

            {loading ? (
              <div style={{ padding: '32px 0', color: '#00f0ff', fontSize: 32, textAlign: 'center' }}>⟳</div>
            ) : (
              <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(3, 76px)',
                gap: 8, marginBottom: 18,
              }}>
                {['1','2','3','4','5','6','7','8','9','⌫','0','✓'].map((n) => (
                  <button
                    key={n}
                    onClick={() => {
                      if (n === '⌫') handleDelete();
                      else if (n === '✓') handleLogin();
                      else handleNum(n);
                    }}
                    style={{
                      height: 60, borderRadius: 14,
                      background: n === '✓' ? '#00f0ff' : '#131a2a',
                      border: 'none',
                      color: n === '✓' ? '#0a0f1a' : '#ffffff',
                      fontSize: 22, fontWeight: n === '✓' ? 900 : 700,
                      cursor: 'pointer',
                      transition: 'transform 0.1s ease, background 0.1s ease',
                    }}
                    onMouseDown={e => (e.currentTarget.style.transform = 'scale(0.92)')}
                    onMouseUp={e => (e.currentTarget.style.transform = 'scale(1)')}
                    onTouchStart={e => (e.currentTarget.style.transform = 'scale(0.92)')}
                    onTouchEnd={e => (e.currentTarget.style.transform = 'scale(1)')}
                  >
                    {n}
                  </button>
                ))}
              </div>
            )}

            <button
              onClick={closeModal}
              style={{ background: 'none', border: 'none', color: '#64748b', fontSize: 14, cursor: 'pointer', padding: '8px 24px' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
