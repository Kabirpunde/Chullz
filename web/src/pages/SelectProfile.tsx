import React, { useState, useEffect } from 'react';
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

export default function SelectProfile() {
  const { loginQuick } = useAuth();
  const navigate = useNavigate();
  const [onlineUsernames, setOnlineUsernames] = useState<Set<string>>(new Set());
  const [loggingIn, setLoggingIn] = useState<string | null>(null);
  const [error, setError] = useState('');

  // Poll online users every 4 seconds so "in use" status stays fresh
  useEffect(() => {
    let cancelled = false;
    const fetchOnline = async () => {
      try {
        const res = await fetch('/api/players');
        if (!res.ok || cancelled) return;
        const players: { username: string; online: boolean }[] = await res.json();
        if (!cancelled) {
          setOnlineUsernames(new Set(players.filter(p => p.online).map(p => p.username)));
        }
      } catch {}
    };
    fetchOnline();
    const iv = setInterval(fetchOnline, 4000);
    return () => { cancelled = true; clearInterval(iv); };
  }, []);

  const handleSelect = async (username: string, role?: string) => {
    if (loggingIn || onlineUsernames.has(username)) return;
    setLoggingIn(username);
    setError('');
    try {
      await loginQuick(username);
      navigate(role === 'admin' ? '/admin' : '/lobby', { replace: true });
    } catch {
      setError('Could not sign in. Try again.');
      setLoggingIn(null);
    }
  };

  return (
    <div style={{
      minHeight: '100dvh', background: '#060b14',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
    }}>
      {/* Header */}
      <div style={{ textAlign: 'center', padding: 'clamp(24px, 5vh, 48px) 16px 24px', width: '100%' }}>
        <div style={{ fontSize: 22, color: '#00f0ff', letterSpacing: 8, marginBottom: 8 }}>♠ ♥ ♦ ♣</div>
        <div style={{ fontSize: 'clamp(28px, 5vw, 48px)', fontWeight: 900, color: '#ffb800', letterSpacing: 6 }}>CHULLZ</div>
        <div style={{ fontSize: 14, color: '#64748b', marginTop: 6 }}>Tap your profile to enter</div>
        {error && <div style={{ fontSize: 13, color: '#ef4444', marginTop: 8 }}>{error}</div>}
      </div>

      {/* Profile Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
        gap: 16,
        padding: '0 clamp(16px, 5vw, 48px) 48px',
        width: '100%', maxWidth: 900, boxSizing: 'border-box',
      }}>
        {PROFILES.map(p => {
          const inUse = onlineUsernames.has(p.username);
          const isLoading = loggingIn === p.username;
          const disabled = inUse || !!loggingIn;

          return (
            <button
              key={p.username}
              data-testid={`profile-${p.username}`}
              onClick={() => handleSelect(p.username, (p as any).role)}
              disabled={disabled}
              style={{
                background: inUse ? '#0a0f1a60' : '#0a0f1a',
                border: `1px solid ${inUse ? '#1e293b40' : '#1e293b'}`,
                borderRadius: 20,
                padding: 'clamp(16px, 3vh, 28px) 16px',
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', gap: 10,
                cursor: disabled ? 'default' : 'pointer',
                opacity: inUse ? 0.45 : isLoading ? 0.7 : 1,
                transition: 'transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease, opacity 0.2s',
                WebkitTapHighlightColor: 'transparent',
                position: 'relative',
              }}
              onMouseEnter={e => {
                if (disabled) return;
                e.currentTarget.style.borderColor = p.color;
                e.currentTarget.style.transform = 'translateY(-3px)';
                e.currentTarget.style.boxShadow = `0 8px 24px ${p.color}20`;
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = inUse ? '#1e293b40' : '#1e293b';
                e.currentTarget.style.transform = 'none';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              {/* Avatar */}
              <div style={{
                width: 80, height: 80, borderRadius: '50%',
                border: `2.5px solid ${inUse ? '#334155' : p.color}`,
                padding: 4, position: 'relative',
              }}>
                <div style={{
                  width: '100%', height: '100%', borderRadius: '50%',
                  background: (inUse ? '#334155' : p.color) + '30',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <span style={{ fontSize: 38 }}>{isLoading ? '⟳' : p.avatar}</span>
                </div>
                {/* Online / in-use dot */}
                {inUse && (
                  <div style={{
                    position: 'absolute', bottom: 2, right: 2,
                    width: 14, height: 14, borderRadius: '50%',
                    background: '#22c55e', border: '2px solid #060b14',
                  }} />
                )}
              </div>

              <span style={{
                fontSize: 15, fontWeight: 800,
                color: inUse ? '#475569' : '#ffffff',
              }}>{p.username}</span>

              {/* Status badge */}
              {inUse ? (
                <span style={{
                  fontSize: 10, color: '#22c55e', fontWeight: 700,
                  background: '#22c55e18', border: '1px solid #22c55e40',
                  borderRadius: 8, padding: '2px 10px', letterSpacing: 1.5,
                }}>IN USE</span>
              ) : isLoading ? (
                <span style={{
                  fontSize: 10, color: '#00f0ff', fontWeight: 700,
                  background: '#00f0ff18', border: '1px solid #00f0ff40',
                  borderRadius: 8, padding: '2px 10px', letterSpacing: 1.5,
                }}>SIGNING IN…</span>
              ) : (p as any).role === 'admin' ? (
                <span style={{
                  fontSize: 10, color: '#a78bfa', fontWeight: 700,
                  background: '#7c3aed22', border: '1px solid #7c3aed',
                  borderRadius: 8, padding: '2px 10px', letterSpacing: 1.5,
                }}>ADMIN</span>
              ) : (
                <span style={{ fontSize: 12, color: '#64748b' }}>tap to play</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
