import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity, AlertTriangle, CheckCircle2, Cpu, HardDrive, LayoutDashboard,
  MemoryStick, RefreshCw, Settings, ShieldCheck, Sparkles, Trash2, X,
  Bell, Search, CircleHelp, Zap, Clock3, FileWarning
} from "lucide-react";
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis
} from "recharts";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

const demoDrives = [
  { name: "C:", mount_point: "C:\\", total_bytes: 256 * 1024 ** 3, available_bytes: 42 * 1024 ** 3, used_percent: 83.6 },
  { name: "D:", mount_point: "D:\\", total_bytes: 512 * 1024 ** 3, available_bytes: 241 * 1024 ** 3, used_percent: 52.9 }
];
const initialMetrics = { cpu_percent: 12, memory_percent: 48, total_memory_bytes: 16 * 1024 ** 3, used_memory_bytes: 7.7 * 1024 ** 3, uptime_seconds: 0, drives: demoDrives, processes: [], timestamp: new Date().toISOString() };
const fmtBytes = (bytes = 0) => {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let n = bytes, i = 0;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(i > 1 ? 1 : 0)} ${units[i]}`;
};
const fmtDuration = (secs = 0) => {
  const d = Math.floor(secs / 86400), h = Math.floor((secs % 86400) / 3600), m = Math.floor((secs % 3600) / 60);
  return d ? `${d}d ${h}h` : `${h}h ${m}m`;
};
const pct = (v) => `${Number(v || 0).toFixed(0)}%`;

function MetricCard({ title, value, subtitle, icon: Icon, tone = "blue", progress }) {
  return <article className="metric-card">
    <div className="metric-top"><span>{title}</span><span className={`icon-box ${tone}`}><Icon size={19}/></span></div>
    <div className="metric-value">{value}</div>
    <div className="metric-subtitle">{subtitle}</div>
    {progress !== undefined && <div className="progress-track"><div className={`progress-fill ${tone}`} style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}/></div>}
  </article>;
}
function StatusPill({ status }) {
  const map = { healthy: ["Healthy", "green"], warning: ["Needs attention", "yellow"], critical: ["Critical", "red"], loading: ["Starting", "blue"] };
  const [label, cls] = map[status] || map.healthy;
  return <span className={`status-pill ${cls}`}><span className="status-dot"/>{label}</span>;
}
function App() {
  const [page, setPage] = useState("Overview");
  const [metrics, setMetrics] = useState(initialMetrics);
  const [history, setHistory] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [cleanupItems, setCleanupItems] = useState([]);
  const [scanning, setScanning] = useState(false);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState({ cpuThreshold: 85, diskThreshold: 10, interval: 5, startup: false });
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState("");
  const [isTauri, setIsTauri] = useState(false);

  const notify = useCallback((message) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 4000);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const result = await invoke("get_system_snapshot");
      setMetrics(result);
      setHistory(old => [...old, { time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }), cpu: Number(result.cpu_percent || 0), ram: Number(result.memory_percent || 0) }].slice(-30));
      setIsTauri(true);
    } catch (error) {
      // Browser preview fallback: useful for layout only; values are simulated, not real system readings.
      setMetrics(old => ({ ...old, cpu_percent: Math.max(2, Math.min(98, old.cpu_percent + (Math.random() * 12 - 6))), memory_percent: Math.max(15, Math.min(95, old.memory_percent + (Math.random() * 3 - 1.5))), timestamp: new Date().toISOString() }));
      setIsTauri(false);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, Math.max(2, settings.interval) * 1000);
    return () => window.clearInterval(timer);
  }, [refresh, settings.interval]);

  useEffect(() => {
    let unlisten;
    listen("health-alert", event => {
      const item = { id: `${Date.now()}-${Math.random()}`, ...event.payload, time: new Date().toLocaleTimeString() };
      setAlerts(old => [item, ...old].slice(0, 50));
      notify(item.title || "PC health alert");
    }).then(fn => { unlisten = fn; }).catch(() => {});
    return () => { if (unlisten) unlisten(); };
  }, [notify]);

  useEffect(() => {
    const cpu = Number(metrics.cpu_percent || 0);
    const driveCritical = (metrics.drives || []).some(d => Number(d.free_percent ?? (100 - d.used_percent)) <= settings.diskThreshold);
    // Local UI warning fallback; the Rust backend also applies alert thresholds.
    if (cpu >= settings.cpuThreshold) {
      setAlerts(old => {
        if (old[0]?.kind === "cpu-ui" && Date.now() - old[0].created < 60000) return old;
        return [{ id: Date.now(), kind: "cpu-ui", created: Date.now(), title: "High CPU usage", message: `CPU is currently at ${cpu.toFixed(0)}%. Check the process list before taking action.`, time: new Date().toLocaleTimeString() }, ...old].slice(0, 50);
      });
    }
    if (driveCritical) {
      setAlerts(old => {
        const d = (metrics.drives || []).find(x => Number(x.free_percent ?? (100 - x.used_percent)) <= settings.diskThreshold);
        if (!d || old.some(a => a.kind === "disk-ui" && a.drive === d.name)) return old;
        return [{ id: Date.now(), kind: "disk-ui", drive: d.name, title: `Low storage on ${d.name}`, message: "Review large files and cleanup candidates.", time: new Date().toLocaleTimeString() }, ...old].slice(0, 50);
      });
    }
  }, [metrics, settings.cpuThreshold, settings.diskThreshold]);

  const cpuStatus = metrics.cpu_percent >= 90 ? "critical" : metrics.cpu_percent >= settings.cpuThreshold ? "warning" : "healthy";
  const drives = metrics.drives || [];
  const overallStatus = cpuStatus === "critical" || drives.some(d => Number(d.free_percent ?? (100 - d.used_percent)) < 5) ? "critical"
    : cpuStatus === "warning" || metrics.memory_percent >= 85 || drives.some(d => Number(d.free_percent ?? (100 - d.used_percent)) < 15) ? "warning" : "healthy";

  const scanCleanup = async () => {
    setScanning(true);
    try {
      const result = await invoke("scan_cleanup_candidates");
      setCleanupItems(result || []);
      notify(`Scan complete: ${(result || []).length} candidate(s) found.`);
    } catch (error) {
      setCleanupItems([]);
      notify(`Cleanup scan unavailable: ${String(error)}. Run the desktop app, not browser preview.`);
    } finally { setScanning(false); }
  };
  const deleteCandidate = async (item) => {
    const approved = window.confirm(`Move/delete this file?\n\n${item.path}\n\nOnly proceed if you recognize this file and are sure it is safe to remove.`);
    if (!approved) return;
    try {
      await invoke("delete_cleanup_candidate", { path: item.path });
      setCleanupItems(old => old.filter(x => x.path !== item.path));
      notify("Cleanup candidate removed.");
    } catch (error) { notify(`Could not remove file: ${String(error)}`); }
  };
  const updateSettings = async (key, value) => {
    setSettings(old => ({ ...old, [key]: value }));
    if (key === "cpuThreshold" || key === "diskThreshold") {
      try { await invoke("set_thresholds", { cpuThreshold: key === "cpuThreshold" ? value : settings.cpuThreshold, diskThreshold: key === "diskThreshold" ? value : settings.diskThreshold }); } catch {}
    }
  };
  const filteredProcesses = useMemo(() => (metrics.processes || []).filter(p => `${p.name} ${p.pid}`.toLowerCase().includes(search.toLowerCase())), [metrics.processes, search]);

  const nav = [
    { label: "Overview", icon: LayoutDashboard }, { label: "Processes", icon: Activity },
    { label: "Drives", icon: HardDrive }, { label: "Cleanup Assistant", icon: Trash2 },
    { label: "Alerts", icon: Bell }, { label: "Settings", icon: Settings }
  ];

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><ShieldCheck size={23}/></div><div><strong>PC Health</strong><span>AI AGENT</span></div></div>
      <div className="nav-label">WORKSPACE</div>
      <nav>{nav.map(({ label, icon: Icon }) => <button key={label} className={`nav-item ${page === label ? "active" : ""}`} onClick={() => setPage(label)}><Icon size={18}/><span>{label}</span>{label === "Alerts" && alerts.length > 0 && <b className="nav-count">{alerts.length}</b>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="agent-status"><span className="pulse-dot"/><div><b>Agent is running</b><small>{isTauri ? "Local system connected" : "Preview mode · simulated data"}</small></div></div><div className="sidebar-version">PC Health Agent v0.1.0</div></div>
    </aside>
    <main className="main-content">
      <header className="topbar"><div><div className="breadcrumb">PC HEALTH AGENT <span>/</span> {page.toUpperCase()}</div><h1>{page === "Overview" ? "System Overview" : page}</h1></div><div className="top-actions"><span className="last-updated"><span className="pulse-dot"/>{loading ? "Connecting..." : "Monitoring active"}</span><button className="icon-button" title="Refresh now" onClick={refresh}><RefreshCw size={17}/></button><div className="avatar">PC</div></div></header>
      {page === "Overview" && <>
        <section className="welcome-row"><div><h2>Your PC at a glance</h2><p>Live resource monitoring and proactive health insights.</p></div><StatusPill status={overallStatus}/></section>
        <section className="metrics-grid">
          <MetricCard title="CPU Usage" value={pct(metrics.cpu_percent)} subtitle={`Alert threshold: ${settings.cpuThreshold}%`} icon={Cpu} tone="blue" progress={metrics.cpu_percent}/>
          <MetricCard title="Memory Usage" value={pct(metrics.memory_percent)} subtitle={`${fmtBytes(metrics.used_memory_bytes)} of ${fmtBytes(metrics.total_memory_bytes)}`} icon={MemoryStick} tone="purple" progress={metrics.memory_percent}/>
          <MetricCard title="Drives Detected" value={drives.length} subtitle="Mounted volumes monitored" icon={HardDrive} tone="cyan"/>
          <MetricCard title="Active Alerts" value={alerts.length} subtitle="Recent warnings and events" icon={Bell} tone={alerts.length ? "orange" : "green"}/>
        </section>
        <section className="content-grid">
          <article className="panel chart-panel"><div className="panel-heading"><div><h3>Resource activity</h3><p>Recent CPU and RAM readings</p></div><span className="live-badge"><span className="pulse-dot"/> LIVE</span></div>
            <div className="chart-legend"><span><i className="legend-dot cpu-dot"/> CPU</span><span><i className="legend-dot ram-dot"/> RAM</span></div>
            <div className="chart-area">{history.length > 1 ? <ResponsiveContainer width="100%" height="100%"><AreaChart data={history}><defs><linearGradient id="cpuGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#6d8cff" stopOpacity={0.25}/><stop offset="95%" stopColor="#6d8cff" stopOpacity={0}/></linearGradient><linearGradient id="ramGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#b18aff" stopOpacity={0.2}/><stop offset="95%" stopColor="#b18aff" stopOpacity={0}/></linearGradient></defs><CartesianGrid strokeDasharray="3 3" stroke="#263044"/><XAxis dataKey="time" tick={{ fill: "#8995ab", fontSize: 10 }} minTickGap={24}/><YAxis domain={[0,100]} tick={{ fill: "#8995ab", fontSize: 11 }} tickFormatter={v => `${v}%`}/><Tooltip contentStyle={{ background: "#121a2b", border: "1px solid #29354a", borderRadius: 10 }} labelStyle={{ color: "#cbd5e1" }}/><Area type="monotone" dataKey="cpu" name="CPU" stroke="#7892ff" fill="url(#cpuGradient)" strokeWidth={2} isAnimationActive={false}/><Area type="monotone" dataKey="ram" name="RAM" stroke="#b18aff" fill="url(#ramGradient)" strokeWidth={2} isAnimationActive={false}/></AreaChart></ResponsiveContainer> : <div className="empty-chart"><Activity size={25}/><span>Collecting readings…</span><small>Charts populate as monitoring runs.</small></div>}</div>
          </article>
          <article className="panel insight-panel"><div className="panel-heading"><div><h3><Sparkles size={17}/> Health insights</h3><p>Local rule-based analysis</p></div></div>
            <div className={`health-summary ${overallStatus}`}><div className="health-summary-icon">{overallStatus === "healthy" ? <CheckCircle2/> : <AlertTriangle/>}</div><div><b>{overallStatus === "healthy" ? "Looking good" : overallStatus === "critical" ? "Action recommended" : "Needs attention"}</b><p>{overallStatus === "healthy" ? "No critical issues detected in the latest readings." : "One or more readings crossed your configured health thresholds."}</p></div></div>
            <div className="insight-list">
              {metrics.cpu_percent >= settings.cpuThreshold && <div className="insight-item"><span className="insight-icon orange"><Cpu size={16}/></span><div><b>High CPU usage</b><p>Inspect the top processes and confirm whether the workload is expected.</p></div></div>}
              {metrics.memory_percent >= 85 && <div className="insight-item"><span className="insight-icon purple"><MemoryStick size={16}/></span><div><b>Memory pressure</b><p>Review memory-heavy apps and close only those you don't need.</p></div></div>}
              {drives.filter(d => Number(d.free_percent ?? (100-d.used_percent)) < 15).map(d => <div className="insight-item" key={d.name}><span className="insight-icon orange"><HardDrive size={16}/></span><div><b>Low space on {d.name}</b><p>{fmtBytes(d.available_bytes)} free. Review large files and safe cleanup candidates.</p></div></div>)}
              {overallStatus === "healthy" && <div className="insight-item"><span className="insight-icon green"><ShieldCheck size={16}/></span><div><b>No immediate action</b><p>The agent will keep monitoring and alert you when a threshold is crossed.</p></div></div>}
            </div><button className="text-button" onClick={() => setPage("Cleanup Assistant")}>Open cleanup assistant <span>→</span></button>
          </article>
        </section>
        <section className="panel drive-panel"><div className="panel-heading"><div><h3>Storage overview</h3><p>All detected mounted drives</p></div><button className="text-button" onClick={() => setPage("Drives")}>View all drives →</button></div>
          {drives.length ? <div className="drive-grid">{drives.slice(0,4).map(d => <DriveCard key={d.name} drive={d}/>)}</div> : <div className="empty-state">No mounted drives were returned. Check permissions or refresh.</div>}
        </section>
        <section className="panel process-panel"><div className="panel-heading"><div><h3>Top processes by CPU</h3><p>Use this list to investigate resource spikes</p></div><button className="text-button" onClick={() => setPage("Processes")}>All processes →</button></div><ProcessTable processes={(metrics.processes || []).slice(0,5)} search={search} setSearch={setSearch}/></section>
      </>}
      {page === "Processes" && <section className="panel page-panel"><div className="panel-heading"><div><h3>Running processes</h3><p>Sorted by CPU usage. The agent will not terminate processes automatically.</p></div></div><ProcessTable processes={filteredProcesses} search={search} setSearch={setSearch}/></section>}
      {page === "Drives" && <section className="panel page-panel"><div className="panel-heading"><div><h3>Drive monitor</h3><p>Mounted volumes and available capacity</p></div><button className="secondary-button" onClick={refresh}><RefreshCw size={15}/> Refresh</button></div><div className="drive-grid full">{drives.map(d => <DriveCard key={d.name} drive={d}/>)}</div><p className="muted-note">Removable drives are included when Windows exposes them as mounted volumes. Physical drive health / SMART status is not measured by this basic monitor.</p></section>}
      {page === "Cleanup Assistant" && <section className="panel page-panel"><div className="panel-heading"><div><h3>Safe cleanup assistant</h3><p>Scan approved temporary locations and review candidates before deleting.</p></div><button className="primary-button" onClick={scanCleanup} disabled={scanning}><Search size={16}/>{scanning ? "Scanning…" : "Scan cleanup candidates"}</button></div><div className="safety-banner"><ShieldCheck size={19}/><div><b>You stay in control</b><p>The scanner only proposes files from known temporary locations. Review every item before removal. Never delete files you don't recognize.</p></div></div>{cleanupItems.length ? <div className="cleanup-list">{cleanupItems.map(item => <div className="cleanup-item" key={item.path}><div className="file-icon"><FileWarning size={18}/></div><div className="file-info"><b>{item.name}</b><span>{item.path}</span><small>{fmtBytes(item.size_bytes)}</small></div><button className="danger-outline" onClick={() => deleteCandidate(item)}><Trash2 size={15}/> Remove</button></div>)}</div> : <div className="empty-state large"><Trash2 size={27}/><b>No scan results yet</b><span>Run a scan to find eligible temporary files. The scan does not delete anything.</span></div>}</section>}
      {page === "Alerts" && <section className="panel page-panel"><div className="panel-heading"><div><h3>Alert history</h3><p>Recent health events detected by the agent</p></div><button className="secondary-button" onClick={() => setAlerts([])}><X size={15}/> Clear history</button></div>{alerts.length ? <div className="alert-list">{alerts.map(a => <div className="alert-row" key={a.id}><div className={`alert-icon ${a.kind?.includes("disk") ? "orange" : "blue"}`}><AlertTriangle size={18}/></div><div className="alert-copy"><b>{a.title}</b><p>{a.message}</p><small>{a.time || "Just now"}</small></div></div>)}</div> : <div className="empty-state large"><CheckCircle2 size={28}/><b>You're all caught up</b><span>No alerts in this session.</span></div>}</section>}
      {page === "Settings" && <section className="panel page-panel"><div className="panel-heading"><div><h3>Agent settings</h3><p>Adjust alert thresholds and monitoring behavior</p></div></div><div className="settings-list">
        <SettingRow title="High CPU alert threshold" description="Alert when CPU usage reaches or exceeds this value." control={<div className="range-control"><input type="range" min="50" max="99" value={settings.cpuThreshold} onChange={e => updateSettings("cpuThreshold", Number(e.target.value))}/><b>{settings.cpuThreshold}%</b></div>}/>
        <SettingRow title="Low disk space threshold" description="Warn when a drive has this percentage of space remaining." control={<div className="range-control"><input type="range" min="3" max="25" value={settings.diskThreshold} onChange={e => updateSettings("diskThreshold", Number(e.target.value))}/><b>{settings.diskThreshold}%</b></div>}/>
        <SettingRow title="Monitoring interval" description="How often the dashboard requests a fresh snapshot." control={<select value={settings.interval} onChange={e => updateSettings("interval", Number(e.target.value))}><option value={2}>2 seconds</option><option value={5}>5 seconds</option><option value={10}>10 seconds</option><option value={30}>30 seconds</option></select>}/>
        <SettingRow title="Start with Windows" description="Startup integration will be configured in a later implementation step." control={<label className="switch"><input type="checkbox" checked={settings.startup} onChange={e => { updateSettings("startup", e.target.checked); notify("This UI preference is not yet wired to Windows startup."); }}/><span/></label>}/>
      </div><div className="settings-footnote"><CircleHelp size={16}/> Settings are currently stored in this running UI session. Persistent settings and Windows startup registration are planned next.</div></section>}
      <footer className="footer"><span>PC Health AI Agent · Local-first monitoring</span><span><ShieldCheck size={13}/> Your metrics stay on this PC in the starter version</span></footer>
    </main>
    {toast && <div className="toast"><Zap size={17}/>{toast}<button onClick={() => setToast("")}><X size={15}/></button></div>}
  </div>;
}
function DriveCard({ drive }) {
  const freePercent = Number(drive.free_percent ?? (100 - drive.used_percent) ?? 0);
  const usedPercent = Number(drive.used_percent ?? (100 - freePercent) ?? 0);
  const level = freePercent < 5 ? "critical" : freePercent < 15 ? "warning" : "healthy";
  return <div className="drive-card"><div className="drive-card-top"><div className="drive-symbol"><HardDrive size={18}/></div><div className="drive-title"><b>{drive.name}</b><span>{drive.mount_point}</span></div><StatusPill status={level}/></div><div className="drive-bar"><div className={`drive-used ${level}`} style={{ width: `${Math.max(0, Math.min(100, usedPercent))}%` }}/></div><div className="drive-details"><span>{fmtBytes(drive.available_bytes)} free</span><b>{usedPercent.toFixed(0)}% used</b></div><div className="drive-capacity">of {fmtBytes(drive.total_bytes)} total</div></div>;
}
function ProcessTable({ processes, search, setSearch }) {
  return <><div className="table-toolbar"><div className="search-box"><Search size={16}/><input placeholder="Search process name or PID…" value={search} onChange={e => setSearch(e.target.value)}/></div><span className="muted-note">{processes.length} processes shown</span></div><div className="table-wrap"><table><thead><tr><th>PROCESS</th><th>PID</th><th>CPU</th><th>MEMORY</th><th>STATUS</th></tr></thead><tbody>{processes.length ? processes.map((p, i) => <tr key={`${p.pid}-${p.name}`}><td><div className="process-name"><span className="process-avatar">{(p.name || "?").slice(0,1).toUpperCase()}</span><b>{p.name}</b></div></td><td className="mono">{p.pid}</td><td><div className="table-metric"><span>{Number(p.cpu_percent || 0).toFixed(1)}%</span><div className="mini-track"><i style={{ width: `${Math.min(100, Number(p.cpu_percent || 0))}%` }}/></div></div></td><td>{fmtBytes(p.memory_bytes)}</td><td><span className="process-status"><span/> Running</span></td></tr>) : <tr><td colSpan="5" className="empty-table">{search ? "No matching processes." : "Process data will appear when running inside the Tauri desktop app."}</td></tr>}</tbody></table></div></>;
}
function SettingRow({ title, description, control }) {
  return <div className="setting-row"><div><b>{title}</b><p>{description}</p></div><div className="setting-control">{control}</div></div>;
}
export default App;