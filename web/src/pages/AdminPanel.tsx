import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

interface Player {
  id: string; username: string; avatar: string;
  avatar_color: string; role: string; chips: number; online: boolean;
}

export default function AdminPanel() {
  const { user, token } = useAuth();
  const navigate = useNavigate();
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [giving, setGiving] = useState<string | null>(null);
  const [customAmounts, setCustomAmounts] = useState<Record<string, number>>({});
  const [feedback, setFeedback] = useState<Record<string, string>>({});

  const QUICK_AMOUNTS = [500, 1000, 5000, 10000];

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/players', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) setPlayers(await res.json());
    } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  // Redirect non-admins
  if (!user) return null;
  if (user.role !== 'admin') {
    navigate('/lobby');
    return null;
  }

  const giveChips = async (uid: string, amount: number) => {
    if (!token || amount <= 0) return;
    setGiving(uid);
    try {
      const res = await fetch(`/api/admin/players/${uid}/give-chips`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ amount }),
      });
      if (res.ok) {
        const data = await res.json();
        setFeedback(prev => ({ ...prev, [uid]: `+${amount.toLocaleString()} 🪙 → ${data.new_bankroll.toLocaleString()}` }));
        setPlayers(prev => prev.map(p => p.id === uid ? { ...p, chips: data.new_bankroll } : p));
        setTimeout(() => setFeedback(prev => { const n = { ...prev }; delete n[uid]; return n; }), 2500);
      }
    } finally { setGiving(null); }
  };

  return (
    <div style={{ height: '100dvh', background: '#060b14', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <header style={{
        background: '#0a0f1a', borderBottom: '1px solid #1e293b',
        padding: '0 clamp(16px,4vw,40px)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        height: 64, flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button onClick={() => navigate('/lobby')} style={{
            background: 'none', border: 'none', color: '#64748b', fontSize: 22, cursor: 'pointer',
          }}>←</button>
          <div>
            <div style={{ fontSize: 16, fontWeight: 900, color: '#fff', letterSpacing: 1 }}>ADMIN PANEL</div>
            <div style={{ fontSize: 10, color: '#7c3aed', letterSpacing: 2 }}>CHIP MANAGER</div>
          </div>
        </div>
        <button onClick={load} style={{
          background: '#1e293b', border: 'none', borderRadius: 10,
          padding: '8px 16px', fontSize: 12, color: '#64748b', cursor: 'pointer', fontWeight: 700,
        }}>↻ Refresh</button>
      </header>

      {/* Summary */}
      <div style={{
        background: '#0a0f1a', borderBottom: '1px solid #1e293b',
        padding: '12px clamp(16px,4vw,40px)', display: 'flex', gap: 24,
      }}>
        <div>
          <div style={{ fontSize: 10, color: '#475569', fontWeight: 700, letterSpacing: 1 }}>PLAYERS</div>
          <div style={{ fontSize: 20, fontWeight: 900, color: '#fff' }}>{players.length}</div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: '#475569', fontWeight: 700, letterSpacing: 1 }}>ONLINE</div>
          <div style={{ fontSize: 20, fontWeight: 900, color: '#22c55e' }}>{players.filter(p => p.online).length}</div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: '#475569', fontWeight: 700, letterSpacing: 1 }}>TOTAL BANKROLL</div>
          <div style={{ fontSize: 20, fontWeight: 900, color: '#ffb800' }}>
            {players.reduce((s, p) => s + p.chips, 0).toLocaleString()} 🪙
          </div>
        </div>
      </div>

      {/* Player list */}
      <main style={{
        flex: 1, overflowY: 'auto',
        padding: 'clamp(16px,3vw,24px) clamp(16px,4vw,40px)',
        maxWidth: 800, margin: '0 auto', width: '100%', boxSizing: 'border-box',
      }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 64, color: '#00f0ff', fontSize: 28 }}>⟳</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {players.sort((a, b) => (b.online ? 1 : 0) - (a.online ? 1 : 0) || b.chips - a.chips).map(p => (
              <div
                key={p.id}
                data-testid={`admin-player-${p.id}`}
                style={{
                  background: '#0a0f1a', border: '1px solid #1e293b',
                  borderRadius: 14, padding: '14px 16px',
                  opacity: giving === p.id ? 0.7 : 1,
                  transition: 'opacity 0.2s',
                }}
              >
                {/* Player info row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                  <div style={{
                    width: 42, height: 42, borderRadius: '50%', flexShrink: 0,
                    border: `2px solid ${p.avatar_color}`,
                    background: p.avatar_color + '25',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    position: 'relative',
                  }}>
                    <span style={{ fontSize: 22 }}>{p.avatar}</span>
                    <div style={{
                      position: 'absolute', bottom: 1, right: 1,
                      width: 9, height: 9, borderRadius: '50%',
                      background: p.online ? '#22c55e' : '#475569',
                      border: '2px solid #0a0f1a',
                    }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{p.username}</span>
                      {p.role === 'admin' && (
                        <span style={{
                          fontSize: 9, fontWeight: 900, background: '#7c3aed20',
                          color: '#7c3aed', border: '1px solid #7c3aed40',
                          borderRadius: 4, padding: '1px 6px',
                        }}>ADMIN</span>
                      )}
                      <span style={{
                        fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 4,
                        background: p.online ? '#22c55e18' : '#1e293b',
                        color: p.online ? '#22c55e' : '#475569',
                        border: `1px solid ${p.online ? '#22c55e40' : '#334155'}`,
                      }}>{p.online ? 'online' : 'offline'}</span>
                    </div>
                    <div style={{ fontSize: 13, color: '#ffb800', fontWeight: 700, marginTop: 2 }}>
                      Bankroll: {p.chips.toLocaleString()} 🪙
                    </div>
                  </div>
                  {feedback[p.id] && (
                    <div style={{
                      fontSize: 12, fontWeight: 900, color: '#22c55e',
                      background: '#22c55e15', border: '1px solid #22c55e40',
                      borderRadius: 8, padding: '4px 10px', animation: 'fadeIn 0.2s',
                    }}>{feedback[p.id]}</div>
                  )}
                </div>

                {/* Give chips row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 10, color: '#475569', fontWeight: 700, marginRight: 2 }}>GIVE:</span>
                  {QUICK_AMOUNTS.map(amt => (
                    <button
                      key={amt}
                      onClick={() => giveChips(p.id, amt)}
                      disabled={giving === p.id}
                      data-testid={`give-${amt}-to-${p.id}`}
                      style={{
                        padding: '5px 10px', borderRadius: 8, fontSize: 11, fontWeight: 800,
                        background: '#22c55e18', border: '1px solid #22c55e50',
                        color: '#22c55e', cursor: 'pointer',
                      }}
                    >+{amt >= 1000 ? `${amt/1000}K` : amt}</button>
                  ))}
                  <div style={{ display: 'flex', gap: 4, flex: 1, minWidth: 120 }}>
                    <input
                      type="number"
                      placeholder="Custom"
                      value={customAmounts[p.id] || ''}
                      onChange={e => setCustomAmounts(prev => ({ ...prev, [p.id]: Number(e.target.value) }))}
                      style={{
                        flex: 1, padding: '5px 8px', borderRadius: 8, fontSize: 11,
                        background: '#131a2a', border: '1px solid #334155', color: '#fff',
                        minWidth: 70,
                      }}
                    />
                    <button
                      onClick={() => { if (customAmounts[p.id] > 0) giveChips(p.id, customAmounts[p.id]); }}
                      disabled={!customAmounts[p.id] || customAmounts[p.id] <= 0 || giving === p.id}
                      style={{
                        padding: '5px 10px', borderRadius: 8, fontSize: 11, fontWeight: 800,
                        background: customAmounts[p.id] > 0 ? '#22c55e' : '#1e293b',
                        border: 'none', color: customAmounts[p.id] > 0 ? '#0a0f1a' : '#475569',
                        cursor: customAmounts[p.id] > 0 ? 'pointer' : 'default',
                      }}
                    >Send</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
