import { useRef, useState } from "react";
import type { Cue, Fixture, FixtureType } from "../types";
import { eff, focusDef, gelColor } from "../types";

export const TYPE_COLORS: Record<FixtureType, string> = {
  面光: "#f59e0b",
  侧光: "#38bdf8",
  逆光: "#c084fc",
  顶光: "#f472b6",
  追光: "#facc15",
  效果光: "#34d399",
};

/** 存储坐标 y 为 0..100，SVG viewBox 高 64 */
const sy = (y: number) => y * 0.64;

interface Props {
  fixtures: Fixture[];
  cue: Cue | null;
  blackout?: boolean;
  dimIds?: Set<string>;
  selectedId?: string | null;
  dark?: boolean;
  draggable?: boolean;
  onSelect?: (id: string) => void;
  onMove?: (id: string, x: number, y: number) => void;
}

export default function StageMap({
  fixtures,
  cue,
  blackout = false,
  dimIds,
  selectedId,
  dark = false,
  draggable = false,
  onSelect,
  onMove,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  const toSvgPoint = (e: React.PointerEvent) => {
    const svg = svgRef.current!;
    const rect = svg.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const ySvg = ((e.clientY - rect.top) / rect.height) * 64;
    return { x: Math.min(98, Math.max(2, x)), y: Math.min(98, Math.max(2, ySvg / 0.64)) };
  };

interface Beam {
  fx: Fixture;
  level: number;
  color: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  focusName: string;
}

  const beams: Beam[] = (cue
    ? cue.refs.map((ref): Beam | null => {
        const fx = fixtures.find((f) => f.id === ref.id);
        if (!fx) return null;
        const level = blackout ? 0 : Number(eff(fx, cue, "level"));
        const gel = eff(fx, cue, "gel");
        const focusName = eff(fx, cue, "focus");
        const fd = focusDef(focusName);
        return { fx, level, color: gelColor(gel), x1: fx.x, y1: sy(fx.y), x2: fd?.x ?? 50, y2: sy(fd?.y ?? 36), focusName };
      })
    : []
  ).filter((b): b is Beam => Boolean(b));

  return (
    <svg
      ref={svgRef}
      viewBox="0 0 100 64"
      className={"stage-map" + (dark ? " dark" : "")}
      onPointerMove={(e) => {
        if (!dragId) return;
        const p = toSvgPoint(e);
        // 仅拖动视觉，松手才落库
        const el = document.getElementById("map-dot-" + dragId);
        if (el) el.setAttribute("transform", `translate(${p.x} ${sy(p.y)})`);
      }}
      onPointerUp={(e) => {
        if (dragId) {
          const p = toSvgPoint(e);
          onMove?.(dragId, Math.round(p.x * 10) / 10, Math.round(p.y * 10) / 10);
          setDragId(null);
        }
      }}
    >
      <defs>
        <radialGradient id="spotGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.9" />
          <stop offset="45%" stopColor="#fff" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* 舞台 */}
      <rect x="3" y="3" width="94" height="52" rx="1.5" className="stage-floor" />
      <line x1="3" y1="55" x2="97" y2="55" className="apron-line" />
      <text x="50" y="61.5" textAnchor="middle" className="map-label audience">
        观 众 席（台口）
      </text>
      <text x="50" y="6.2" textAnchor="middle" className="map-label">
        天幕 / 逆光吊杆
      </text>

      {/* 焦点预设点 */}
      {[
        [50, 48],
        [30, 47],
        [70, 47],
        [50, 24],
        [16, 52],
        [84, 52],
        [92, 12],
        [50, 36],
      ].map(([x, y], i) => (
        <path
          key={i}
          d={`M ${x} ${sy(y) - 1.1} L ${x} ${sy(y) + 1.1} M ${x - 1.1} ${sy(y)} L ${x + 1.1} ${sy(y)}`}
          className="focus-cross"
        />
      ))}

      {/* 光束 */}
      {beams
        .filter((b) => b.level > 0)
        .map((b) => {
          const dx = b.x2 - b.x1;
          const dy = b.y2 - b.y1;
          const len = Math.hypot(dx, dy) || 1;
          const nx = (-dy / len) * 0.9;
          const ny = (dx / len) * 0.9;
          const nx2 = (-dy / len) * 4.2;
          const ny2 = (dx / len) * 2.2;
          const o = b.level / 100;
          return (
            <g key={"beam-" + b.fx.id} className="beam">
              <polygon
                points={`${b.x1 + nx},${b.y1 + ny} ${b.x1 - nx},${b.y1 - ny} ${b.x2 - nx2},${b.y2 - ny2} ${b.x2 + nx2},${b.y2 + ny2}`}
                fill={b.color}
                opacity={dark ? 0.28 * o : 0.16 * o}
              />
              <line x1={b.x1} y1={b.y1} x2={b.x2} y2={b.y2} stroke={b.color} strokeWidth={0.5} opacity={0.55 * o} />
              <ellipse cx={b.x2} cy={b.y2} rx={dark ? 9 : 5.5} ry={dark ? 4.6 : 2.8} fill="url(#spotGlow)" opacity={0.5 * o} />
              <ellipse cx={b.x2} cy={b.y2} rx={4.2} ry={2.1} fill={b.color} opacity={0.4 * o} />
            </g>
          );
        })}

      {/* 灯具 */}
      {fixtures.map((fx) => {
        const lit =
          cue && !blackout && cue.refs.some((r) => r.id === fx.id && Number(eff(fx, cue, "level")) > 0);
        const dim = dimIds?.has(fx.id);
        const gel = cue ? eff(fx, cue, "gel") : fx.gel;
        return (
          <g
            key={fx.id}
            id={"map-dot-" + fx.id}
            transform={`translate(${fx.x} ${sy(fx.y)})`}
            className={"fixture-dot" + (selectedId === fx.id ? " selected" : "") + (dim ? " dim" : "")}
            onClick={() => onSelect?.(fx.id)}
            onPointerDown={(e) => {
              if (!draggable) return;
              (e.target as Element).setPointerCapture?.(e.pointerId);
              setDragId(fx.id);
            }}
            style={{ cursor: draggable ? "grab" : "pointer" }}
          >
            <title>{`${fx.no} ${fx.name}｜CH${fx.channel}｜${fx.gel}｜${fx.focus}`}</title>
            {selectedId === fx.id && <circle r="3.4" className="fixture-ring" />}
            <circle
              r="2.1"
              fill={lit ? gelColor(gel) : dark ? "#334155" : "#fff"}
              stroke={TYPE_COLORS[fx.type]}
              strokeWidth="1.1"
            />
            <text x="2.8" y="1" className="fixture-label">
              {fx.no}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
