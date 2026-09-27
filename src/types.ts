export type FixtureType = "面光" | "侧光" | "逆光" | "顶光" | "追光" | "效果光";

export const FIXTURE_TYPES: FixtureType[] = ["面光", "侧光", "逆光", "顶光", "追光", "效果光"];

/** 可被单个 Cue 覆盖的灯具字段（通道、色片、焦点、亮度） */
export type OverrideField = "channel" | "gel" | "focus" | "level";

export interface CueRef {
  id: string;
  overrides: Partial<Record<OverrideField, string | number>>;
}

export interface Fixture {
  id: string;
  no: string; // 灯具编号，如 FOH-01
  name: string;
  type: FixtureType;
  channel: number; // 通道号（DMX）
  gel: string; // 色片（色号，如 R80）
  focus: string; // 焦点位置（预设点名或自定义）
  level: number; // 亮度预设 0-100
  x: number; // 灯位图坐标 0-100
  y: number;
}

export interface Cue {
  id: string;
  no: number; // Cue 编号（触发顺序，可重排）
  name: string;
  note: string;
  trigger: "手动" | "跟随";
  followSec?: number;
  refs: CueRef[];
}

export interface Show {
  title: string;
  fixtures: Fixture[];
  cues: Cue[];
  seq: Record<"fix" | "cue" | "ver", number>;
}

export interface Version {
  id: string;
  at: number;
  note: string;
  show: Show;
}

export interface HistoryEntry {
  label: string;
  before: Show;
  after: Show;
}

/* ---------------- 色片库（Roscolux 常用色号） ---------------- */

export interface GelDef {
  code: string;
  name: string;
  color: string;
}

export const GELS: GelDef[] = [
  { code: "R08", name: "淡琥珀", color: "#ffd27d" },
  { code: "R13", name: "浅草莓", color: "#ff9db0" },
  { code: "R19", name: "烈火", color: "#ff5a3c" },
  { code: "R21", name: "金黄", color: "#ffb300" },
  { code: "R26", name: "亮红", color: "#e01b24" },
  { code: "R33", name: "红铜", color: "#c8642e" },
  { code: "R357", name: "皇家玫瑰", color: "#d94f92" },
  { code: "R382", name: "洋红", color: "#c73dff" },
  { code: "R49", name: "中紫", color: "#8652e0" },
  { code: "R68", name: "天青蓝", color: "#63a0f5" },
  { code: "R80", name: "初蓝", color: "#2f6fe0" },
  { code: "R74", name: "夜蓝", color: "#1b2a8f" },
  { code: "R90", name: "深黄绿", color: "#69b04a" },
  { code: "R91", name: "初级绿", color: "#2fc46a" },
  { code: "R389", name: "铬绿", color: "#1f9e63" },
  { code: "R10", name: "中黄", color: "#ffe14d" },
  { code: "L201", name: "CTB 全蓝", color: "#cfe4ff" },
];

export const gelDef = (code: string): GelDef | undefined =>
  GELS.find((g) => g.code.toLowerCase() === code.trim().toLowerCase());

export const gelColor = (code: string): string => gelDef(code)?.color ?? "#8b97a8";

/* ---------------- 焦点预设（舞台平面坐标，viewBox 0..100 x 0..64） ---------------- */

export interface FocusDef {
  name: string;
  x: number;
  y: number;
}

export const FOCI: FocusDef[] = [
  { name: "表演区-前中", x: 50, y: 48 },
  { name: "表演区-前左", x: 30, y: 47 },
  { name: "表演区-前右", x: 70, y: 47 },
  { name: "表演区-后中", x: 50, y: 24 },
  { name: "台口-左", x: 16, y: 52 },
  { name: "台口-右", x: 84, y: 52 },
  { name: "门口", x: 92, y: 12 },
  { name: "舞台中心", x: 50, y: 36 },
];

export const focusDef = (name: string): FocusDef | undefined =>
  FOCI.find((f) => f.name === name);

/* ---------------- 生效值（Cue 覆盖优先，否则取灯具基础值） ---------------- */

export function eff<K extends OverrideField>(
  fx: Fixture,
  cue: Cue | null,
  key: K
): Fixture[K] {
  const ref = cue?.refs.find((r) => r.id === fx.id);
  const v = ref?.overrides[key];
  return (v === undefined ? fx[key] : v) as Fixture[K];
}

/** 当前 Cue 中，某盏灯哪些字段有独立值 */
export function overrideFields(ref: CueRef | undefined): Set<OverrideField> {
  const s = new Set<OverrideField>();
  if (!ref) return s;
  (Object.keys(ref.overrides) as OverrideField[]).forEach((k) => s.add(k));
  return s;
}
