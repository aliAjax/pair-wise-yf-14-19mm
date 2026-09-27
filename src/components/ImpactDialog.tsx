import type { Cue, Fixture, OverrideField } from "../types";
import { eff, gelColor } from "../types";

export interface ImpactItem {
  cue: Cue;
  kind: "override" | "inherit";
  old: string | number;
}

interface Props {
  fixture: Fixture;
  field: OverrideField & ("channel" | "gel");
  newValue: string | number;
  items: ImpactItem[];
  currentCueId: string | null;
  onCommit: (mode: "current" | "all") => void;
  onClose: () => void;
}

const FIELD_LABEL: Record<string, string> = {
  channel: "通道号",
  gel: "色片",
};

function Val({ field, value }: { field: string; value: string | number }) {
  if (field === "channel") return <>CH {String(value)}</>;
  return (
    <span className="gel-val">
      <i style={{ background: gelColor(String(value)) }} />
      {String(value)}
    </span>
  );
}

export default function ImpactDialog({
  fixture,
  field,
  newValue,
  items,
  currentCueId,
  onCommit,
  onClose,
}: Props) {
  const label = FIELD_LABEL[field];
  const currentRefsCurrentCue =
    currentCueId != null && items.some((it) => it.cue.id === currentCueId);
  const currentCue = items.find((it) => it.cue.id === currentCueId)?.cue ?? null;

  return (
    <div className="modal-mask" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal impact">
        <header>
          <h2>改动会被多个 Cue 引用</h2>
          <button className="icon-btn" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </header>

        <p className="impact-sub">
          灯具 <b>{fixture.no}</b>（{fixture.name}）的<b>{label}</b>
          被 <b>{items.length}</b> 个 Cue 引用。基础值将改为：
          <Val field={field} value={newValue} />
          <span className="impact-note">两种方式都会保留各 Cue 的旧值，之后可从「历史操作」一键撤回。</span>
        </p>

        <div className="impact-list">
          <div className="impact-row impact-head">
            <span>引用该灯的 Cue</span>
            <span>旧值来源</span>
            <span>旧值</span>
          </div>
          {items
            .slice()
            .sort((a, b) => a.cue.no - b.cue.no)
            .map((it) => (
              <div
                key={it.cue.id}
                className={"impact-row" + (it.cue.id === currentCueId ? " is-current" : "")}
              >
                <span>
                  Q{it.cue.no} {it.cue.name}
                  {it.cue.id === currentCueId && <em className="tag-now">当前</em>}
                </span>
                <span>
                  {it.kind === "override" ? (
                    <em className="tag-over">独立值</em>
                  ) : (
                    <em className="tag-inherit">继承基础值</em>
                  )}
                </span>
                <span className="old-val">
                  <Val field={field} value={it.old} />
                </span>
              </div>
            ))}
        </div>

        <div className="impact-actions">
          <button className="ghost" onClick={onClose}>
            取消
          </button>
          <button
            className="secondary"
            disabled={!currentRefsCurrentCue}
            title={currentRefsCurrentCue ? "" : "当前选中的 Cue 未引用这盏灯"}
            onClick={() => onCommit("current")}
          >
            只处理当前 Cue
            {currentCue ? (
              <small>
                基础值改为新值，仅 Q{currentCue.no} 锁定旧{label}；其余 {
                  items.filter((i) => i.cue.id !== currentCue.id).length
                }
                个 Cue 保持各自当前值不变
              </small>
            ) : (
              <small>请先在右侧选中一个引用该灯的 Cue</small>
            )}
          </button>
          <button className="primary" onClick={() => onCommit("all")}>
            同步全部引用
            <small>基础值与全部引用统一为新值，旧值进入历史可撤回</small>
          </button>
        </div>
      </div>
    </div>
  );
}

// 供 App 构造 ImpactItem 时复用：取某 Cue 下该字段的生效值与来源
export function buildImpactItem(fx: Fixture, cue: Cue, field: OverrideField): ImpactItem {
  const ref = cue.refs.find((r) => r.id === fx.id);
  const ov = ref?.overrides[field];
  return {
    cue,
    kind: ov === undefined ? "inherit" : "override",
    old: (ov === undefined ? fx[field] : ov) as string | number,
  };
}

export function impactOldFor(fx: Fixture, cue: Cue | null, field: OverrideField) {
  return cue ? eff(fx, cue, field) : fx[field];
}
