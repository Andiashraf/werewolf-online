import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Moon, Shuffle, Plus, X, Scale, PawPrint, Crown, Ghost, Eye, EyeOff, Shield,
  FlaskConical, Target, Heart, User, Users, Sunrise, MessageCircle, Trophy,
  Play, Pause, Lock, Trash2, Copy, Check, LogIn, DoorOpen, LogOut
} from 'lucide-react';
import { socket, saveSession, loadSession, clearSession, emitAck } from './socket.js';
import VoiceChat from './VoiceChat.jsx';
import OpeningAnimation from './OpeningAnimation.jsx';

const ROLE_ICONS = {
  werewolf_biasa: PawPrint, alpha_wolf: Crown, joker: Ghost, seer: Eye, guard: Shield,
  witch: FlaskConical, hunter: Target, cupid: Heart, villager: User,
};
const NIGHT_TURN_META = {
  cupid: { label: 'Cupid', icon: Heart }, seer: { label: 'Seer', icon: Eye },
  guard: { label: 'Guard', icon: Shield }, werewolf: { label: 'Werewolf', icon: PawPrint },
  witch: { label: 'Witch', icon: FlaskConical },
};
const PHASE_META = {
  reveal: { label: 'Pembagian Peran', icon: Eye }, night: { label: 'Malam', icon: Moon },
  resolution: { label: 'Malam', icon: Moon }, morning: { label: 'Pagi', icon: Sunrise },
  discussion: { label: 'Diskusi', icon: MessageCircle }, voting: { label: 'Voting', icon: Scale },
  game_over: { label: 'Selesai', icon: Trophy },
};
const ROLE_LABEL_ID = {
  werewolf_biasa: 'Werewolf Biasa', alpha_wolf: 'Alpha Wolf', joker: 'Joker / Fool', seer: 'Seer',
  guard: 'Guard', witch: 'Witch', hunter: 'Hunter', cupid: 'Cupid', villager: 'Villager',
};
const TEAM_LABEL = { werewolf: 'Werewolf', netral: 'Netral', warga: 'Warga' };
const DEFAULT_ROLE_CONFIG = {
  werewolf_biasa: 2, alpha_wolf: 1, joker: 1, seer: 1, guard: 1, witch: 1, hunter: 1, cupid: 1, villager: 8,
};

// ============================================================================
// LOBBY — create or join a room
// ============================================================================

function LobbyScreen({ onJoined }) {
  const [mode, setMode] = useState(null); // null | 'create' | 'join'
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleCreate() {
    setBusy(true); setError('');
    const res = await emitAck('create_room', {});
    setBusy(false);
    if (!res.ok) { setError(res.error || 'Gagal membuat room.'); return; }
    saveSession(res.code, res.token);
    onJoined(res.view);
  }

  async function handleJoin() {
    if (!code.trim() || !name.trim()) return;
    setBusy(true); setError('');
    const res = await emitAck('join_room', { code: code.trim().toUpperCase(), name: name.trim() });
    setBusy(false);
    if (!res.ok) { setError(res.error || 'Gagal join room.'); return; }
    saveSession(res.code, res.token);
    onJoined(res.view);
  }

  return (
    <div className="mw-lobby-premium fade-up-hero">
      <div className="mw-lobby-left">
        <div className="mw-eyebrow-pill">ONLINE MULTIPLAYER</div>
        <h1 className="mw-title-huge">Malam<br/>Serigala</h1>
        <p className="mw-subtitle-elegant">Experience the ultimate game of deception, trust, and betrayal. Will you survive the night?</p>
      </div>

      <div className="mw-lobby-right stagger-fade-up">
        {!mode && (
          <div className="mw-lobby-cards-stack">
            <div className="mw-glass-card hover-magnetic group" onClick={() => setMode('create')}>
              <div className="mw-glass-inner">
                <div className="mw-card-content">
                  <div className="mw-card-icon-wrap"><DoorOpen size={24} strokeWidth={1.5} /></div>
                  <div className="mw-card-text">
                    <p className="mw-card-title">Buat Room</p>
                    <p className="mw-card-desc">Jadi Pemandu, atur peran & jalan cerita.</p>
                  </div>
                  <div className="mw-card-arrow-wrap">
                    <div className="mw-card-arrow">↗</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="mw-glass-card hover-magnetic group" onClick={() => setMode('join')}>
              <div className="mw-glass-inner">
                <div className="mw-card-content">
                  <div className="mw-card-icon-wrap"><LogIn size={24} strokeWidth={1.5} /></div>
                  <div className="mw-card-text">
                    <p className="mw-card-title">Join Room</p>
                    <p className="mw-card-desc">Masukkan kode dari Pemandu untuk main.</p>
                  </div>
                  <div className="mw-card-arrow-wrap">
                    <div className="mw-card-arrow">↗</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {mode === 'create' && (
          <div className="mw-glass-panel">
            <div className="mw-glass-inner">
              <p className="mw-eyebrow-pill">BUAT ROOM</p>
              <p className="mw-lobby-text-premium">Kamu akan bertindak sebagai Pemandu (Moderator). Siapkan strategi terbaik untuk pemainmu.</p>
              
              <button type="button" className="mw-btn-premium group" disabled={busy} onClick={handleCreate}>
                <span className="mw-btn-text">{busy ? 'Membangkitkan...' : 'Mulai Sesi Baru'}</span>
                <div className="mw-btn-arrow-wrap">
                  <div className="mw-btn-arrow">↗</div>
                </div>
              </button>
              <button type="button" className="mw-link-btn-premium" onClick={() => setMode(null)}>Batal</button>
            </div>
          </div>
        )}

        {mode === 'join' && (
          <div className="mw-glass-panel">
            <div className="mw-glass-inner">
              <p className="mw-eyebrow-pill">JOIN ROOM</p>
              
              <div className="mw-input-group">
                <input className="mw-input-premium" placeholder="Kode Room (mis. AB12C)" value={code} onChange={(e) => setCode(e.target.value)} />
                <input className="mw-input-premium mt-3" placeholder="Nama Kamu" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleJoin(); }} />
              </div>

              <button type="button" className="mw-btn-premium mt-6 group" disabled={busy} onClick={handleJoin}>
                <span className="mw-btn-text">{busy ? 'Menyusup...' : 'Gabung Sekarang'}</span>
                <div className="mw-btn-arrow-wrap">
                  <div className="mw-btn-arrow">↗</div>
                </div>
              </button>
              <button type="button" className="mw-link-btn-premium" onClick={() => setMode(null)}>Batal</button>
            </div>
          </div>
        )}

        {error && <p className="mw-lobby-error-premium">{error}</p>}
      </div>
    </div>
  );
}

// ============================================================================
// SETUP — room code, role config (moderator edits, everyone sees), roster
// ============================================================================

function SetupScreen({ view, code }) {
  const [copied, setCopied] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [bulkText, setBulkText] = useState('');
  const [bulkMode, setBulkMode] = useState(false);

  const roleConfig = view.roleConfig || DEFAULT_ROLE_CONFIG;
  const totalRoles = Object.values(roleConfig).reduce((a, b) => a + b, 0);
  const teamTotals = { werewolf: 0, netral: 0, warga: 0 };
  Object.entries(roleConfig).forEach(([key, count]) => { teamTotals[roleTeam(key)] += count; });
  const players = view.players || [];
  const canAssign = players.length > 0 && totalRoles === players.length;

  function copyCode() {
    navigator.clipboard?.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div>
      <div className="mw-room-code-bar">
        <span>Kode Room</span>
        <span className="mw-mono mw-room-code">{code}</span>
        <button type="button" className="mw-icon-btn" onClick={copyCode} aria-label="Salin kode room">
          {copied ? <Check size={14} /> : <Copy size={14} />}
        </button>
      </div>

      {view.isModerator ? (
        <section className="mw-panel">
          <p className="mw-eyebrow">Susun Peran</p>
          <h2 className="mw-display mw-panel-title">Komposisi Peran</h2>
          <div className="mw-role-grid">
            {Object.entries(roleConfig).map(([key, count]) => {
              const Icon = ROLE_ICONS[key];
              return (
                <div key={key} className="mw-role-row">
                  <div className={`mw-role-icon team-${roleTeam(key)}`}><Icon size={15} /></div>
                  <span className="mw-role-label">{ROLE_LABEL_ID[key]}</span>
                  <div className="mw-stepper">
                    <button type="button" onClick={() => socket.emit('set_role_count', { role: key, delta: -1 })}>–</button>
                    <span className="mw-mono">{count}</span>
                    <button type="button" onClick={() => socket.emit('set_role_count', { role: key, delta: 1 })}>+</button>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mw-role-totals">
            <span><span className="dot dot-werewolf" />Werewolf {teamTotals.werewolf}</span>
            <span><span className="dot dot-netral" />Netral {teamTotals.netral}</span>
            <span><span className="dot dot-warga" />Warga {teamTotals.warga}</span>
            <span className="mw-total-strong">Total {totalRoles}</span>
          </div>
          <p className={`mw-match-note ${canAssign ? 'ok' : players.length === 0 ? '' : 'warn'}`}>
            {players.length === 0
              ? `Menunggu pemain join — total peran saat ini ${totalRoles}.`
              : canAssign
              ? `Siap! ${totalRoles} peran untuk ${players.length} pemain.`
              : `Total peran (${totalRoles}) belum sama dengan jumlah pemain (${players.length}).`}
          </p>

          <div className="mw-bulk-block" style={{ marginTop: 16 }}>
            {!bulkMode ? (
              <button type="button" className="mw-link-btn" onClick={() => setBulkMode(true)}>Tambahkan pemain manual (opsional)</button>
            ) : (
              <>
                <textarea className="mw-textarea" rows={4} placeholder={'Nama pemain, satu per baris\n(buat yang belum sempat join sendiri)'} value={bulkText} onChange={(e) => setBulkText(e.target.value)} />
                <div className="mw-bulk-actions">
                  <button type="button" className="mw-btn mw-btn-amber" onClick={() => { socket.emit('add_bulk_players', { text: bulkText }); setBulkText(''); setBulkMode(false); }}>Tambahkan</button>
                  <button type="button" className="mw-btn mw-btn-ghost" onClick={() => { setBulkMode(false); setBulkText(''); }}>Batal</button>
                </div>
              </>
            )}
          </div>
        </section>
      ) : (
        <section className="mw-panel">
          <p className="mw-eyebrow">Menunggu Pemandu</p>
          <p className="mw-lobby-text">Pemandu sedang menyiapkan komposisi peran. Kamu sudah masuk daftar pemain di bawah.</p>
        </section>
      )}

      <section className="mw-panel">
        <h2 className="mw-display mw-panel-title">Pemain ({players.length})</h2>
        {players.length === 0 ? (
          <div className="mw-empty-board">Belum ada yang join. Bagikan kode room di atas.</div>
        ) : (
          <div className="mw-chip-row">
            {players.map((p) => (
              <span key={p.id} className="mw-chip">
                {p.name}
                {(view.isModerator || p.id === view.viewerPlayerId) && (
                  <button type="button" onClick={() => socket.emit('remove_player', { id: p.id })} aria-label={`Hapus ${p.name}`}><X size={11} /></button>
                )}
              </span>
            ))}
          </div>
        )}
      </section>

      {view.isModerator && (
        <div className="mw-assign-block">
          <button type="button" className="mw-btn mw-btn-lg mw-btn-amber" disabled={!canAssign} onClick={() => socket.emit('assign_roles')}>
            <Shuffle size={17} /> Acak &amp; Bagi Peran
          </button>
        </div>
      )}
    </div>
  );
}

function roleTeam(key) {
  if (key === 'werewolf_biasa' || key === 'alpha_wolf') return 'werewolf';
  if (key === 'joker') return 'netral';
  return 'warga';
}

// ============================================================================
// REVEAL — private per-player role card (no more pass-the-device needed:
// each player views their own device independently)
// ============================================================================

function RevealScreen({ view }) {
  const [flipped, setFlipped] = useState(false);
  const [openingDone, setOpeningDone] = useState(false);

  if (!openingDone) {
    return <OpeningAnimation players={view.players} onComplete={() => setOpeningDone(true)} />;
  }

  if (view.isModerator) {
    return (
      <div className="mw-pass-wrap">
        <div className="mw-pass-card">
          <Eye size={28} />
          <p className="mw-display mw-pass-title">Menunggu Pemain Siap</p>
          <p className="mw-pass-names">{view.readyCount} / {view.totalCount} sudah lihat peran</p>
          <p className="mw-pass-hint">Setiap pemain melihat perannya sendiri di HP masing-masing.</p>
          <button type="button" className="mw-btn mw-btn-lg mw-btn-amber" onClick={() => socket.emit('start_night_1')}>
            Mulai Malam Pertama
          </button>
        </div>
      </div>
    );
  }

  const def = view.myRole;
  if (!def) return null;
  const Icon = ROLE_ICONS[def.role];

  return (
    <div className="mw-reveal-wrap">
      <p className="mw-eyebrow">Peranmu</p>
      <div className={`mw-flip-card ${flipped ? 'is-flipped' : ''}`} onClick={() => !flipped && setFlipped(true)}>
        <div className="mw-flip-inner">
          <div className="mw-flip-front">
            <Moon size={26} />
            <p className="mw-flip-hint" style={{ marginTop: 14 }}>Ketuk untuk lihat peranmu</p>
          </div>
          <div className="mw-flip-back">
            <div className={`mw-card-icon team-${def.team}`}><Icon size={24} /></div>
            <p className="mw-flip-role-label">{def.label}</p>
            <p className="mw-flip-role-team">{TEAM_LABEL[def.team]}</p>
            <p className="mw-flip-role-desc">{def.desc}</p>
          </div>
        </div>
      </div>
      {flipped && !view.youAreReady && (
        <button type="button" className="mw-btn mw-btn-lg mw-btn-amber" onClick={() => socket.emit('player_ready')}>
          <EyeOff size={16} /> Siap
        </button>
      )}
      {view.youAreReady && <p className="mw-ready-note">✓ Kamu sudah siap. Menunggu pemain lain & Pemandu memulai malam...</p>}
    </div>
  );
}

// ============================================================================
// NIGHT — waiting screen for everyone except whoever's turn it currently is
// ============================================================================

function CupidAction({ view }) {
  const [a, setA] = useState(null);
  const [b, setB] = useState(null);
  const alive = view.players.filter((p) => p.alive);
  function toggle(id) {
    if (a === id) { setA(null); return; }
    if (b === id) { setB(null); return; }
    if (!a) { setA(id); return; }
    if (!b) { setB(id); return; }
    setB(id);
  }
  return (
    <div className="mw-action-wrap">
      <p className="mw-action-title">Pilih 2 pemain untuk dijodohkan (sehidup semati)</p>
      <div className="mw-target-grid">
        {alive.map((p) => (
          <button key={p.id} type="button" className={`mw-target-btn ${a === p.id || b === p.id ? 'is-selected' : ''}`} onClick={() => toggle(p.id)}>{p.name}</button>
        ))}
      </div>
      <button type="button" className="mw-btn mw-btn-lg mw-btn-amber" disabled={!a || !b}
        onClick={() => socket.emit('submit_night_action', { role: 'cupid', payload: { aId: a, bId: b } })}>
        Jodohkan &amp; Lanjut
      </button>
    </div>
  );
}

function SeerAction({ view }) {
  const [checked, setChecked] = useState(null);
  const alive = view.players.filter((p) => p.alive);
  if (checked) {
    return (
      <div className="mw-action-wrap">
        <p className="mw-action-title">Hasil ramalan</p>
        <div className="mw-seer-result">
          <p className="mw-seer-name">{checked.name}</p>
          <p className="mw-seer-role">{checked.roleLabel}</p>
        </div>
        <button type="button" className="mw-btn mw-btn-lg mw-btn-amber"
          onClick={() => socket.emit('submit_night_action', { role: 'seer', payload: { targetId: checked.id } })}>
          Sembunyikan &amp; Lanjut
        </button>
      </div>
    );
  }
  return (
    <div className="mw-action-wrap">
      <p className="mw-action-title">Pilih pemain untuk diperiksa</p>
      <div className="mw-target-grid">
        {alive.map((p) => (
          <button key={p.id} type="button" className="mw-target-btn" onClick={() => setChecked({ id: p.id, name: p.name, roleLabel: ROLE_LABEL_ID[p.role] || '???' })}>{p.name}</button>
        ))}
      </div>
      <p className="mw-action-hint">Hasil ramalan cuma butuh role asli — server sudah tahu, tapi label akan muncul setelah kamu memilih.</p>
    </div>
  );
}

function GuardAction({ view }) {
  const alive = view.players.filter((p) => p.alive);
  return (
    <div className="mw-action-wrap">
      <p className="mw-action-title">Pilih pemain untuk dilindungi malam ini</p>
      <div className="mw-target-grid">
        {alive.map((p) => (
          <button key={p.id} type="button" className="mw-target-btn" onClick={() => socket.emit('submit_night_action', { role: 'guard', payload: { targetId: p.id } })}>{p.name}</button>
        ))}
      </div>
      <button type="button" className="mw-link-btn" onClick={() => socket.emit('submit_night_action', { role: 'guard', payload: { targetId: null } })}>Lewati (jangan lindungi siapa pun)</button>
    </div>
  );
}

function WerewolfAction({ view }) {
  const needTwo = view.doubleBiteNextNight;
  const [targets, setTargets] = useState([]);
  const options = view.players.filter((p) => p.alive && p.team !== 'werewolf');
  function toggle(id) {
    setTargets((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (needTwo) return prev.length >= 2 ? [prev[1], id] : [...prev, id];
      return [id];
    });
  }
  const ready = needTwo ? targets.length === 2 : targets.length === 1;
  return (
    <div className="mw-action-wrap">
      <p className="mw-action-title">{needTwo ? 'Alpha baru gugur — pilih 2 target untuk gigitan ganda' : 'Pilih 1 target untuk diserang'}</p>
      <div className="mw-target-grid">
        {options.map((p) => (
          <button key={p.id} type="button" className={`mw-target-btn ${targets.includes(p.id) ? 'is-selected' : ''}`} onClick={() => toggle(p.id)}>{p.name}</button>
        ))}
      </div>
      <button type="button" className="mw-btn mw-btn-lg mw-btn-amber" disabled={!ready}
        onClick={() => socket.emit('submit_night_action', { role: 'werewolf', payload: { targetIds: targets } })}>
        Serang &amp; Lanjut
      </button>
    </div>
  );
}

function WitchAction({ view }) {
  const [save, setSave] = useState(null);
  const [poison, setPoison] = useState(null);
  const canSave = !view.witchPotions.saveUsed;
  const canPoison = !view.witchPotions.poisonUsed;
  const wolfTargetPlayers = view.nightActions.wolfTargets.map((id) => view.players.find((p) => p.id === id));
  const poisonOptions = view.players.filter((p) => p.alive);
  return (
    <div className="mw-action-wrap">
      {wolfTargetPlayers.length > 0 ? (
        <p className="mw-action-title">Werewolf menyerang: {wolfTargetPlayers.map((p) => p.name).join(' & ')}</p>
      ) : (
        <p className="mw-action-title">Werewolf tidak menyerang siapa pun malam ini</p>
      )}
      {canSave && wolfTargetPlayers.length > 0 && (
        <div className="mw-witch-section">
          <p className="mw-witch-label">Ramuan Penolong (sisa 1x)</p>
          <div className="mw-target-grid">
            {wolfTargetPlayers.map((p) => (
              <button key={p.id} type="button" className={`mw-target-btn ${save === p.id ? 'is-selected' : ''}`} onClick={() => setSave(save === p.id ? null : p.id)}>{p.name}</button>
            ))}
          </div>
        </div>
      )}
      {canPoison && (
        <div className="mw-witch-section">
          <p className="mw-witch-label">Ramuan Racun (sisa 1x, opsional)</p>
          <div className="mw-target-grid">
            {poisonOptions.map((p) => (
              <button key={p.id} type="button" className={`mw-target-btn ${poison === p.id ? 'is-selected' : ''}`} onClick={() => setPoison(poison === p.id ? null : p.id)}>{p.name}</button>
            ))}
          </div>
        </div>
      )}
      <button type="button" className="mw-btn mw-btn-lg mw-btn-amber"
        onClick={() => socket.emit('submit_night_action', { role: 'witch', payload: { saveTargetId: save, poisonTargetId: poison } })}>
        Konfirmasi &amp; Lanjut
      </button>
    </div>
  );
}

function NightScreen({ view }) {
  const meta = NIGHT_TURN_META[view.actingRole] || { label: view.currentTurnRoleLabel, icon: Moon };

  if (!view.myTurn) {
    return (
      <div className="mw-pass-wrap">
        <p className="mw-eyebrow" style={{ textAlign: 'center' }}>Malam {view.round}</p>
        <div className="mw-pass-card">
          <Moon size={28} />
          <p className="mw-display mw-pass-title">Giliran {view.currentTurnRoleLabel}</p>
          <p className="mw-pass-hint">Tunggu sebentar — pemain lain sedang beraksi.</p>
        </div>
      </div>
    );
  }

  const Icon = meta.icon;
  return (
    <div>
      <p className="mw-eyebrow" style={{ textAlign: 'center' }}>Malam {view.round} · Giliranmu ({meta.label})</p>
      {view.actingRole === 'cupid' && <CupidAction view={view} />}
      {view.actingRole === 'seer' && <SeerAction view={view} />}
      {view.actingRole === 'guard' && <GuardAction view={view} />}
      {view.actingRole === 'werewolf' && <WerewolfAction view={view} />}
      {view.actingRole === 'witch' && <WitchAction view={view} />}
    </div>
  );
}

// ============================================================================
// RESOLUTION — Hunter's revenge prompt
// ============================================================================

function ResolutionScreen({ view }) {
  if (!view.canActOnRevenge) {
    return (
      <div className="mw-pass-wrap">
        <div className="mw-pass-card">
          <Target size={28} />
          <p className="mw-display mw-pass-title">{view.pendingRevenge?.hunterName} Gugur!</p>
          <p className="mw-pass-hint">Menunggu Hunter memutuskan siapa yang ditembak sebelum wafat...</p>
        </div>
      </div>
    );
  }
  const options = view.players.filter((p) => p.alive);
  return (
    <div className="mw-pass-wrap">
      <div className="mw-pass-card">
        <Target size={28} />
        <p className="mw-display mw-pass-title">Kamu Gugur!</p>
        <p className="mw-pass-hint">Sebagai Hunter, boleh langsung menembak mati 1 pemain lain sebelum wafat.</p>
        <div className="mw-target-grid" style={{ marginTop: 14 }}>
          {options.map((p) => (
            <button key={p.id} type="button" className="mw-target-btn" onClick={() => socket.emit('resolve_revenge', { targetId: p.id })}>{p.name}</button>
          ))}
        </div>
        <button type="button" className="mw-link-btn" onClick={() => socket.emit('resolve_revenge', { targetId: null })}>Lewati (tidak menembak)</button>
      </div>
    </div>
  );
}

// ============================================================================
// MORNING / DISCUSSION / VOTING / GAME OVER
// ============================================================================

// BoardGrid replaced by HagoPlayerColumns

function ModeratorLogPanel({ view }) {
  const [open, setOpen] = useState(false);
  if (!view.isModerator) return null;
  return (
    <div className="mw-modlog">
      <button type="button" className="mw-link-btn" onClick={() => setOpen((v) => !v)}>
        <Lock size={12} /> {open ? 'Sembunyikan' : 'Lihat'} Catatan Moderator
      </button>
      {open && (
        <div className="mw-modlog-panel">
          <p className="mw-modlog-warn">Rahasia — jangan buka kalau pemain lain sedang melihat layar ini.</p>
          <div className="mw-log-list">
            {[...(view.moderatorLog || [])].reverse().map((e) => <p key={e.id} className="mw-log-entry">{e.text}</p>)}
          </div>
        </div>
      )}
    </div>
  );
}

function PhaseBar({ view }) {
  const meta = PHASE_META[view.phase] || PHASE_META.night;
  const Icon = meta.icon;
  const aliveCount = view.players.filter((p) => p.alive).length;
  return (
    <div className="mw-phasebar">
      <span className="mw-phasebar-badge"><Icon size={14} /> {meta.label}{view.phase !== 'game_over' && view.phase !== 'reveal' ? ` ${view.round}` : ''}</span>
      <span className="mw-phasebar-alive"><Users size={13} /> {aliveCount} hidup</span>
    </div>
  );
}

function MorningScreen({ view }) {
  return (
    <div className="mw-morning-wrap">
      <div className="mw-morning-card">
        <Sunrise size={26} />
        <p className="mw-display mw-morning-title">Pagi Hari — setelah Malam {view.round}</p>
        <div className="mw-morning-log">
          {view.lastNightDeaths.length === 0 ? (
            <p className="mw-morning-line">Malam berlalu dengan damai. Tidak ada yang tewas.</p>
          ) : (
            view.lastNightDeaths.map((d, i) => {
              const p = view.players.find((pl) => pl.id === d.playerId);
              return <p key={i} className="mw-morning-line">{p.name} — {p.roleLabel}</p>;
            })
          )}
        </div>
        {view.isModerator && (
          <button type="button" className="mw-btn mw-btn-lg mw-btn-amber" onClick={() => socket.emit('advance_to_discussion')}>
            Lanjut ke Diskusi
          </button>
        )}
      </div>
    </div>
  );
}

function DiscussionScreen({ view }) {
  const mins = Math.floor(view.discussionSeconds / 60);
  const secs = view.discussionSeconds % 60;
  return (
    <div className="mw-discussion-wrap">
      <p className="mw-eyebrow" style={{ textAlign: 'center' }}>Diskusi — Malam {view.round}</p>
      <div className="mw-timer-card">
        <p className="mw-mono mw-timer-display">{String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}</p>
        {view.isModerator && (
          <div className="mw-timer-controls">
            <button type="button" className="mw-btn mw-btn-ghost" onClick={() => socket.emit('adjust_discussion_time', { delta: -30 })}>-30s</button>
            <button type="button" className="mw-btn mw-btn-amber" onClick={() => socket.emit('toggle_discussion_timer')}>
              {view.discussionRunning ? <><Pause size={15} /> Jeda</> : <><Play size={15} /> Mulai</>}
            </button>
            <button type="button" className="mw-btn mw-btn-ghost" onClick={() => socket.emit('adjust_discussion_time', { delta: 30 })}>+30s</button>
          </div>
        )}
      </div>
      {view.isModerator && (
        <div className="mw-assign-block">
          <button type="button" className="mw-btn mw-btn-lg mw-btn-amber" onClick={() => socket.emit('start_voting')}>Mulai Voting</button>
        </div>
      )}
    </div>
  );
}

function VotingScreen({ view }) {
  const alive = view.players.filter((p) => p.alive);
  const votes = view.votes || {};
  const tally = view.tally || {};
  const maxVotes = Math.max(0, ...Object.values(tally));
  const sorted = [...alive].sort((a, b) => (tally[b.id] || 0) - (tally[a.id] || 0));
  const myVote = view.viewerPlayerId ? votes[view.viewerPlayerId] : null;
  const iAmAlive = alive.some((p) => p.id === view.viewerPlayerId);
  const tied = maxVotes > 0 ? alive.filter((p) => (tally[p.id] || 0) === maxVotes) : [];

  return (
    <div className="mw-voting-wrap">
      <p className="mw-eyebrow" style={{ textAlign: 'center' }}>Voting — Malam {view.round} ({Object.keys(votes).length}/{view.aliveCount} sudah vote)</p>
      <div className="mw-vote-list">
        {sorted.map((p) => {
          const voters = Object.entries(votes).filter(([, targetId]) => targetId === p.id).map(([voterId]) => alive.find((pl) => pl.id === voterId)?.name || '?');
          return (
            <div key={p.id} className={`mw-vote-row ${(tally[p.id] || 0) === maxVotes && maxVotes > 0 ? 'is-leading' : ''}`}>
              <div>
                <span className="mw-vote-name">{p.name}</span>
                {voters.length > 0 && <p className="mw-vote-voters">{voters.join(', ')}</p>}
              </div>
              <div className="mw-vote-controls">
                <span className="mw-mono mw-vote-count">{tally[p.id] || 0}</span>
                {iAmAlive && p.id !== view.viewerPlayerId && (
                  <button type="button" className={`mw-vote-cast-btn ${myVote === p.id ? 'is-selected' : ''}`}
                    onClick={() => socket.emit('cast_vote', { voterId: view.viewerPlayerId, targetId: p.id })}>
                    {myVote === p.id ? 'Vote-mu' : 'Vote'}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {view.isModerator && (
        <div className="mw-assign-block">
          {tied.length > 1 ? (
            <div className="mw-tie-block">
              <p className="mw-assign-hint">Hasil seri: {tied.map((p) => p.name).join(', ')}</p>
              <div className="mw-target-grid">
                {tied.map((p) => (
                  <button key={p.id} type="button" className="mw-target-btn" onClick={() => socket.emit('finalize_vote', { eliminatedId: p.id })}>{p.name}</button>
                ))}
              </div>
              <button type="button" className="mw-link-btn" onClick={() => socket.emit('finalize_vote', { eliminatedId: null })}>Tidak ada yang dieliminasi</button>
            </div>
          ) : (
            <button type="button" className="mw-btn mw-btn-lg mw-btn-amber"
              onClick={() => socket.emit('finalize_vote', { eliminatedId: maxVotes > 0 ? tied[0]?.id : null })}>
              Selesai Voting
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function GameOverScreen({ view }) {
  const winnerText = {
    joker: `JOKER MENANG! ${view.winner.name} berhasil digantung dan menang sendirian.`,
    warga: 'TIM WARGA MENANG! Semua Werewolf berhasil dilenyapkan.',
    werewolf: 'TIM WEREWOLF MENANG! Jumlah Werewolf menyamai warga yang tersisa.',
  }[view.winner.team];

  return (
    <div>
      <div className={`mw-winner-banner team-${view.winner.team}`}>{winnerText}</div>
      {view.isModerator && (
        <div className="mw-bottom-actions">
          <button type="button" className="mw-btn mw-btn-amber" onClick={() => socket.emit('reshuffle_same_players')}>
            <Shuffle size={14} /> Main Lagi (pemain sama)
          </button>
          <button type="button" className="mw-btn mw-btn-ghost" onClick={() => socket.emit('reset_game')}>
            <Trash2 size={14} /> Reset Total
          </button>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// MAIN APP — connection lifecycle + phase routing
// ============================================================================

export default function App() {
  const [view, setView] = useState(null);
  const [code, setCode] = useState(null);
  const [booting, setBooting] = useState(true);
  const bootedRef = useRef(false);

  useEffect(() => {
    function onUpdate(v) { setView(v); }
    socket.on('state_update', onUpdate);
    return () => socket.off('state_update', onUpdate);
  }, []);

  useEffect(() => {
    if (bootedRef.current) return;
    bootedRef.current = true;
    (async () => {
      const saved = loadSession();
      if (saved?.code && saved?.token) {
        const res = await emitAck('join_room', { code: saved.code, token: saved.token });
        if (res.ok) {
          setCode(res.code);
          setView(res.view);
        } else {
          clearSession();
        }
      }
      setBooting(false);
    })();
  }, []);

  const handleJoined = useCallback((joinedView, joinedCode) => {
    setView(joinedView);
  }, []);

  function handleLeaveRoom() {
    if (window.confirm('Yakin ingin keluar dari room ini?')) {
      if (view && !view.isModerator && view.viewerPlayerId) {
        socket.emit('remove_player', { id: view.viewerPlayerId });
      }
      clearSession();
      setView(null);
      setCode(null);
    }
  }

  if (booting) {
    return (
      <div className="mw-root mw-loading">
        <Moon size={26} className="mw-spin" />
        <span>Menyambungkan...</span>
      </div>
    );
  }

  if (!view) {
    return (
      <div className="mw-root phase-lobby-premium">
        <div className="mw-bg-premium-art" />
        <div className="mw-container mw-container-wide">
          <LobbyScreenWrapper onJoined={(v, c) => { setView(v); }} setCode={setCode} />
        </div>
      </div>
    );
  }

  const viewPhase = view.phase || 'lobby';
  const isNight = viewPhase === 'night' || viewPhase === 'resolution';

  return (
    <div className={`mw-root phase-${viewPhase} ${isNight ? 'is-night' : 'is-day'}`}>
      <div className="hago-bg-art" />
      <div className="mw-container">
        <header className="mw-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="mw-header-inner">
            <Moon size={24} className="mw-moon-icon" />
            <div>
              <h1 className="mw-display mw-title">Malam Serigala</h1>
              <p className="mw-subtitle">{view.isModerator ? 'Kamu Pemandu' : 'Werewolf online'}</p>
            </div>
          </div>
          <button type="button" className="mw-btn-ghost" style={{ padding: '8px 12px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }} onClick={handleLeaveRoom}>
            <LogOut size={16} /> Keluar
          </button>
        </header>

        {view.phase === 'setup' && <SetupScreen view={view} code={code} />}
        {view.phase !== 'setup' && (
          <div className="hago-game-area">
            <HagoPlayersColumn 
              players={view.players.slice(0, Math.ceil(view.players.length / 2))} 
              startNumber={1} 
              view={view} 
            />
            
            <div className="hago-center-hub">
              <PhaseBar view={view} />
              {view.phase === 'reveal' && <RevealScreen view={view} />}
              {view.phase === 'night' && <NightScreen view={view} />}
              {view.phase === 'resolution' && <ResolutionScreen view={view} />}
              {view.phase === 'morning' && <MorningScreen view={view} />}
              {view.phase === 'discussion' && <DiscussionScreen view={view} />}
              {view.phase === 'voting' && <VotingScreen view={view} />}
              {view.phase === 'game_over' && <GameOverScreen view={view} />}
              <ModeratorLogPanel view={view} />
            </div>

            <HagoPlayersColumn 
              players={view.players.slice(Math.ceil(view.players.length / 2))} 
              startNumber={Math.ceil(view.players.length / 2) + 1} 
              view={view} 
            />
          </div>
        )}

        {view.phase !== 'lobby' && view.phase !== 'setup' && (
          <ChatAndVoiceBar view={view} />
        )}
      </div>
    </div>
  );
}

function HagoPlayersColumn({ players, startNumber, view }) {
  return (
    <div className="hago-col">
      {players.map((p, i) => (
        <div key={p.id} className="hago-avatar-wrap">
          <div className="hago-player-number">{startNumber + i}</div>
          <div className={`hago-avatar-box ${!p.alive ? 'is-dead' : ''}`}>
            {p.alive ? <User size={30} color="rgba(255,255,255,0.8)" /> : <Ghost size={30} color="rgba(255,255,255,0.4)" />}
          </div>
          <p className="hago-player-name">{p.name}</p>
          {!p.alive && <p className="hago-player-name" style={{ color: '#D92D2D', fontSize: '9px' }}>{p.roleLabel}</p>}
        </div>
      ))}
    </div>
  );
}

function ChatAndVoiceBar({ view }) {
  const [msg, setMsg] = useState('');
  
  // Use persistent messages from DB/state (slice to get last N messages for the overlay)
  const chatLog = (view.messages || []).slice(-15);

  const myPlayer = view.players?.find(p => p.id === view.viewerPlayerId);
  const isDead = myPlayer ? !myPlayer.alive : false;
  // Can chat if moderator, if game over, if in lobby/setup, or if ALIVE.
  const canChat = view.isModerator || view.phase === 'game_over' || view.phase === 'lobby' || view.phase === 'setup' || !isDead;

  function sendChat() {
    if (!msg.trim()) return;
    socket.emit('chat_message', { message: msg });
    setMsg('');
  }

  return (
    <>
      <div className="hago-chat-overlay">
        {chatLog.map((c, i) => (
          <div key={i} className="hago-chat-msg">
            <span className={`hago-chat-name ${c.isModerator ? 'mod' : ''} ${c.isDead ? 'dead' : ''}`}>
              {c.senderName}:
            </span>
            {c.message}
          </div>
        ))}
      </div>
      <div className="hago-bottom-bar">
        <VoiceChat view={view} myPlayerId={view.viewerPlayerId} />
        {canChat ? (
          <div className="hago-chat-input-wrap">
            <input 
              type="text" 
              placeholder="Kirim pesan..." 
              value={msg} 
              onChange={(e) => setMsg(e.target.value)} 
              onKeyDown={(e) => { if (e.key === 'Enter') sendChat(); }}
            />
            <button type="button" className="hago-chat-send" onClick={sendChat}>KIRIM</button>
          </div>
        ) : (
          <div className="hago-chat-input-wrap" style={{ opacity: 0.5, justifyContent: 'center' }}>
            <span style={{ fontSize: '13px', fontStyle: 'italic', color: '#aaa' }}>Hantu tidak bisa bicara...</span>
          </div>
        )}
      </div>
    </>
  );
}

// Wrapper so LobbyScreen (defined earlier, before `code` state existed in this
// scope) can also report the room code back up once created/joined.
function LobbyScreenWrapper({ onJoined, setCode }) {
  return (
    <LobbyScreen
      onJoined={(v) => {
        const saved = loadSession();
        if (saved?.code) setCode(saved.code);
        onJoined(v);
      }}
    />
  );
}
