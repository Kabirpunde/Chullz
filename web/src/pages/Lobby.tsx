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
  const [blindSmall, setBlindSmall] = useState(25);
  const [blindBig, setBlindBig] = useState(50);
  const [startChips, setStartChips] = useState(5000);
  const [maxPlayers, setMaxPlayers] = useState(6);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isAdmin = user?.role === 'admin';

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

  const deleteTable = async (tableId: string, tableName: string) => {
    if (!token || !isAdmin || deleting) return;
    if (!window.confirm(`Delete table "${tableName}"? This will kick all players.`)) return;
    setDeleting(tableId);
    try {
      const res = await fetch(`/api/tables/${tableId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      fetchAll(); // Refresh tables list
    } catch (e) {
      console.error('Delete error:', e);
    } finally {
      setDeleting(null);
    }
  };

  const [isDesktop, setIsDesktop] = React.useState(window.innerWidth >= 768);
  useEffect(() => {
    const onResize = () => setIsDesktop(window.innerWidth >= 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const allPlayers = players.filter(p => p.role === 'player');
  const enriched = allPlayers.map(p => ({ ...p, online: onlineIds.includes(p.id) || p.online }));
  const onlinePlayers = enriched.filter(p => p.online);

  if (!user) return null;

  return (
    <div style={{ minHeight: '100dvh', background: '#060b14', display: 'flex', flexDirection: 'column' }}>
      {/* ── TOP HEADER ── */}
      <header style={{
        background: '#0a0f1a',
        borderBottom: '1px solid #1e293b',
        padding: '0 clamp(16px, 4vw, 40px)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        height: 64, flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 26, fontWeight: 900, color: '#00f0ff', letterSpacing: 3 }}>♠ CHULLZ</span>
          <span style={{
            fontSize: 10, color: '#475569', letterSpacing: 2,
            background: '#1e293b', borderRadius: 8, padding: '3px 10px',
          }}>MULTIPLAYER LOBBY</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{user.username}</div>
            <div style={{ fontSize: 12, color: '#ffb800', fontWeight: 600 }}>🪙 {user.chips.toLocaleString()}</div>
          </div>
          <div style={{
            width: 44, height: 44, borderRadius: '50%',
            border: `2px solid ${user.avatar_color}`,
            background: user.avatar_color + '30',
            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
          }} onClick={logout} title="Sign Out">
            <span style={{ fontSize: 22 }}>{user.avatar}</span>
          </div>
        </div>
      </header>

      {/* ── MAIN CONTENT ── */}
      <main style={{
        flex: 1, display: 'flex', gap: 24,
        padding: isDesktop ? 'clamp(16px, 3vw, 32px) clamp(16px, 4vw, 40px)' : '16px',
        maxWidth: 1200, margin: '0 auto', width: '100%',
        boxSizing: 'border-box',
        flexDirection: isDesktop ? 'row' : 'column',
        alignItems: isDesktop ? 'flex-start' : 'stretch',
        overflowY: 'auto',
      }}>

        {/* LEFT COLUMN: Players sidebar */}
        <aside style={{
          width: isDesktop ? 'clamp(200px, 25%, 280px)' : '100%',
          flexShrink: 0,
          display: 'flex', flexDirection: 'column', gap: 16,
        }}>
          {/* Online now */}
          <div style={{
            background: '#0a0f1a', borderRadius: 16,
            border: '1px solid #1e293b', padding: 16,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: '#fff', letterSpacing: 0.5 }}>Players</span>
              <span style={{
                fontSize: 11, color: '#22c55e', fontWeight: 700,
                background: '#22c55e20', borderRadius: 10, padding: '2px 9px',
              }}>● {onlinePlayers.length} online</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {enriched.map(p => (
                <div key={p.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  opacity: p.online ? 1 : 0.5,
                }}>
                  <div style={{ position: 'relative', flexShrink: 0 }}>
                    <div style={{
                      width: 38, height: 38, borderRadius: '50%',
                      border: `2px solid ${p.avatar_color}`,
                      background: p.avatar_color + '25',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <span style={{ fontSize: 18 }}>{p.avatar}</span>
                    </div>
                    <div style={{
                      position: 'absolute', bottom: 0, right: 0,
                      width: 10, height: 10, borderRadius: '50%',
                      background: p.online ? '#22c55e' : '#475569',
                      border: '2px solid #0a0f1a',
                    }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {p.username}
                    </div>
                    <div style={{ fontSize: 11, color: '#ffb800' }}>🪙 {p.chips.toLocaleString()}</div>
                  </div>
                  {p.online && <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', flexShrink: 0 }} />}
                </div>
              ))}
            </div>
          </div>

          {/* Sign out */}
          <button
            onClick={logout}
            style={{
              background: 'none', border: '1px solid #1e293b',
              borderRadius: 12, padding: '11px',
              fontSize: 13, color: '#475569', cursor: 'pointer', fontWeight: 700,
              width: '100%',
            }}
          >Sign Out</button>
        </aside>

        {/* RIGHT COLUMN: Tables */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          {/* Section header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h2 style={{ margin: 0, fontSize: isDesktop ? 22 : 18, fontWeight: 900, color: '#fff' }}>Active Tables</h2>
              {isDesktop && <p style={{ margin: '4px 0 0', fontSize: 13, color: '#475569' }}>Join an existing table or create a new one</p>}
            </div>
            <button
              onClick={() => setShowCreate(true)}
              style={{
                background: '#00f0ff', border: 'none', borderRadius: 12,
                padding: '11px 20px', fontSize: 14, fontWeight: 900,
                color: '#0a0f1a', cursor: 'pointer', flexShrink: 0,
                display: 'flex', alignItems: 'center', gap: 8,
              }}
            >
              + Create Table
            </button>
          </div>

          {/* Tables grid */}
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
              <div style={{ color: '#00f0ff', fontSize: 32, animation: 'spin 1s linear infinite' }}>⟳</div>
            </div>
          ) : tables.length === 0 ? (
            <div style={{
              background: '#0a0f1a', borderRadius: 20,
              border: '2px dashed #1e293b',
              padding: '64px 32px', textAlign: 'center', flex: 1,
            }}>
              <div style={{ fontSize: 56, marginBottom: 16 }}>🃏</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#fff', marginBottom: 8 }}>No active tables</div>
              <div style={{ fontSize: 14, color: '#475569', marginBottom: 28 }}>Be the first to create a table and invite your friends!</div>
              <button
                onClick={() => setShowCreate(true)}
                style={{
                  background: '#00f0ff', border: 'none', borderRadius: 12,
                  padding: '14px 32px', fontSize: 15, fontWeight: 900,
                  color: '#0a0f1a', cursor: 'pointer',
                }}
              >+ Create Table</button>
            </div>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
              gap: 14,
            }}>
              {tables.map(t => {
                const isFull = t.player_count >= t.max_players;
                const isPlaying = t.status === 'playing';
                const isInTable = t.players.some(p => p.username === user?.username);
                const canJoin = !isFull && !isPlaying && !isInTable;
                return (
                  <div key={t.table_id} style={{
                    background: '#0a0f1a', borderRadius: 18,
                    border: `1px solid ${isInTable ? '#00f0ff30' : isPlaying ? '#3b82f630' : '#1e293b'}`,
                    padding: 20,
                    display: 'flex', flexDirection: 'column', gap: 12,
                    transition: 'border-color 0.2s',
                  }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = isInTable ? '#00f0ff60' : canJoin ? '#00f0ff40' : '#1e293b')}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = isInTable ? '#00f0ff30' : isPlaying ? '#3b82f630' : '#1e293b')}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <div style={{ fontSize: 17, fontWeight: 800, color: '#fff', marginBottom: 4 }}>{t.name}</div>
                        <div style={{ fontSize: 12, color: '#64748b' }}>
                          Blinds {t.blind_small}/{t.blind_big} · 🪙 {t.starting_chips.toLocaleString()} start
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{
                          fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 10,
                          background: isPlaying ? '#3b82f620' : '#22c55e20',
                          border: `1px solid ${isPlaying ? '#3b82f6' : '#22c55e'}`,
                          color: isPlaying ? '#3b82f6' : '#22c55e',
                          whiteSpace: 'nowrap', flexShrink: 0,
                        }}>
                          {isPlaying ? '▶ Playing' : '⏳ Waiting'}
                        </span>
                        {isAdmin && (
                          <button
                            onClick={(e) => { e.stopPropagation(); deleteTable(t.table_id, t.name); }}
                            disabled={deleting === t.table_id}
                            data-testid={`delete-table-${t.table_id}`}
                            title="Delete table"
                            style={{
                              background: '#ef444420',
                              border: '1px solid #ef4444',
                              borderRadius: 8,
                              padding: '4px 8px',
                              fontSize: 12,
                              color: '#ef4444',
                              cursor: deleting === t.table_id ? 'wait' : 'pointer',
                              opacity: deleting === t.table_id ? 0.5 : 1,
                            }}
                          >
                            {deleting === t.table_id ? '...' : '🗑'}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Players in table */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ display: 'flex', gap: -6 }}>
                        {t.players.slice(0, 5).map((p, i) => (
                          <div key={i} style={{
                            width: 28, height: 28, borderRadius: '50%',
                            border: `2px solid ${p.username === user?.username ? '#00f0ff' : '#0a0f1a'}`,
                            background: p.avatar_color + '40',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            marginLeft: i > 0 ? -8 : 0, zIndex: 5 - i,
                            position: 'relative',
                          }}>
                            <span style={{ fontSize: 14 }}>{p.avatar}</span>
                          </div>
                        ))}
                      </div>
                      <span style={{ fontSize: 12, color: '#64748b' }}>
                        {t.player_count}/{t.max_players} players
                      </span>
                      {isInTable && (
                        <span style={{ fontSize: 11, color: '#00f0ff', fontWeight: 700 }}>
                          You're in
                        </span>
                      )}
                      {!isInTable && !isFull && !isPlaying && (
                        <span style={{ fontSize: 11, color: '#22c55e' }}>
                          {t.max_players - t.player_count} seat{t.max_players - t.player_count !== 1 ? 's' : ''} open
                        </span>
                      )}
                    </div>

                    <button
                      onClick={() => isInTable ? navigate(`/table/${t.table_id}`) : canJoin ? joinTable(t.table_id) : null}
                      disabled={!isInTable && !canJoin || joining === t.table_id}
                      data-testid={`table-btn-${t.table_id}`}
                      style={{
                        background: isInTable ? '#00f0ff' : canJoin ? '#00f0ff' : '#131a2a',
                        border: isInTable || canJoin ? 'none' : '1px solid #334155',
                        borderRadius: 12, padding: '12px',
                        fontSize: 14, fontWeight: 900,
                        color: isInTable || canJoin ? '#0a0f1a' : '#475569',
                        cursor: isInTable || canJoin ? 'pointer' : 'default',
                        transition: 'opacity 0.15s',
                        width: '100%',
                      }}
                    >
                      {joining === t.table_id ? 'Joining...' : isInTable ? '↩ Return to Table' : isFull ? 'Table Full' : isPlaying ? 'Game In Progress' : 'Join Table →'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>

      {/* ── CREATE TABLE MODAL ── */}
      {showCreate && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.80)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 200, padding: 24,
        }}
          onClick={e => e.target === e.currentTarget && setShowCreate(false)}
        >
          <div style={{
            background: '#0a0f1a', border: '1px solid #1e293b',
            borderRadius: 24, width: '100%', maxWidth: 440,
            padding: 32,
            boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: '#fff' }}>🃏 Create Table</h3>
                <p style={{ margin: '4px 0 0', fontSize: 13, color: '#475569' }}>Set up a new game table</p>
              </div>
              <button onClick={() => setShowCreate(false)} style={{
                background: '#131a2a', border: 'none', width: 36, height: 36,
                borderRadius: '50%', color: '#94a3b8', fontSize: 18, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>✕</button>
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 12, color: '#64748b', fontWeight: 700, letterSpacing: 1, display: 'block', marginBottom: 8 }}>TABLE NAME</label>
              <input
                type="text"
                value={tableName}
                onChange={e => setTableName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && createTable()}
                placeholder="e.g. Friday Night Chullz"
                autoFocus
                maxLength={40}
                style={{
                  width: '100%', background: '#131a2a',
                  border: '1px solid #334155',
                  borderRadius: 12, padding: '14px 16px',
                  color: '#fff', fontSize: 16, fontWeight: 600,
                  outline: 'none', boxSizing: 'border-box',
                }}
                onFocus={e => e.target.style.borderColor = '#00f0ff'}
                onBlur={e => e.target.style.borderColor = '#334155'}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 24 }}>
              {[
                { label: 'BLINDS', value: '25 / 50' },
                { label: 'START CHIPS', value: '🪙 5,000' },
                { label: 'MAX PLAYERS', value: '6' },
              ].map(chip => (
                <div key={chip.label} style={{
                  background: '#131a2a', borderRadius: 12,
                  border: '1px solid #1e293b', padding: '12px 8px', textAlign: 'center',
                }}>
                  <div style={{ fontSize: 9, color: '#475569', fontWeight: 700, letterSpacing: 1, marginBottom: 4 }}>{chip.label}</div>
                  <div style={{ fontSize: 13, color: '#fff', fontWeight: 800 }}>{chip.value}</div>
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
                fontSize: 15, fontWeight: 900, width: '100%',
                color: tableName.trim() && !creating ? '#0a0f1a' : '#475569',
                cursor: tableName.trim() && !creating ? 'pointer' : 'default',
              }}
            >
              {creating ? 'Creating...' : '✓ Create & Join Table'}
            </button>
          </div>
        </div>
      )}

      {/* Mobile: bottom create button */}
      <div style={{
        display: 'none',
      }} className="mobile-create-bar">
        <button
          onClick={() => setShowCreate(true)}
          style={{
            width: '100%', background: '#00f0ff', border: 'none',
            borderRadius: 14, padding: '15px', fontSize: 15,
            fontWeight: 900, color: '#0a0f1a', cursor: 'pointer',
          }}
        >
          + Create Table
        </button>
      </div>
    </div>
  );
}
