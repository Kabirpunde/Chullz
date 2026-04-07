import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

interface TableInfo {
  table_id: string; name: string; status: string;
  blind_small: number; blind_big: number;
  max_players: number; starting_chips: number;
  player_count: number;
  players: { username: string; avatar: string; avatar_color: string }[];
}

interface Player {
  id: string; username: string; avatar: string;
  avatar_color: string; role: string; chips: number; online: boolean;
}

export default function Lobby() {
  const { user, token, logout } = useAuth();
  const navigate = useNavigate();

  const [tables, setTables] = useState<TableInfo[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [onlineIds, setOnlineIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [tableName, setTableName] = useState('');
  const [creating, setCreating] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      const [pr, tr] = await Promise.all([
        fetch('/api/players'),
        fetch('/api/tables'),
      ]);
      if (pr.ok) setPlayers(await pr.json());
      if (tr.ok) setTables(await tr.json());
    } catch (e) {
      console.log('Fetch error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/api/ws/${user.id}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;
    ws.onmessage = e => {
      try {
        const d = JSON.parse(e.data);
        if (d.type === 'presence') setOnlineIds(d.online_users);
      } catch {}
    };
    ws.onerror = () => {};

    fetchAll();
    intervalRef.current = setInterval(fetchAll, 5000);
    return () => {
      ws.close();
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [user?.id, fetchAll]);

  const createTable = async () => {
    if (!tableName.trim() || !token) return;
    setCreating(true);
    try {
      const cr = await fetch('/api/tables/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: tableName.trim(), blind_small: 25, blind_big: 50, starting_chips: 5000, max_players: 6 }),
      });
      if (!cr.ok) throw new Error();
      const { table_id } = await cr.json();

      const jr = await fetch('/api/tables/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ table_id }),
      });
      if (!jr.ok) throw new Error();
      setShowCreate(false);
      setTableName('');
      navigate(`/table/${table_id}?host=true`);
    } catch (e) {
      console.error('Create error:', e);
    } finally {
      setCreating(false);
    }
  };

  const joinTable = async (tableId: string) => {
    if (!token || joining) return;
    setJoining(tableId);
    try {
      const res = await fetch('/api/tables/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ table_id: tableId }),
      });
      if (!res.ok) throw new Error();
      navigate(`/table/${tableId}`);
    } catch (e) {
      console.error('Join error:', e);
    } finally {
      setJoining(null);
    }
  };

  const allPlayers = players.filter(p => p.role === 'player');
  const enriched = allPlayers.map(p => ({ ...p, online: onlineIds.includes(p.id) || p.online }));

  if (!user) return null;

  return (
    <div className="screen" style={{ background: '#0a0f1a' }}>
      {/* Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '12px 16px', borderBottom: '1px solid #1e293b',
        background: '#0a0f1a', flexShrink: 0,
      }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 900, color: '#00f0ff', letterSpacing: 2 }}>♠ CHULLZ</div>
          <div style={{ fontSize: 11, color: '#475569', letterSpacing: 1 }}>Multiplayer Lobby</div>
        </div>
        <button
          onClick={() => {}}
          style={{
            display: 'flex', alignItems: 'center', gap: 10,
            background: 'none', border: 'none', cursor: 'pointer', padding: 0,
          }}
        >
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2,
          }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#ffffff' }}>{user.username}</span>
            <span style={{ fontSize: 11, color: '#ffb800', fontWeight: 600 }}>🪙 {user.chips.toLocaleString()}</span>
          </div>
          <div style={{
            width: 42, height: 42, borderRadius: '50%',
            border: `2px solid ${user.avatar_color}`,
            background: user.avatar_color + '30',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{ fontSize: 20 }}>{user.avatar}</span>
          </div>
        </button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 0 80px' }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
            <div style={{ color: '#00f0ff', fontSize: 32 }}>⟳</div>
          </div>
        ) : (
          <>
            {/* Online players */}
            <div style={{ padding: '16px 16px 0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <span style={{ fontSize: 15, fontWeight: 800, color: '#ffffff' }}>Online Players</span>
                <span style={{
                  fontSize: 11, color: '#22c55e', fontWeight: 700,
                  background: '#22c55e20', borderRadius: 12, padding: '3px 10px',
                }}>
                  ● {enriched.filter(p => p.online).length} online
                </span>
              </div>
              <div style={{ display: 'flex', gap: 16, overflowX: 'auto', paddingBottom: 8 }}>
                {enriched.map(p => (
                  <div key={p.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 60, gap: 4 }}>
                    <div style={{
                      width: 52, height: 52, borderRadius: '50%',
                      border: `2px solid ${p.avatar_color}`,
                      background: p.avatar_color + '25',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      position: 'relative',
                    }}>
                      <span style={{ fontSize: 24 }}>{p.avatar}</span>
                      <div style={{
                        position: 'absolute', bottom: 1, right: 1,
                        width: 11, height: 11, borderRadius: '50%',
                        background: p.online ? '#22c55e' : '#475569',
                        border: '2px solid #0a0f1a',
                      }} />
                    </div>
                    <span style={{ fontSize: 10, color: '#94a3b8', textAlign: 'center', fontWeight: 600, maxWidth: 60, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.username}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Tables */}
            <div style={{ padding: '20px 16px 0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <span style={{ fontSize: 15, fontWeight: 800, color: '#ffffff' }}>Tables</span>
                <span style={{
                  fontSize: 11, color: '#3b82f6', fontWeight: 700,
                  background: '#3b82f620', borderRadius: 12, padding: '3px 10px',
                }}>
                  {tables.length} active
                </span>
              </div>

              {tables.length === 0 ? (
                <div style={{
                  background: '#131a2a', borderRadius: 16,
                  border: '1px dashed #1e293b',
                  padding: 36, textAlign: 'center',
                }}>
                  <div style={{ fontSize: 36, marginBottom: 8 }}>🃏</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#ffffff', marginBottom: 4 }}>No active tables</div>
                  <div style={{ fontSize: 12, color: '#475569' }}>Create one to start playing</div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {tables.map(t => {
                    const isFull = t.player_count >= t.max_players;
                    const isPlaying = t.status === 'playing';
                    const canJoin = !isFull && !isPlaying;
                    return (
                      <div key={t.table_id} style={{
                        background: '#131a2a', borderRadius: 16,
                        border: '1px solid #1e293b',
                        padding: 14,
                        display: 'flex', alignItems: 'center', gap: 12,
                      }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                            <span style={{ fontSize: 15, fontWeight: 800, color: '#ffffff', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {t.name}
                            </span>
                            <span style={{
                              fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 8,
                              background: isPlaying ? '#ef444420' : '#22c55e20',
                              border: `1px solid ${isPlaying ? '#ef4444' : '#22c55e'}`,
                              color: isPlaying ? '#ef4444' : '#22c55e',
                              whiteSpace: 'nowrap',
                            }}>
                              {isPlaying ? 'Playing' : 'Waiting'}
                            </span>
                          </div>
                          <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>
                            Blinds {t.blind_small}/{t.blind_big} · {t.player_count}/{t.max_players} players · 🪙 {t.starting_chips.toLocaleString()} start
                          </div>
                          <div style={{ display: 'flex', gap: 2 }}>
                            {t.players.slice(0,4).map((p,i) => (
                              <span key={i} style={{ fontSize: 14 }}>{p.avatar}</span>
                            ))}
                            {t.player_count > 4 && <span style={{ fontSize: 11, color: '#475569' }}>+{t.player_count - 4}</span>}
                          </div>
                        </div>
                        <button
                          onClick={() => canJoin && joinTable(t.table_id)}
                          disabled={!canJoin || joining === t.table_id}
                          style={{
                            background: canJoin ? '#00f0ff' : '#1e293b',
                            border: 'none', borderRadius: 12,
                            padding: '10px 18px', minWidth: 60,
                            fontSize: 13, fontWeight: 900,
                            color: canJoin ? '#0a0f1a' : '#475569',
                            cursor: canJoin ? 'pointer' : 'default',
                            flexShrink: 0,
                            transition: 'opacity 0.15s',
                          }}
                        >
                          {joining === t.table_id ? '...' : isFull ? 'Full' : isPlaying ? 'In Game' : 'Join'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Logout */}
            <div style={{ padding: '20px 16px 0' }}>
              <button
                onClick={logout}
                style={{
                  width: '100%', background: 'none', border: '1px solid #1e293b',
                  borderRadius: 14, padding: '12px', fontSize: 13, color: '#475569',
                  cursor: 'pointer', fontWeight: 700,
                }}
              >
                Sign Out
              </button>
            </div>
          </>
        )}
      </div>

      {/* Bottom Bar */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        padding: '12px 16px',
        paddingBottom: 'max(12px, env(safe-area-inset-bottom))',
        background: '#0a0f1a', borderTop: '1px solid #1e293b',
      }}>
        <button
          onClick={() => setShowCreate(true)}
          style={{
            width: '100%', background: '#00f0ff', border: 'none',
            borderRadius: 14, padding: '15px', fontSize: 15,
            fontWeight: 900, color: '#0a0f1a', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}
        >
          + Create Table
        </button>
      </div>

      {/* Create Table Modal */}
      {showCreate && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
          zIndex: 100,
        }}
          onClick={e => e.target === e.currentTarget && setShowCreate(false)}
        >
          <div style={{
            background: '#0a0f1a', border: '1px solid #1e293b',
            borderTopLeftRadius: 24, borderTopRightRadius: 24,
            width: '100%', maxWidth: 480, paddingBottom: 32,
          }}>
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '18px 20px', borderBottom: '1px solid #1e293b',
            }}>
              <span style={{ fontSize: 18, fontWeight: 900, color: '#ffffff' }}>🃏 Create Table</span>
              <button onClick={() => setShowCreate(false)} style={{ background: 'none', border: 'none', color: '#64748b', fontSize: 18, cursor: 'pointer' }}>✕</button>
            </div>
            <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ fontSize: 11, color: '#64748b', fontWeight: 700, letterSpacing: 1, display: 'block', marginBottom: 8 }}>TABLE NAME</label>
                <input
                  type="text"
                  value={tableName}
                  onChange={e => setTableName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && createTable()}
                  placeholder="e.g. Friday Night Chullz"
                  autoFocus
                  maxLength={40}
                  style={{
                    width: '100%', background: '#131a2a', border: '1px solid #1e293b',
                    borderRadius: 12, padding: '14px 16px',
                    color: '#ffffff', fontSize: 16, fontWeight: 600,
                    outline: 'none', boxSizing: 'border-box',
                  }}
                />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {[
                  { label: 'Blinds', value: '25 / 50' },
                  { label: 'Starting', value: '🪙 5,000' },
                  { label: 'Max Players', value: '6' },
                ].map(chip => (
                  <div key={chip.label} style={{
                    flex: 1, background: '#131a2a', borderRadius: 12,
                    border: '1px solid #1e293b', padding: 10, textAlign: 'center',
                  }}>
                    <div style={{ fontSize: 9, color: '#475569', fontWeight: 700, letterSpacing: 1, marginBottom: 4 }}>{chip.label}</div>
                    <div style={{ fontSize: 13, color: '#ffffff', fontWeight: 800 }}>{chip.value}</div>
                  </div>
                ))}
              </div>
              <button
                onClick={createTable}
                disabled={!tableName.trim() || creating}
                style={{
                  background: tableName.trim() && !creating ? '#00f0ff' : '#1e293b',
                  border: tableName.trim() && !creating ? 'none' : '1px solid #334155',
                  borderRadius: 14, padding: '16px',
                  fontSize: 15, fontWeight: 900,
                  color: tableName.trim() && !creating ? '#0a0f1a' : '#475569',
                  cursor: tableName.trim() && !creating ? 'pointer' : 'default',
                }}
              >
                {creating ? 'Creating...' : 'Create & Join Table'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
