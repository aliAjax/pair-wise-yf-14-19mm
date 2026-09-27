import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import StageMap, { TYPE_COLORS } from "./components/StageMap";
import ImpactDialog, { buildImpactItem, type ImpactItem } from "./components/ImpactDialog";
import {
  FOCI,
  FIXTURE_TYPES,
  GELS,
  eff,
  focusDef,
  gelColor,
  overrideFields,
  type Cue,
  type CueRef,
  type Fixture,
  type FixtureType,
  type HistoryEntry,
  type OverrideField,
  type Show,
  type Version,
} from "./types";
import { loadShow, loadVersions, saveShow, saveVersions, VERSION_LIMIT } from "./store";

type FilterType = FixtureType | "全部";

interface PendingImpact {
  fixtureId: string;
  field: OverrideField & ("channel" | "gel");
  value: string | number;
  items: ImpactItem[];
}

export default function App() {
  const [show, setShow] = useState<Show>(loadShow);
  const [versions, setVersions] = useState<Version[]>(loadVersions);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [currentCueId, setCurrentCueId] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterType>("全部");
  const [query, setQuery] = useState("");
  const [onlyInCue, setOnlyInCue] = useState(false);
  const [blackout, setBlackout] = useState(false);
  const [pending, setPending] = useState<PendingImpact | null>(null);
  const [verNote, setVerNote] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const showRef = useRef(show);
  showRef.current = show;

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  const sortedCues = useMemo(() => show.cues.slice().sort((a, b) => a.no - b.no), [show.cues]);
  const currentCue = sortedCues.find((c) => c.id === currentCueId) ?? null;
  const selected = show.fixtures.find((f) => f.id === selectedId) ?? null;

  /* ---------------- 提交（带历史）/ 实时（不带历史，拖动滑块时用） ---------------- */

  const live = (produce: (d: Show) => void) => {
    setShow((prev) => {
      const d = structuredClone(prev);
      produce(d);
      saveShow(d);
      return d;
    });
  };

  const commit = (label: string, produce: (d: Show) => void) => {
    const after = structuredClone(showRef.current);
    produce(after);
    saveShow(after);
    setShow(after);
    setHistory((h) => [...h, { label, before: structuredClone(showRef.current), after }].slice(-60));
  };

  /** 实时拖动结束后补记一条历史（before 为按下时的快照） */
  const recordAfter = (before: Show, label: string) => {
    setHistory((h) => [...h, { label, before, after: structuredClone(showRef.current) }].slice(-60));
  };

  const undo = (index: number) => {
    const entry = history[index];
    if (!entry) return;
    saveShow(entry.before);
    setShow(entry.before);
    setHistory((h) => h.slice(0, index));
    setToast(`已撤回：${entry.label}`);
  };

  /* ---------------- 灯具：通道 / 色片改动（先看受影响项） ---------------- */

  const referencingCues = (fxId: string) => show.cues.filter((c) => c.refs.some((r) => r.id === fxId));

  /** 通道/色片保存入口：无引用直接改基础值；有引用弹受影响项 */
  const requestBaseChange = (fxId: string, field: "channel" | "gel", value: string | number) => {
    const fx = show.fixtures.find((f) => f.id === fxId)!;
    if (fx[field] === value) return;
    const items = referencingCues(fxId).map((c) => buildImpactItem(fx, c, field));
    if (items.length === 0) {
      const label = field === "channel" ? `修改 ${fx.no} 通道为 CH${value}` : `更换 ${fx.no} 色片为 ${value}`;
      commit(label, (d) => {
        (d.fixtures.find((x) => x.id === fxId)![field] as string | number) = value;
      });
      setToast(label + "（无 Cue 引用，已直接保存）");
      return;
    }
    setPending({ fixtureId: fxId, field, value, items });
  };

  /** 只处理当前 Cue：当前 Cue 写入独立值（=基础值的旧值），新值作为基础值，其他引用不动 */
  const commitCurrentOnly = () => {
    if (!pending || !currentCue) return;
    const fx = show.fixtures.find((f) => f.id === pending.fixtureId)!;
    if (!currentCue.refs.some((r) => r.id === fx.id)) return;
    const label =
      pending.field === "channel"
        ? `Q${currentCue.no} 中 ${fx.no} 保留旧通道 CH${fx.channel}（仅当前 Cue）`
        : `Q${currentCue.no} 中 ${fx.no} 保留旧色片 ${fx.gel}（仅当前 Cue）`;
    commit(label, (d) => {
      const cue = d.cues.find((c) => c.id === currentCue.id)!;
      cue.refs.find((r) => r.id === fx.id)!.overrides[pending.field] = fx[pending.field];
      d.fixtures.find((x) => x.id === fx.id)![pending.field] = pending.value as never;
    });
    setToast(label);
    setPending(null);
  };

  /** 同步全部引用：基础值与全部引用统一为新值（旧值保留在历史中，可撤回） */
  const commitSyncAll = () => {
    if (!pending) return;
    const fx = show.fixtures.find((f) => f.id === pending.fixtureId)!;
    const label =
      pending.field === "channel"
        ? `${fx.no} 通道同步为 CH${pending.value}（${pending.items.length} 个 Cue）`
        : `${fx.no} 色片同步为 ${pending.value}（${pending.items.length} 个 Cue）`;
    commit(label, (d) => {
      d.fixtures.find((x) => x.id === fx.id)![pending.field] = pending.value as never;
      d.cues.forEach((c) =>
        c.refs.forEach((r) => {
          if (r.id === fx.id) delete r.overrides[pending.field];
        })
      );
    });
    setToast(label + "，可在历史操作中撤回");
    setPending(null);
  };

  /* ---------------- 灯具 / Cue 增删改 ---------------- */

  const addFixture = () => {
    const id = "fx" + (show.seq.fix + 1);
    const ch = Math.max(0, ...show.fixtures.map((f) => f.channel)) + 1;
    const fx: Fixture = {
      id,
      no: "NEW-" + String(show.fixtures.length + 1).padStart(2, "0"),
      name: "新增灯具",
      type: "面光",
      channel: ch,
      gel: "L201",
      focus: "舞台中心",
      level: 60,
      x: 50,
      y: 80,
    };
    commit("新增灯具 " + fx.no, (d) => {
      d.fixtures.push(fx);
      d.seq.fix += 1;
    });
    setSelectedId(id);
  };

  const deleteFixture = (fx: Fixture) => {
    if (!confirm(`删除灯具 ${fx.no}？所有 Cue 中对它的引用会一并移除。`)) return;
    commit(`删除灯具 ${fx.no}`, (d) => {
      d.fixtures = d.fixtures.filter((f) => f.id !== fx.id);
      d.cues.forEach((c) => (c.refs = c.refs.filter((r) => r.id !== fx.id)));
    });
    setSelectedId(null);
  };

  const moveFixture = (id: string, x: number, y: number) => {
    const fx = show.fixtures.find((f) => f.id === id)!;
    commit(`移动 ${fx.no} 灯位`, (d) => {
      const f = d.fixtures.find((x2) => x2.id === id)!;
      f.x = x;
      f.y = y;
    });
  };

  const addCue = () => {
    const no = show.cues.length === 0 ? 1 : Math.max(...show.cues.map((c) => c.no)) + 1;
    const cue: Cue = {
      id: "cue" + (show.seq.cue + 1),
      no,
      name: "新 Cue " + no,
      note: "",
      trigger: "手动",
      refs: [],
    };
    commit(`新增 Cue Q${no}`, (d) => {
      d.cues.push(cue);
      d.seq.cue += 1;
    });
    setCurrentCueId(cue.id);
  };

  const deleteCue = (cue: Cue) => {
    if (!confirm(`删除 Cue Q${cue.no}「${cue.name}」？`)) return;
    commit(`删除 Cue Q${cue.no}`, (d) => {
      d.cues = d.cues.filter((c) => c.id !== cue.id);
    });
    if (currentCueId === cue.id) setCurrentCueId(null);
  };

  const swapCue = (cue: Cue, dir: -1 | 1) => {
    const idx = sortedCues.findIndex((c) => c.id === cue.id);
    const target = sortedCues[idx + dir];
    if (!target) return;
    commit(`调整 Q${cue.no} 触发顺序`, (d) => {
      const a = d.cues.find((c) => c.id === cue.id)!;
      const b = d.cues.find((c) => c.id === target.id)!;
      const t = a.no;
      a.no = b.no;
      b.no = t;
    });
  };

  const patchCue = (cue: Cue, label: string, patch: (c: Cue) => void) => {
    commit(label, (d) => patch(d.cues.find((c) => c.id === cue.id)!));
  };

  const setRefOverride = (
    cue: Cue,
    fxId: string,
    field: OverrideField,
    value: string | number | null,
    label: string
  ) => {
    commit(label, (d) => {
      const ref = d.cues.find((x) => x.id === cue.id)!.refs.find((r) => r.id === fxId);
      if (!ref) return;
      if (value === null) delete ref.overrides[field];
      else ref.overrides[field] = value;
    });
  };

  const addRef = (cue: Cue, fxId: string) => {
    const fx = show.fixtures.find((f) => f.id === fxId)!;
    commit(`Q${cue.no} 加入 ${fx.no}`, (d) => {
      const c = d.cues.find((x) => x.id === cue.id)!;
      if (c.refs.some((r) => r.id === fxId)) return;
      c.refs.push({ id: fxId, overrides: { level: fx.level || 60 } });
    });
  };

  const removeRef = (cue: Cue, refId: string) => {
    const fx = show.fixtures.find((f) => f.id === refId)!;
    commit(`Q${cue.no} 移除 ${fx.no}`, (d) => {
      d.cues.find((x) => x.id === cue.id)!.refs = d.cues.find((x) => x.id === cue.id)!.refs.filter((r) => r.id !== refId);
    });
  };

  /* ---------------- 版本备注 ---------------- */

  const saveVersion = () => {
    const v: Version = {
      id: "ver" + Date.now(),
      at: Date.now(),
      note: verNote.trim() || `排练版本 ${versions.length + 1}`,
      show: structuredClone(show),
    };
    const next = [v, ...versions].slice(0, VERSION_LIMIT);
    setVersions(next);
    saveVersions(next);
    setVerNote("");
    setToast("已保存版本快照：" + v.note);
  };

  const restoreVersion = (v: Version) => {
    if (!confirm(`恢复版本「${v.note}」？当前未存版本的改动将被覆盖（仍可从历史操作撤回）。`)) return;
    commit(`恢复版本：${v.note}`, (d) => {
      const s = structuredClone(v.show);
      d.title = s.title;
      d.fixtures = s.fixtures;
      d.cues = s.cues;
      d.seq = s.seq;
    });
    setToast("已恢复版本：" + v.note);
  };

  const deleteVersion = (id: string) => {
    const next = versions.filter((v) => v.id !== id);
    setVersions(next);
    saveVersions(next);
  };

  const resetAll = () => {
    if (!confirm("清空当前全部数据并恢复示例剧目？此操作本身也会进入历史，可再撤回。")) return;
    const seed = loadShow();
    localStorage.removeItem("qlight.show.v1");
    commit("重置为示例数据", (d) => {
      d.title = seed.title;
      d.fixtures = seed.fixtures;
      d.cues = seed.cues;
      d.seq = seed.seq;
    });
  };

  /* ---------------- 筛选 ---------------- */

  const q = query.trim().toLowerCase();
  const filtered = show.fixtures.filter((f) => {
    if (filter !== "全部" && f.type !== filter) return false;
    if (onlyInCue && currentCue && !currentCue.refs.some((r) => r.id === f.id)) return false;
    if (q && !`${f.no} ${f.name} ${f.channel}`.toLowerCase().includes(q)) return false;
    return true;
  });
  const dimIds = new Set(show.fixtures.filter((f) => !filtered.includes(f)).map((f) => f.id));

  const pendingFixture = pending ? show.fixtures.find((f) => f.id === pending.fixtureId)! : null;
  const unconfirmed = show.fixtures.filter((f) => !focusDef(f.focus)).length;
  const activeCount = currentCue
    ? currentCue.refs.filter((r) => {
        const fx = show.fixtures.find((f) => f.id === r.id);
        return fx && Number(eff(fx, currentCue, "level")) > 0;
      }).length
    : 0;

  return (
    <main className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo">◐</span>
          <div>
            <h1>灯位 · Cue 工作台</h1>
            <p>剧场灯光排练管理 · 数据保存在本机浏览器</p>
          </div>
        </div>
        <label className="show-title">
          <span>演出名称</span>
          <input
            defaultValue={show.title}
            key={"title-" + show.title}
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v && v !== show.title) commit("修改演出名称", (d) => (d.title = v));
            }}
          />
        </label>
      </header>

      <section className="metrics">
        <div className="metric"><small>灯具数量</small><strong>{show.fixtures.length}</strong></div>
        <div className="metric"><small>Cue 数量</small><strong>{show.cues.length}</strong></div>
        <div className="metric"><small>当前场景</small><strong>{currentCue ? `Q${currentCue.no}` : "—"}</strong></div>
        <div className="metric warn-metric"><small>待确认焦点</small><strong>{unconfirmed}</strong></div>
      </section>

      <div className="layout">
        {/* 左：筛选 + 灯具列表 + 灯具编辑 */}
        <aside className="col-left">
          <section className="panel">
            <h2>灯具筛选</h2>
            <input
              className="search"
              placeholder="搜索编号 / 名称 / 通道号"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <div className="chips">
              {(["全部", ...FIXTURE_TYPES] as FilterType[]).map((t) => {
                const n = t === "全部" ? show.fixtures.length : show.fixtures.filter((f) => f.type === t).length;
                return (
                  <button key={t} className={"chip" + (filter === t ? " on" : "")} onClick={() => setFilter(t)}>
                    {t !== "全部" && <i style={{ background: TYPE_COLORS[t as FixtureType] }} />}
                    {t}
                    <em>{n}</em>
                  </button>
                );
              })}
            </div>
            <label className="check">
              <input type="checkbox" checked={onlyInCue} onChange={(e) => setOnlyInCue(e.target.checked)} disabled={!currentCue} />
              只看当前 Cue 引用的灯
            </label>
          </section>

          <section className="panel fixture-panel">
            <div className="panel-head">
              <h2>灯具台账 <em>{filtered.length}/{show.fixtures.length}</em></h2>
              <button className="mini" onClick={addFixture}>＋ 新灯</button>
            </div>
            <ul className="fixture-list">
              {filtered.map((f) => {
                const ref = currentCue?.refs.find((r) => r.id === f.id);
                return (
                  <li
                    key={f.id}
                    className={"fixture-item" + (selectedId === f.id ? " sel" : "") + (ref ? " in-cue" : "")}
                    onClick={() => setSelectedId(f.id)}
                  >
                    <span className="dot" style={{ background: TYPE_COLORS[f.type] }} title={f.type} />
                    <div className="fx-main">
                      <b>{f.no}</b>
                      <small>CH{String(f.channel).padStart(3, "0")} · {f.name}</small>
                    </div>
                    <span className="gel-chip" title={f.gel}><i style={{ background: gelColor(f.gel) }} /></span>
                    {ref && <span className="lv">{eff(f, currentCue, "level")}%</span>}
                  </li>
                );
              })}
              {filtered.length === 0 && <li className="empty">没有符合筛选条件的灯具</li>}
            </ul>
          </section>

          {selected && (
            <FixtureEditor
              key={selected.id}
              fx={selected}
              cue={currentCue}
              onDelete={deleteFixture}
              onSave={requestBaseChange}
              commit={commit}
            />
          )}
        </aside>

        {/* 中：灯位图 + Cue 列表 */}
        <section className="col-center">
          <section className="panel map-panel">
            <div className="panel-head">
              <h2>舞台平面灯位图</h2>
              <span className="hint">拖动圆点调整灯位 · 点击查看灯具 · ✛ 为焦点预设</span>
            </div>
            <StageMap
              fixtures={show.fixtures}
              cue={currentCue}
              blackout={blackout}
              dimIds={dimIds}
              selectedId={selectedId}
              draggable
              onSelect={setSelectedId}
              onMove={moveFixture}
            />
          </section>

          <section className="panel cue-panel">
            <div className="panel-head">
              <h2>Cue 列表（触发顺序）</h2>
              <button className="mini" onClick={addCue}>＋ 新 Cue</button>
            </div>
            <ul className="cue-list">
              {sortedCues.map((c, i) => (
                <li key={c.id} className={"cue-item" + (currentCueId === c.id ? " sel" : "")} onClick={() => setCurrentCueId(c.id)}>
                  <div className="cue-no">Q{c.no}</div>
                  <div className="cue-main">
                    <b>{c.name}</b>
                    <small>
                      {c.trigger === "跟随" ? `跟随上一 Cue · ${c.followSec ?? 2}s` : "手动触发"} · {c.refs.length} 盏灯
                      {c.note ? ` · ${c.note}` : ""}
                    </small>
                  </div>
                  <div className="cue-ops" onClick={(e) => e.stopPropagation()}>
                    <button className="icon" disabled={i === 0} onClick={() => swapCue(c, -1)} title="前移">↑</button>
                    <button className="icon" disabled={i === sortedCues.length - 1} onClick={() => swapCue(c, 1)} title="后移">↓</button>
                    <button className="icon danger" onClick={() => deleteCue(c)} title="删除">×</button>
                  </div>
                </li>
              ))}
              {sortedCues.length === 0 && <li className="empty">还没有 Cue，点击右上角新建</li>}
            </ul>
          </section>
        </section>

        {/* 右：场景预览 + Cue 详情 + 版本/历史 */}
        <aside className="col-right">
          <section className="panel preview-panel">
            <div className="panel-head">
              <h2>场景预览</h2>
              <button className={"mini" + (blackout ? " warn-on" : "")} onClick={() => setBlackout((b) => !b)}>
                {blackout ? "解除 Blackout" : "Blackout"}
              </button>
            </div>
            {currentCue ? (
              <>
                <StageMap fixtures={show.fixtures} cue={currentCue} blackout={blackout} dark selectedId={selectedId} onSelect={setSelectedId} />
                <div className="preview-meta">
                  <b>Q{currentCue.no} {currentCue.name}</b>
                  <span>{blackout ? "BLACKOUT 中（预览不保存）" : `${activeCount} 盏亮灯 / 引用 ${currentCue.refs.length} 盏`}</span>
                </div>
                <ul className="lv-list">
                  {currentCue.refs
                    .map((r) => ({ r, fx: show.fixtures.find((f) => f.id === r.id) }))
                    .filter((x): x is { r: CueRef; fx: Fixture } => Boolean(x.fx))
                    .sort((a, b) => a.fx.channel - b.fx.channel)
                    .map(({ r, fx }) => {
                      const lv = blackout ? 0 : Number(eff(fx, currentCue, "level"));
                      const gel = eff(fx, currentCue, "gel");
                      return (
                        <li key={r.id} className={lv === 0 ? "off" : ""}>
                          <i className="gel-dot" style={{ background: gelColor(gel) }} />
                          <span className="lv-name">{fx.no}</span>
                          <span className="lv-bar"><i style={{ width: lv + "%", background: gelColor(gel) }} /></span>
                          <b>{lv}%</b>
                          <small>{eff(fx, currentCue, "focus")}</small>
                        </li>
                      );
                    })}
                </ul>
              </>
            ) : (
              <div className="preview-empty">
                <p>未选择 Cue</p>
                <span>在中间 Cue 列表中选择一个，预览灯光场景</span>
              </div>
            )}
          </section>

          {currentCue && (
            <CueDetail
              cue={currentCue}
              fixtures={show.fixtures}
              onPatch={patchCue}
              onSetOverride={setRefOverride}
              onAddRef={addRef}
              onRemoveRef={removeRef}
              live={live}
              recordAfter={recordAfter}
              snapshot={() => structuredClone(showRef.current)}
            />
          )}

          <section className="panel">
            <h2>版本备注</h2>
            <div className="ver-save">
              <input placeholder="如：联排后调整，二幕开场降 10%" value={verNote} onChange={(e) => setVerNote(e.target.value)} />
              <button className="primary mini" onClick={saveVersion}>存版本</button>
            </div>
            <ul className="ver-list">
              {versions.map((v) => (
                <li key={v.id}>
                  <div>
                    <b>{v.note}</b>
                    <small>
                      {new Date(v.at).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                      {" "}· {v.show.cues.length} Cue / {v.show.fixtures.length} 灯
                    </small>
                  </div>
                  <span className="ver-ops">
                    <button className="mini" onClick={() => restoreVersion(v)}>恢复</button>
                    <button className="mini ghost-x" onClick={() => deleteVersion(v.id)}>×</button>
                  </span>
                </li>
              ))}
              {versions.length === 0 && <li className="empty">尚未保存版本，排练节点建议随时存档</li>}
            </ul>

            <h2 className="hist-title">历史操作 <em>{history.length}</em></h2>
            <ul className="hist-list">
              {history.map((h, i) => (
                <li key={i}>
                  <span>{h.label}</span>
                  <button className="mini" onClick={() => undo(i)}>撤回</button>
                </li>
              ))}
              {history.length === 0 && <li className="empty">改动会记录在这里，可逐步撤回</li>}
            </ul>
            <button className="reset-link" onClick={resetAll}>重置为示例数据</button>
          </section>
        </aside>
      </div>

      {pending && pendingFixture && (
        <ImpactDialog
          fixture={pendingFixture}
          field={pending.field}
          newValue={pending.value}
          items={pending.items}
          currentCueId={currentCueId}
          onClose={() => setPending(null)}
          onCommit={(mode) => (mode === "current" ? commitCurrentOnly() : commitSyncAll())}
        />
      )}
      {toast && <div className="toast">{toast}</div>}
    </main>
  );
}

/* ================= 灯具编辑面板 ================= */

function FixtureEditor({
  fx,
  cue,
  onDelete,
  onSave,
  commit,
}: {
  fx: Fixture;
  cue: Cue | null;
  onDelete: (fx: Fixture) => void;
  onSave: (fxId: string, field: "channel" | "gel", value: string | number) => void;
  commit: (label: string, produce: (d: Show) => void) => void;
}) {
  const [channel, setChannel] = useState(String(fx.channel));
  const [gel, setGel] = useState(fx.gel);
  const [baseLevel, setBaseLevel] = useState(fx.level);
  useEffect(() => {
    setChannel(String(fx.channel));
    setGel(fx.gel);
    setBaseLevel(fx.level);
  }, [fx.id, fx.channel, fx.gel, fx.level]);

  const chDirty = channel !== "" && Number(channel) !== fx.channel;
  const gelDirty = gel !== fx.gel;

  return (
    <section className="panel editor">
      <div className="panel-head">
        <h2>灯具详情</h2>
        <button className="mini danger-text" onClick={() => onDelete(fx)}>删除</button>
      </div>

      <div className="form-grid">
        <label>
          <span>编号</span>
          <input
            defaultValue={fx.no}
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v && v !== fx.no) commit(`修改编号 ${fx.no} → ${v}`, (d) => (d.fixtures.find((f) => f.id === fx.id)!.no = v));
            }}
          />
        </label>
        <label>
          <span>名称</span>
          <input
            defaultValue={fx.name}
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v && v !== fx.name) commit(`修改 ${fx.no} 名称`, (d) => (d.fixtures.find((f) => f.id === fx.id)!.name = v));
            }}
          />
        </label>
        <label>
          <span>类型</span>
          <select
            value={fx.type}
            onChange={(e) =>
              commit(`${fx.no} 类型改为 ${e.target.value}`, (d) => {
                d.fixtures.find((f) => f.id === fx.id)!.type = e.target.value as FixtureType;
              })
            }
          >
            {FIXTURE_TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </label>
        <label>
          <span>基础亮度 {baseLevel}%</span>
          <input
            type="range"
            min={0}
            max={100}
            value={baseLevel}
            onChange={(e) => setBaseLevel(Number(e.target.value))}
            onPointerUp={() => {
              if (baseLevel !== fx.level)
                commit(`${fx.no} 基础亮度改为 ${baseLevel}%`, (d) => void (d.fixtures.find((f) => f.id === fx.id)!.level = baseLevel));
            }}
            onBlur={() => {
              if (baseLevel !== fx.level)
                commit(`${fx.no} 基础亮度改为 ${baseLevel}%`, (d) => void (d.fixtures.find((f) => f.id === fx.id)!.level = baseLevel));
            }}
          />
        </label>
      </div>

      <div className={"impact-field" + (chDirty || gelDirty ? " dirty" : "")}>
        <label className="ch-edit">
          <span>通道号</span>
          <input type="number" min={1} max={512} value={channel} onChange={(e) => setChannel(e.target.value)} />
        </label>
        <label>
          <span>色片</span>
          <select value={gel} onChange={(e) => setGel(e.target.value)}>
            {GELS.map((g) => <option key={g.code} value={g.code}>{g.code} · {g.name}</option>)}
          </select>
        </label>
        <button
          className="primary"
          disabled={!chDirty && !gelDirty}
          onClick={() => {
            // 一次只提交一个字段（通道优先）；另一项保持未保存，可再次点保存
            if (chDirty) onSave(fx.id, "channel", Number(channel));
            else if (gelDirty) onSave(fx.id, "gel", gel);
          }}
        >
          检查引用并保存
        </button>
      </div>
      {(chDirty || gelDirty) && <p className="warn-text">通道/色片被多个 Cue 引用时，会先列出受影响项，再选择「只处理当前 Cue」或「同步全部」。</p>}

      <label className="full">
        <span>焦点位置{!focusDef(fx.focus) && <em className="warn"> 未匹配预设，待确认</em>}</span>
        <input
          list="focus-list-editor"
          defaultValue={fx.focus}
          onBlur={(e) => {
            const v = e.target.value.trim();
            if (v && v !== fx.focus) commit(`${fx.no} 焦点改为 ${v}`, (d) => void (d.fixtures.find((f) => f.id === fx.id)!.focus = v));
          }}
        />
        <datalist id="focus-list-editor">
          {FOCI.map((f) => <option key={f.name} value={f.name} />)}
        </datalist>
      </label>

      <p className="pos-text">
        灯位坐标 X{fx.x.toFixed(1)} / Y{fx.y.toFixed(1)}，可直接在灯位图上拖动调整
        {cue && cue.refs.some((r) => r.id === fx.id) && <>；当前 <b>Q{cue.no}</b> 引用此灯，可在右下 Cue 详情中设置独立值</>}
      </p>
    </section>
  );
}

/* ================= Cue 详情面板 ================= */

function CueDetail({
  cue,
  fixtures,
  onPatch,
  onSetOverride,
  onAddRef,
  onRemoveRef,
  live,
  recordAfter,
  snapshot,
}: {
  cue: Cue;
  fixtures: Fixture[];
  onPatch: (cue: Cue, label: string, patch: (c: Cue) => void) => void;
  onSetOverride: (cue: Cue, fxId: string, field: OverrideField, value: string | number | null, label: string) => void;
  onAddRef: (cue: Cue, fxId: string) => void;
  onRemoveRef: (cue: Cue, fxId: string) => void;
  live: (produce: (d: Show) => void) => void;
  recordAfter: (before: Show, label: string) => void;
  snapshot: () => Show;
}) {
  const [addId, setAddId] = useState("");
  const beforeRef = useRef<Show | null>(null);
  const usedIds = new Set(cue.refs.map((r) => r.id));

  const fieldCell = (fx: Fixture, ref: CueRef, field: OverrideField, content: ReactNode) => {
    const ov = overrideFields(ref).has(field);
    return (
      <span className={"cell" + (ov ? " override" : "")}>
        {content}
        {ov && (
          <button
            className="clear-ov"
            title="清除独立值，恢复继承基础值"
            onClick={() => onSetOverride(cue, fx.id, field, null, `Q${cue.no} 中 ${fx.no} 恢复继承基础值`)}
          >
            ↺
          </button>
        )}
      </span>
    );
  };

  return (
    <section className="panel cue-detail">
      <div className="panel-head">
        <h2>Cue 详情 Q{cue.no}</h2>
      </div>
      <div className="cue-head-grid">
        <label className="span2">
          <span>Cue 名称</span>
          <input
            defaultValue={cue.name}
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v && v !== cue.name) onPatch(cue, `Q${cue.no} 改名`, (c) => (c.name = v));
            }}
          />
        </label>
        <label>
          <span>触发方式</span>
          <select value={cue.trigger} onChange={(e) => onPatch(cue, `Q${cue.no} 触发方式`, (c) => void (c.trigger = e.target.value as Cue["trigger"]))}>
            <option>手动</option>
            <option>跟随</option>
          </select>
        </label>
        {cue.trigger === "跟随" && (
          <label>
            <span>跟随秒数</span>
            <input
              type="number"
              min={0}
              step={0.5}
              defaultValue={cue.followSec ?? 2}
              onBlur={(e) => {
                const v = e.target.value;
                if (v !== String(cue.followSec ?? 2)) onPatch(cue, `Q${cue.no} 跟随时间`, (c) => void (c.followSec = Number(v)));
              }}
            />
          </label>
        )}
        <label className="span2">
          <span>备注</span>
          <input
            defaultValue={cue.note}
            placeholder="走位、节奏等提醒"
            onBlur={(e) => {
              const v = e.target.value;
              if (v !== cue.note) onPatch(cue, `Q${cue.no} 备注`, (c) => (c.note = v));
            }}
          />
        </label>
      </div>

      <ul className="ref-list">
        {cue.refs.map((ref) => {
          const fx = fixtures.find((f) => f.id === ref.id);
          if (!fx) return null;
          const lv = Number(eff(fx, cue, "level"));
          const gel = eff(fx, cue, "gel");
          const focus = eff(fx, cue, "focus");
          const gelOv = overrideFields(ref).has("gel");
          const focusOv = overrideFields(ref).has("focus");
          return (
            <li key={ref.id}>
              <div className="ref-title">
                <i className="gel-dot" style={{ background: gelColor(gel) }} />
                <b>{fx.no}</b>
                <small>{fx.name} · CH{String(eff(fx, cue, "channel")).padStart(3, "0")}</small>
                <button className="mini danger-text" onClick={() => onRemoveRef(cue, fx.id)}>移出</button>
              </div>
              <div className="ref-row">
                {fieldCell(
                  fx,
                  ref,
                  "level",
                  <label className="lv-edit">
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={lv}
                      onPointerDown={() => (beforeRef.current = snapshot())}
                      onChange={(e) =>
                        live((d) => {
                          const r = d.cues.find((x) => x.id === cue.id)!.refs.find((x) => x.id === fx.id)!;
                          r.overrides.level = Number(e.target.value);
                        })
                      }
                      onPointerUp={() => {
                        if (beforeRef.current) {
                          recordAfter(beforeRef.current, `Q${cue.no} 调整 ${fx.no} 亮度`);
                          beforeRef.current = null;
                        }
                      }}
                    />
                    <b>{lv}%</b>
                  </label>
                )}
                {fieldCell(
                  fx,
                  ref,
                  "gel",
                  <select
                    value={gelOv ? gel : ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === "") onSetOverride(cue, fx.id, "gel", null, `Q${cue.no} 中 ${fx.no} 色片恢复继承`);
                      else onSetOverride(cue, fx.id, "gel", v, `Q${cue.no} 中 ${fx.no} 色片改为 ${v}`);
                    }}
                  >
                    <option value="">继承（{fx.gel}）</option>
                    {GELS.map((g) => <option key={g.code} value={g.code}>{g.code} · {g.name}</option>)}
                  </select>
                )}
                {fieldCell(
                  fx,
                  ref,
                  "focus",
                  <RefFocusCell
                    inherited={fx.focus}
                    value={focusOv ? focus : ""}
                    onApply={(v) => onSetOverride(cue, fx.id, "focus", v, `Q${cue.no} 中 ${fx.no} 焦点改为 ${v}`)}
                    onClear={() => onSetOverride(cue, fx.id, "focus", null, `Q${cue.no} 中 ${fx.no} 焦点恢复继承`)}
                  />
                )}
              </div>
            </li>
          );
        })}
        {cue.refs.length === 0 && <li className="empty">该 Cue 还没有引用灯具，从下方添加</li>}
      </ul>
      <datalist id="focus-list-cue">
        {FOCI.map((f) => <option key={f.name} value={f.name} />)}
      </datalist>

      <div className="add-ref">
        <select value={addId} onChange={(e) => setAddId(e.target.value)}>
          <option value="">添加灯具到本 Cue…</option>
          {fixtures
            .filter((f) => !usedIds.has(f.id))
            .map((f) => <option key={f.id} value={f.id}>{f.no} · {f.name} · CH{String(f.channel).padStart(3, "0")}</option>)}
        </select>
        <button className="mini" disabled={!addId} onClick={() => { if (addId) { onAddRef(cue, addId); setAddId(""); } }}>加入</button>
      </div>
      <p className="hint">带「独立值」标记的字段不随灯具基础值变化；点 ↺ 恢复继承。</p>
    </section>
  );
}

/** Cue 内单盏灯的焦点：空值表示继承，失焦/回车提交，支持自定义点名 */
function RefFocusCell({
  inherited,
  value,
  onApply,
  onClear,
}: {
  inherited: string;
  value: string;
  onApply: (v: string) => void;
  onClear: () => void;
}) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <span className="focus-cell">
      <input
        list="focus-list-cue"
        value={text}
        placeholder={"继承（" + inherited + "）"}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          const v = text.trim();
          if (v && v !== value) onApply(v);
          else if (!v && value) onClear();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
      />
    </span>
  );
}
