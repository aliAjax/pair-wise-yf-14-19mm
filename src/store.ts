import type { Show, Version } from "./types";

const SHOW_KEY = "qlight.show.v1";
const VERSION_KEY = "qlight.versions.v1";
export const VERSION_LIMIT = 30;

export function loadShow(): Show {
  try {
    const raw = localStorage.getItem(SHOW_KEY);
    if (raw) return JSON.parse(raw) as Show;
  } catch {
    /* 损坏数据退回示例 */
  }
  return seedShow();
}

export function saveShow(show: Show): void {
  localStorage.setItem(SHOW_KEY, JSON.stringify(show));
}

export function loadVersions(): Version[] {
  try {
    const raw = localStorage.getItem(VERSION_KEY);
    if (raw) return JSON.parse(raw) as Version[];
  } catch {
    /* ignore */
  }
  return [];
}

export function saveVersions(list: Version[]): void {
  localStorage.setItem(VERSION_KEY, JSON.stringify(list.slice(0, VERSION_LIMIT)));
}

/* ---------------- 示例数据：一出带 12 盏灯、4 个 Cue 的小剧场剧目 ---------------- */

function seedShow(): Show {
  const f = (
    no: string,
    name: string,
    type: Show["fixtures"][number]["type"],
    channel: number,
    gel: string,
    focus: string,
    level: number,
    x: number,
    y: number
  ): Show["fixtures"][number] => ({
    id: "fx" + channel,
    no,
    name,
    type,
    channel,
    gel,
    focus,
    level,
    x,
    y,
  });

  const fixtures = [
    f("FOH-01", "面光成像灯 1", "面光", 1, "L201", "表演区-前左", 70, 26, 90),
    f("FOH-02", "面光成像灯 2", "面光", 2, "L201", "表演区-前中", 75, 50, 92),
    f("FOH-03", "面光成像灯 3", "面光", 3, "L201", "表演区-前右", 70, 74, 90),
    f("SL-01", "左侧耳光", "侧光", 11, "R80", "台口-左", 55, 6, 60),
    f("SL-02", "左侧光架", "侧光", 12, "R68", "表演区-后中", 45, 6, 34),
    f("SR-01", "右侧耳光", "侧光", 21, "R80", "台口-右", 55, 94, 60),
    f("SR-02", "右侧光架", "侧光", 22, "R68", "表演区-后中", 45, 94, 34),
    f("BL-01", "逆光吊杆 1", "逆光", 31, "R357", "舞台中心", 60, 30, 10),
    f("BL-02", "逆光吊杆 2", "逆光", 32, "R382", "舞台中心", 60, 50, 8),
    f("BL-03", "逆光吊杆 3", "逆光", 33, "R357", "舞台中心", 60, 70, 10),
    f("FS-01", "追光（门口）", "追光", 41, "R10", "门口", 0, 86, 86),
    f("PX-01", "染色帕灯", "效果光", 51, "R91", "表演区-后中", 30, 50, 4),
  ];

  const cues: Show["cues"] = [
    {
      id: "cue1",
      no: 1,
      name: "开场·冷蓝幕启",
      note: "二幕开场，观众落座后推起",
      trigger: "手动",
      refs: fixtures
        .filter((x) => [1, 2, 3].includes(x.channel))
        .map((x) => ({ id: x.id, overrides: { level: 40, gel: "R80" } })),
    },
    {
      id: "cue2",
      no: 12,
      name: "冷蓝侧光",
      note: "主角独白，两侧光渐显",
      trigger: "跟随",
      followSec: 3,
      refs: [
        { id: "fx11", overrides: { level: 65 } },
        { id: "fx21", overrides: { level: 65 } },
        { id: "fx2", overrides: { level: 25, gel: "R68", focus: "舞台中心" } },
      ],
    },
    {
      id: "cue3",
      no: 18,
      name: "追光入场",
      note: "FS-01 追至门口，需演员走位确认焦点",
      trigger: "手动",
      refs: [
        { id: "fx41", overrides: { level: 95, focus: "门口" } },
        { id: "fx11", overrides: { level: 20 } },
        { id: "fx21", overrides: { level: 20 } },
      ],
    },
    {
      id: "cue4",
      no: 24,
      name: "暖色谢幕",
      note: "全台面光 80%，暖调",
      trigger: "手动",
      refs: fixtures
        .filter((x) => x.type === "面光")
        .map((x) => ({ id: x.id, overrides: { level: 80, gel: "R08" } }))
        .concat([
          { id: "fx31", overrides: { level: 50, gel: "R21" } },
          { id: "fx32", overrides: { level: 50, gel: "R21" } },
          { id: "fx33", overrides: { level: 50, gel: "R21" } },
        ]),
    },
  ];

  return { title: "未命名剧目", fixtures, cues, seq: { fix: 100, cue: 100, ver: 1 } };
}
