import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../utils/supabaseClient';
import './Dashboard.css';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtDuration(secs) {
  if (!secs) return '—';
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60), s = secs % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}
function fmtTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}
function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}
function pct(a, b) { return b === 0 ? 0 : Math.round((a / b) * 100); }

// ─── SVG Icons ────────────────────────────────────────────────────────────────
const Icon = {
  Phone: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 1.27h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.37a16 16 0 0 0 6 6l1.27-.96a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7a2 2 0 0 1 1.72 2.01z"/>
    </svg>
  ),
  CheckCircle: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
    </svg>
  ),
  ArrowUpRight: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/>
    </svg>
  ),
  Clock: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
    </svg>
  ),
  Radio: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="2"/><path d="M16.24 7.76a6 6 0 0 1 0 8.49"/><path d="M7.76 7.76a6 6 0 0 0 0 8.49"/><path d="M20.48 3.52a12 12 0 0 1 0 16.97"/><path d="M3.52 3.52a12 12 0 0 0 0 16.97"/>
    </svg>
  ),
  Users: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  ),
  UserCheck: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><polyline points="17 11 19 13 23 9"/>
    </svg>
  ),
  AlertCircle: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
    </svg>
  ),
  Grid: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
    </svg>
  ),
  XCircle: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
    </svg>
  ),
  Refresh: ({ spin }) => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"
      style={spin ? { animation: 'spin 0.8s linear infinite' } : {}}>
      <path d="M23 4v6h-6"/><path d="M1 20v-6h6"/>
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
    </svg>
  ),
  Mail: () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>
    </svg>
  ),
  PhoneSmall: () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 1.27h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.37a16 16 0 0 0 6 6l1.27-.96a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7a2 2 0 0 1 1.72 2.01z"/>
    </svg>
  ),
  Hash: () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/>
    </svg>
  ),
};

// ─── Spark Bar ────────────────────────────────────────────────────────────────
function SparkBar({ data, color }) {
  const max = Math.max(...data.map(d => d.count), 1);
  return (
    <div className="spark-bar">
      {data.map((d, i) => (
        <div key={i} className="spark-col">
          <div
            className="spark-fill"
            style={{ height: `${Math.max((d.count / max) * 100, 4)}%`, background: color }}
            title={`${fmtDate(d.date)}: ${d.count} calls`}
          />
        </div>
      ))}
    </div>
  );
}

// ─── Donut ────────────────────────────────────────────────────────────────────
function Donut({ segments, size = 120 }) {
  const r = 42, cx = 60, cy = 60, circumference = 2 * Math.PI * r;
  let offset = 0;
  const total = segments.reduce((s, seg) => s + seg.value, 0);
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" className="donut-svg">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#f0eeea" strokeWidth="16" />
      {segments.map((seg, i) => {
        const dash = total > 0 ? (seg.value / total) * circumference : 0;
        const gap  = circumference - dash;
        const el = (
          <circle key={i} cx={cx} cy={cy} r={r} fill="none"
            stroke={seg.color} strokeWidth="16"
            strokeDasharray={`${dash} ${gap}`}
            strokeDashoffset={-offset} strokeLinecap="butt"
            style={{ transform: 'rotate(-90deg)', transformOrigin: '60px 60px', transition: 'stroke-dasharray 0.6s ease' }}
          />
        );
        offset += dash;
        return el;
      })}
      <text x={cx} y={cy - 6} textAnchor="middle" className="donut-total">{total}</text>
      <text x={cx} y={cy + 12} textAnchor="middle" className="donut-label">total</text>
    </svg>
  );
}

// ─── Badge ────────────────────────────────────────────────────────────────────
function Badge({ status }) {
  const map = {
    attending:  { label: 'Attending',  cls: 'badge-blue'  },
    completed:  { label: 'Completed',  cls: 'badge-green' },
    handed_off: { label: 'Handed Off', cls: 'badge-amber' },
    queued:     { label: 'Queued',     cls: 'badge-gray'  },
    initiated:  { label: 'Initiated',  cls: 'badge-blue'  },
    accepted:   { label: 'Accepted',   cls: 'badge-green' },
    resolved:   { label: 'Resolved',   cls: 'badge-green' },
    missed:     { label: 'Missed',     cls: 'badge-red'   },
  };
  const { label, cls } = map[status] || { label: status, cls: 'badge-gray' };
  return <span className={`badge ${cls}`}>{label}</span>;
}

// ─── Agent Avatar ─────────────────────────────────────────────────────────────
function AgentAvatar({ name, size = 'sm' }) {
  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const palette  = ['#0ea5e9','#10b981','#f59e0b','#8b5cf6','#ef4444','#ec4899'];
  const color    = palette[name.charCodeAt(0) % palette.length];
  return <div className={`agent-avatar avatar-${size}`} style={{ background: color }}>{initials}</div>;
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({ label, value, icon: IconComp, color, sub, pulse }) {
  const colorMap = {
    navy:  { accent: '#0f1a2e', iconBg: '#e8ecf2', iconColor: '#0f1a2e' },
    green: { accent: '#10b981', iconBg: '#d1fae5', iconColor: '#059669' },
    amber: { accent: '#f59e0b', iconBg: '#fef3c7', iconColor: '#b45309' },
    teal:  { accent: '#0ea5e9', iconBg: '#e0f2fe', iconColor: '#0284c7' },
    blue:  { accent: '#3b82f6', iconBg: '#dbeafe', iconColor: '#1d4ed8' },
    red:   { accent: '#ef4444', iconBg: '#fee2e2', iconColor: '#dc2626' },
  };
  const c = colorMap[color] || colorMap.navy;

  return (
    <div className="kpi-card" style={{ '--kpi-accent': c.accent }}>
      <div className="kpi-top-row">
        <span className="kpi-label">{label}</span>
        <div className="kpi-icon-wrap" style={{ background: c.iconBg, color: c.iconColor }}>
          <IconComp />
          {pulse && <span className="kpi-pulse" style={{ background: c.accent }} />}
        </div>
      </div>
      <div className="kpi-value">{value}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export default function Dashboard() {
  const [sessions,    setSessions]    = useState([]);
  const [customers,   setCustomers]   = useState([]);
  const [handoffs,    setHandoffs]    = useState([]);
  const [agents,      setAgents]      = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [timeRange,   setTimeRange]   = useState('7d');
  const [activeTab,   setActiveTab]   = useState('overview');

  const load = useCallback(async () => {
    setLoading(true);
    const cutoff = timeRange === 'all' ? null
      : new Date(Date.now() - (timeRange === '7d' ? 7 : 30) * 86400000).toISOString();

    // Sequential requests — prevents simultaneous HTTP/3 connection failures (525)
    let sq = supabase.from('sessions').select('*').order('started_at', { ascending: false });
    if (cutoff) sq = sq.gte('started_at', cutoff);
    const { data: sData, error: sErr } = await sq;
    if (sErr) console.error('[Dashboard] sessions:', sErr.message);
    setSessions(sData || []);

    let cq = supabase.from('customer_info').select('*').order('created_at', { ascending: false });
    if (cutoff) cq = cq.gte('created_at', cutoff);
    const { data: cData, error: cErr } = await cq;
    if (cErr) console.error('[Dashboard] customer_info:', cErr.message);
    setCustomers(cData || []);

    let hq = supabase.from('handoffs').select('*').order('triggered_at', { ascending: false });
    if (cutoff) hq = hq.gte('triggered_at', cutoff);
    const { data: hData, error: hErr } = await hq;
    if (hErr) console.error('[Dashboard] handoffs:', hErr.message);
    setHandoffs(hData || []);

    const { data: aData, error: aErr } = await supabase.from('human_agents').select('*').order('name');
    if (aErr) console.error('[Dashboard] human_agents:', aErr.message);
    setAgents(aData || []);

    setLastRefresh(new Date());
    setLoading(false);
  }, [timeRange]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  // ── Derived metrics ──────────────────────────────────────────────────────────
  const total          = sessions.length;
  const completed      = sessions.filter(s => s.status === 'completed').length;
  const handedOff      = sessions.filter(s => s.status === 'handed_off').length;
  const attending      = sessions.filter(s => s.status === 'attending').length;
  const queued         = sessions.filter(s => s.status === 'queued').length;
  const handoffRate    = pct(handedOff, total);
  const completionRate = pct(completed, total);

  const durations   = sessions.filter(s => s.duration_seconds).map(s => s.duration_seconds);
  const avgDuration = durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0;
  const maxDuration = durations.length ? Math.max(...durations) : 0;

  const reasonMap  = handoffs.reduce((acc, h) => { const r = h.reason || 'Unknown'; acc[r] = (acc[r]||0)+1; return acc; }, {});
  const reasonList = Object.entries(reasonMap).sort((a, b) => b[1] - a[1]);

  const handoffStatusMap = handoffs.reduce((acc, h) => { acc[h.status] = (acc[h.status]||0)+1; return acc; }, {});

  const agentHandoffMap = handoffs.reduce((acc, h) => { if (h.human_agent_id) acc[h.human_agent_id] = (acc[h.human_agent_id]||0)+1; return acc; }, {});
  const agentsWithStats = agents.map(a => ({ ...a, handoff_count: agentHandoffMap[a.agent_id] || 0 }))
    .sort((a, b) => b.handoff_count - a.handoff_count);
  const maxAgentHandoffs = Math.max(...agentsWithStats.map(a => a.handoff_count), 1);

  const unassigned = handoffs.filter(h => !h.human_agent_id).length;

  const volumeByDay = (() => {
    const days = timeRange === '7d' ? 7 : 14;
    const buckets = Array.from({ length: days }, (_, i) => {
      const d = new Date(Date.now() - (days - 1 - i) * 86400000);
      return { date: d.toISOString().slice(0, 10), count: 0 };
    });
    sessions.forEach(s => { const b = buckets.find(b => b.date === s.started_at?.slice(0, 10)); if (b) b.count++; });
    return buckets;
  })();

  const intentList = Object.entries(
    customers.filter(c => c.intent).reduce((acc, c) => { acc[c.intent] = (acc[c.intent]||0)+1; return acc; }, {})
  ).sort((a, b) => b[1] - a[1]).slice(0, 6);

  const donutSegments = [
    { label: 'Completed',  value: completed, color: '#10b981' },
    { label: 'Handed Off', value: handedOff, color: '#f59e0b' },
    { label: 'Attending',  value: attending, color: '#0ea5e9' },
    { label: 'Queued',     value: queued,    color: '#cbd5e1' },
  ].filter(s => s.value > 0);

  const handoffStatusColors = { initiated:'#0ea5e9', accepted:'#10b981', resolved:'#10b981', missed:'#ef4444' };

  const departments = [...new Set(agents.map(a => a.department))].filter(Boolean);

  return (
    <div className="dash">
      {/* ── Header ── */}
      <header className="dash-header">
        <div className="dash-brand">
          <div className="dash-dot" />
          <span className="dash-logo">AIS<b>Glass</b></span>
          <span className="dash-title-sep">/</span>
          <span className="dash-page-title">Performance Dashboard</span>
        </div>
        <div className="dash-controls">
          <span className="dash-refresh-time">
            {lastRefresh ? `Updated ${lastRefresh.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}` : ''}
          </span>
          <div className="time-range-tabs">
            {[['7d','Last 7 days'],['30d','Last 30 days'],['all','All time']].map(([val, label]) => (
              <button key={val} className={`time-tab ${timeRange === val ? 'active' : ''}`} onClick={() => setTimeRange(val)}>{label}</button>
            ))}
          </div>
          <button className="refresh-btn" onClick={load} disabled={loading}>
            <Icon.Refresh spin={loading} /> Refresh
          </button>
        </div>
      </header>

      {/* ── Page tabs ── */}
      <div className="page-tabs-wrap">
        <div className="page-tabs">
          {[['overview','Overview'],['handoffs','Handoffs'],['agents','Agents']].map(([val, label]) => (
            <button key={val} className={`page-tab ${activeTab === val ? 'active' : ''}`} onClick={() => setActiveTab(val)}>
              {label}
              {val === 'handoffs' && handoffs.length > 0 && <span className="tab-count">{handoffs.length}</span>}
              {val === 'agents'   && agents.length   > 0 && <span className="tab-count">{agents.length}</span>}
            </button>
          ))}
        </div>
      </div>

      {loading && sessions.length === 0 ? (
        <div className="dash-loading"><div className="loading-ring" /><p>Loading dashboard data…</p></div>
      ) : (
        <main className="dash-main">

          {/* ══ OVERVIEW TAB ══════════════════════════════════════════════════ */}
          {activeTab === 'overview' && <>
            <section className="kpi-row">
              <KpiCard label="Total Calls"    value={total}                    icon={Icon.Phone}       color="navy"  />
              <KpiCard label="Completed"      value={completed}                icon={Icon.CheckCircle} color="green" sub={`${completionRate}% completion rate`} />
              <KpiCard label="Handed Off"     value={handedOff}                icon={Icon.ArrowUpRight}color="amber" sub={`${handoffRate}% handoff rate`} />
              <KpiCard label="Avg. Duration"  value={fmtDuration(avgDuration)} icon={Icon.Clock}       color="teal"  sub={`Max ${fmtDuration(maxDuration)}`} />
              <KpiCard label="Active Now"     value={attending}                icon={Icon.Radio}       color="blue"  pulse={attending > 0} />
            </section>

            <section className="dash-grid-3">
              <div className="dash-card span-2">
                <div className="card-head">
                  <h3>Call Volume</h3>
                  <span className="card-sub">{timeRange === '7d' ? 'Last 7 days' : timeRange === '30d' ? 'Last 30 days' : 'All time'}</span>
                </div>
                <div className="volume-chart">
                  <SparkBar data={volumeByDay} color="#0ea5e9" />
                  <div className="volume-labels">
                    {volumeByDay.filter((_, i) => i % Math.ceil(volumeByDay.length / 6) === 0).map((d, i) => (
                      <span key={i}>{fmtDate(d.date)}</span>
                    ))}
                  </div>
                </div>
              </div>
              <div className="dash-card">
                <div className="card-head"><h3>Status Split</h3></div>
                <div className="donut-wrap">
                  <Donut segments={donutSegments} />
                  <div className="donut-legend">
                    {donutSegments.map(s => (
                      <div key={s.label} className="legend-row">
                        <span className="legend-dot" style={{ background: s.color }} />
                        <span className="legend-label">{s.label}</span>
                        <span className="legend-val">{s.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            <section className="dash-grid-2">
              <div className="dash-card">
                <div className="card-head"><h3>Customer Intent</h3><span className="card-sub">{customers.filter(c => c.intent).length} with intent</span></div>
                {intentList.length === 0 ? <p className="empty-state">No intent data yet</p> : (
                  <div className="intent-grid">
                    {intentList.map(([intent, count], i) => (
                      <div key={intent} className={`intent-chip rank-${i}`}>
                        <span className="intent-name">{intent}</span>
                        <span className="intent-cnt">{count}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="dash-card">
                <div className="card-head"><h3>Customer Info Collected</h3><span className="card-sub">{customers.length} records</span></div>
                <div className="ci-stats">
                  {[
                    { label: 'Name captured',  val: customers.filter(c => c.name).length },
                    { label: 'Email captured', val: customers.filter(c => c.email).length },
                    { label: 'Phone captured', val: customers.filter(c => c.phone).length },
                    { label: 'Intent tagged',  val: customers.filter(c => c.intent).length },
                    { label: 'Notes added',    val: customers.filter(c => c.notes).length },
                  ].map(({ label, val }) => (
                    <div key={label} className="ci-row">
                      <span className="ci-label">{label}</span>
                      <div className="ci-bar-wrap"><div className="ci-bar-fill" style={{ width: `${pct(val, customers.length||1)}%` }} /></div>
                      <span className="ci-count">{val}<span className="ci-pct"> / {customers.length}</span></span>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="dash-grid-2">
              <div className="dash-card">
                <div className="card-head"><h3>Duration Buckets</h3></div>
                <DurationBuckets sessions={sessions} />
              </div>
              <div className="dash-card table-card">
                <div className="card-head"><h3>Recent Sessions</h3><span className="card-sub">Last {Math.min(sessions.length, 8)}</span></div>
                <div className="table-wrap">
                  <table className="sessions-table">
                    <thead><tr><th>Session ID</th><th>Started</th><th>Duration</th><th>Status</th></tr></thead>
                    <tbody>
                      {sessions.slice(0, 8).map(s => (
                        <tr key={s.id} className={s.status === 'attending' ? 'row-live' : ''}>
                          <td className="col-id"><span className="id-pill">{s.session_id?.toString().slice(0,8).toUpperCase()}</span></td>
                          <td className="col-time">{fmtTime(s.started_at)}</td>
                          <td className="col-dur">{fmtDuration(s.duration_seconds)}</td>
                          <td><Badge status={s.status} /></td>
                        </tr>
                      ))}
                      {sessions.length === 0 && <tr><td colSpan={4} className="table-empty">No sessions found</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          </>}

          {/* ══ HANDOFFS TAB ══════════════════════════════════════════════════ */}
          {activeTab === 'handoffs' && <>
            <section className="kpi-row">
              <KpiCard label="Total Handoffs" value={handoffs.length}                      icon={Icon.ArrowUpRight} color="amber" />
              <KpiCard label="Initiated"      value={handoffStatusMap['initiated']  || 0}  icon={Icon.Radio}        color="blue"  />
              <KpiCard label="Accepted"       value={handoffStatusMap['accepted']   || 0}  icon={Icon.CheckCircle}  color="green" />
              <KpiCard label="Missed"         value={handoffStatusMap['missed']     || 0}  icon={Icon.XCircle}      color="red"   />
              <KpiCard label="Unassigned"     value={unassigned}                            icon={Icon.AlertCircle}  color="navy"  sub="No agent linked" />
            </section>

            <section className="dash-grid-2">
              <div className="dash-card">
                <div className="card-head"><h3>Handoff Reasons</h3><span className="card-sub">{handoffs.length} total</span></div>
                {reasonList.length === 0 ? <p className="empty-state">No handoffs yet</p> : (
                  <div className="reason-list">
                    {reasonList.map(([reason, count]) => (
                      <div key={reason} className="reason-row">
                        <span className="reason-label">{reason}</span>
                        <div className="reason-bar-wrap">
                          <div className="reason-bar-fill" style={{ width: `${pct(count, reasonList[0][1])}%` }} />
                        </div>
                        <span className="reason-pct">{count}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="dash-card">
                <div className="card-head"><h3>Status Split</h3></div>
                <div className="donut-wrap">
                  <Donut segments={Object.entries(handoffStatusMap).map(([s, v]) => ({ label:s, value:v, color: handoffStatusColors[s]||'#94a3b8' }))} />
                  <div className="donut-legend">
                    {Object.entries(handoffStatusMap).map(([s, v]) => (
                      <div key={s} className="legend-row">
                        <span className="legend-dot" style={{ background: handoffStatusColors[s]||'#94a3b8' }} />
                        <span className="legend-label" style={{ textTransform:'capitalize' }}>{s}</span>
                        <span className="legend-val">{v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            <section className="dash-card table-card">
              <div className="card-head"><h3>All Handoffs</h3><span className="card-sub">{handoffs.length} records</span></div>
              <div className="table-wrap">
                <table className="sessions-table">
                  <thead>
                    <tr>
                      <th>Session ID</th><th>Triggered At</th><th>Reason</th>
                      <th>User Utterance</th><th>Agent Assigned</th><th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {handoffs.length === 0 && <tr><td colSpan={6} className="table-empty">No handoffs recorded</td></tr>}
                    {handoffs.map(h => {
                      const agent = agents.find(a => a.agent_id === h.human_agent_id);
                      return (
                        <tr key={h.id}>
                          <td className="col-id"><span className="id-pill">{h.session_id?.toString().slice(0,8).toUpperCase()}</span></td>
                          <td className="col-time">{fmtTime(h.triggered_at)}</td>
                          <td><span className="reason-tag">{h.reason}</span></td>
                          <td className="col-utterance">
                            {h.user_utterance_trigger
                              ? <span className="utterance-text">"{h.user_utterance_trigger}"</span>
                              : <span className="handoff-no">—</span>}
                          </td>
                          <td>
                            {agent ? (
                              <div className="agent-cell">
                                <AgentAvatar name={agent.name} />
                                <div>
                                  <div className="agent-cell-name">{agent.name}</div>
                                  <div className="agent-cell-dept">{agent.department}</div>
                                </div>
                              </div>
                            ) : (
                              <span className="unassigned-tag">Unassigned</span>
                            )}
                          </td>
                          <td><Badge status={h.status} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          </>}

          {/* ══ AGENTS TAB ════════════════════════════════════════════════════ */}
          {activeTab === 'agents' && <>
            <section className="kpi-row">
              <KpiCard label="Total Agents"   value={agents.length}                                       icon={Icon.Users}     color="navy"  />
              <KpiCard label="Assigned Calls" value={handoffs.filter(h => h.human_agent_id).length}      icon={Icon.UserCheck} color="green" />
              <KpiCard label="Unassigned"     value={unassigned}                                          icon={Icon.AlertCircle} color="amber" />
              <KpiCard label="Departments"    value={departments.length}                                   icon={Icon.Grid}      color="teal"  />
            </section>

            {agents.length === 0 ? (
              <div className="dash-card"><p className="empty-state">No agents found</p></div>
            ) : (
              <>
                {/* Department summary strip */}
                {departments.length > 0 && (
                  <section className="dept-strip">
                    {departments.map(dept => {
                      const deptAgents = agentsWithStats.filter(a => a.department === dept);
                      const deptHandoffs = deptAgents.reduce((s, a) => s + a.handoff_count, 0);
                      return (
                        <div key={dept} className="dept-card">
                          <div className="dept-card-name">{dept}</div>
                          <div className="dept-card-count">{deptAgents.length} <span>agent{deptAgents.length !== 1 ? 's' : ''}</span></div>
                          <div className="dept-card-handoffs">{deptHandoffs} handoffs</div>
                        </div>
                      );
                    })}
                  </section>
                )}

                <section className="agents-table-section dash-card table-card">
                  <div className="card-head">
                    <h3>Agent Roster</h3>
                    <span className="card-sub">{agents.length} agents</span>
                  </div>
                  <div className="table-wrap">
                    <table className="sessions-table agents-table">
                      <thead>
                        <tr>
                          <th>Agent</th>
                          <th>Department</th>
                          <th>Contact</th>
                          <th>Skills</th>
                          <th>Agent ID</th>
                          <th>Handoffs</th>
                        </tr>
                      </thead>
                      <tbody>
                        {agentsWithStats.map(agent => (
                          <tr key={agent.id}>
                            <td>
                              <div className="agent-cell">
                                <AgentAvatar name={agent.name} size="md" />
                                <span className="agent-cell-name">{agent.name}</span>
                              </div>
                            </td>
                            <td>
                              {agent.department
                                ? <span className="dept-tag">{agent.department}</span>
                                : <span className="handoff-no">—</span>}
                            </td>
                            <td>
                              <div className="agent-contact-col">
                                {agent.email && (
                                  <div className="agent-contact-row">
                                    <span className="contact-icon"><Icon.Mail /></span>
                                    <span className="contact-val">{agent.email}</span>
                                  </div>
                                )}
                                {agent.phone && (
                                  <div className="agent-contact-row">
                                    <span className="contact-icon"><Icon.PhoneSmall /></span>
                                    <span className="contact-val">{agent.phone}</span>
                                  </div>
                                )}
                                {!agent.email && !agent.phone && <span className="handoff-no">—</span>}
                              </div>
                            </td>
                            <td>
                              {agent.skills?.length > 0
                                ? <div className="agent-skills-inline">{agent.skills.map(s => <span key={s} className="skill-chip">{s}</span>)}</div>
                                : <span className="handoff-no">—</span>}
                            </td>
                            <td>
                              <span className="id-pill mono-sm">
                                <Icon.Hash />{agent.agent_id}
                              </span>
                            </td>
                            <td>
                              <div className="agent-handoff-inline">
                                <div className="agent-bar-wrap">
                                  <div className="agent-bar-fill" style={{ width: `${pct(agent.handoff_count, maxAgentHandoffs)}%` }} />
                                </div>
                                <span className="agent-stat-val">{agent.handoff_count}</span>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              </>
            )}
          </>}

        </main>
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function DurationBuckets({ sessions }) {
  const buckets = [
    { label: '< 30s',  min: 0,   max: 30       },
    { label: '30–60s', min: 30,  max: 60       },
    { label: '1–3m',   min: 60,  max: 180      },
    { label: '3–5m',   min: 180, max: 300      },
    { label: '5–10m',  min: 300, max: 600      },
    { label: '> 10m',  min: 600, max: Infinity },
  ].map(b => ({ ...b, count: sessions.filter(s => s.duration_seconds >= b.min && s.duration_seconds < b.max).length }));
  const max = Math.max(...buckets.map(b => b.count), 1);
  return (
    <div className="bucket-list">
      {buckets.map(b => (
        <div key={b.label} className="bucket-row">
          <span className="bucket-label">{b.label}</span>
          <div className="bucket-bar-wrap"><div className="bucket-bar-fill" style={{ width: `${(b.count/max)*100}%` }} /></div>
          <span className="bucket-count">{b.count}</span>
        </div>
      ))}
    </div>
  );
}