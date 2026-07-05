export type EconomicsGraphTemplateId = "demand-supply" | "monopoly-mr-mc" | "cost-curves";

export type EconomicsGraphElementKind = "area" | "curve" | "guide" | "point";

export interface EconomicsGraphElement {
  id: string;
  kind: EconomicsGraphElementKind;
  label: string;
  color: string;
  description: string;
  examHint: string;
  formula?: string;
  path?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  labelX?: number;
  labelY?: number;
  dashed?: boolean;
}

export interface EconomicsGraphTemplate {
  id: EconomicsGraphTemplateId;
  title: string;
  subtitle: string;
  xLabel: string;
  yLabel: string;
  viewBox: string;
  overview: string;
  defaultElementId: string;
  elements: EconomicsGraphElement[];
}

export interface EconomicsGraphSpec {
  template: EconomicsGraphTemplateId;
  title?: string;
  focus: string[];
}

export type EconomicsGraphParseResult =
  | { ok: true; spec: EconomicsGraphSpec }
  | { ok: false; message: string };

const templateAliases: Record<string, EconomicsGraphTemplateId> = {
  "demand-supply": "demand-supply",
  supply: "demand-supply",
  demand: "demand-supply",
  equilibrium: "demand-supply",
  "monopoly-mr-mc": "monopoly-mr-mc",
  monopoly: "monopoly-mr-mc",
  "mr-mc": "monopoly-mr-mc",
  "cost-curves": "cost-curves",
  cost: "cost-curves",
  costs: "cost-curves",
};

export const economicsGraphTemplates: EconomicsGraphTemplate[] = [
  {
    id: "demand-supply",
    title: "需求与供给均衡",
    subtitle: "价格调整会把市场推向需求量等于供给量的位置。",
    xLabel: "数量 Q",
    yLabel: "价格 P",
    viewBox: "0 0 640 420",
    overview: "这张图用同一个坐标系表达需求曲线、供给曲线和均衡点。复习时重点看清楚：价格在纵轴，数量在横轴，均衡不是任意交点，而是买方愿买量和卖方愿卖量相等的位置。",
    defaultElementId: "equilibrium",
    elements: [
      {
        id: "demand",
        kind: "curve",
        label: "D 需求曲线",
        color: "#2563eb",
        path: "M126 92 C226 128 362 230 526 326",
        labelX: 500,
        labelY: 323,
        description: "需求曲线向右下方倾斜，表示其他条件不变时，价格越低，消费者愿意购买的数量越多。",
        examHint: "看到需求曲线移动时，先判断是不是非价格因素变化；价格本身变化通常表现为沿着同一条需求曲线移动。",
      },
      {
        id: "supply",
        kind: "curve",
        label: "S 供给曲线",
        color: "#dc2626",
        path: "M130 322 C244 263 360 173 522 88",
        labelX: 505,
        labelY: 94,
        description: "供给曲线向右上方倾斜，表示价格越高，生产者越愿意提供更多数量。",
        examHint: "供给曲线移动通常来自成本、技术、税收、补贴或生产者预期变化，而不是商品自身价格变化。",
      },
      {
        id: "equilibrium",
        kind: "point",
        label: "E 均衡点",
        color: "#111827",
        x: 326,
        y: 211,
        labelX: 338,
        labelY: 204,
        description: "均衡点是需求曲线和供给曲线的交点。这里对应的价格是均衡价格，对应的数量是均衡数量。",
        examHint: "考试解释均衡变化时，按“曲线移动 -> 新交点 -> 价格和数量变化”的顺序写，最稳。",
      },
      {
        id: "p-star",
        kind: "guide",
        label: "P* 均衡价格",
        color: "#6b7280",
        path: "M80 211 L326 211",
        labelX: 50,
        labelY: 216,
        dashed: true,
        description: "P* 是均衡点投影到价格轴得到的价格。",
        examHint: "不要把 P* 当成外生给定价格；它是供需共同作用后的结果。",
      },
      {
        id: "q-star",
        kind: "guide",
        label: "Q* 均衡数量",
        color: "#6b7280",
        path: "M326 211 L326 340",
        labelX: 315,
        labelY: 368,
        dashed: true,
        description: "Q* 是均衡点投影到数量轴得到的交易数量。",
        examHint: "比较静态题里，Q* 是否上升要看新均衡点相对旧均衡点的位置。",
      },
    ],
  },
  {
    id: "monopoly-mr-mc",
    title: "垄断厂商 MR-MC 决策",
    subtitle: "垄断厂商先用 MR=MC 决定产量，再回到需求曲线决定价格。",
    xLabel: "产量 Q",
    yLabel: "价格/成本",
    viewBox: "0 0 640 420",
    overview: "这张图的核心顺序是 MR 与 MC 的交点决定 Q*，再从 Q* 垂直到需求曲线得到 P*。MR 低于需求曲线，是垄断定价题最容易被翻译名词绕晕的地方。",
    defaultElementId: "mr",
    elements: [
      {
        id: "profit-area",
        kind: "area",
        label: "利润区域",
        color: "#f59e0b",
        path: "M173 160 L330 160 L330 238 L173 238 Z",
        labelX: 210,
        labelY: 203,
        description: "利润区域可理解为单位利润乘以产量：价格 P* 高于平均成本 AC 时，矩形面积代表经济利润。",
        examHint: "论述时不要只写“有利润”，要说明 P* 与 AC 在 Q* 处的相对高低。",
      },
      {
        id: "demand",
        kind: "curve",
        label: "D / AR 需求曲线",
        color: "#2563eb",
        path: "M120 88 L540 318",
        labelX: 522,
        labelY: 320,
        description: "垄断者面对向右下方倾斜的市场需求曲线，因此降价才能卖出更多产量。",
        examHint: "Pindyck 里 AR 可以和需求曲线对应；垄断题里价格要从需求曲线上读，不是从 MR 上读。",
      },
      {
        id: "mr",
        kind: "curve",
        label: "MR 边际收益",
        color: "#7c3aed",
        path: "M120 121 L438 338",
        labelX: 418,
        labelY: 335,
        description: "MR 曲线位于需求曲线下方。垄断者多卖一单位通常需要降低价格，原有销量也会受到降价影响。",
        examHint: "遇到“为什么 MR < P”时，抓住一句话：新增销量带来收入，同时降价损失一部分原有收入。",
        formula: "MR = P + Q · dP/dQ",
      },
      {
        id: "mc",
        kind: "curve",
        label: "MC 边际成本",
        color: "#dc2626",
        path: "M132 310 C248 284 330 218 528 94",
        labelX: 506,
        labelY: 94,
        description: "MC 表示增加一单位产量带来的额外成本。利润最大化的产量由 MR 与 MC 相等处决定。",
        examHint: "MR=MC 是一阶条件；如果题目问价格，还必须回到需求曲线找 P*。",
      },
      {
        id: "ac",
        kind: "curve",
        label: "AC 平均成本",
        color: "#059669",
        path: "M132 265 C244 190 374 176 530 258",
        labelX: 511,
        labelY: 260,
        description: "AC 用来判断利润、亏损或正常利润。它不直接决定垄断产量，但决定单位成本。",
        examHint: "Q* 处 P 与 AC 的比较决定利润符号：P>AC 有经济利润，P=AC 正常利润，P<AC 亏损。",
      },
      {
        id: "q-star",
        kind: "guide",
        label: "Q* 利润最大化产量",
        color: "#6b7280",
        path: "M330 216 L330 340",
        labelX: 318,
        labelY: 368,
        dashed: true,
        description: "Q* 来自 MR 与 MC 的交点，是垄断厂商选择的利润最大化产量。",
        examHint: "先 Q 后 P，是垄断图像题的关键读图顺序。",
      },
      {
        id: "p-star",
        kind: "guide",
        label: "P* 垄断价格",
        color: "#6b7280",
        path: "M80 160 L330 160",
        labelX: 50,
        labelY: 165,
        dashed: true,
        description: "P* 是 Q* 垂直到需求曲线后，再水平投影到价格轴得到的价格。",
        examHint: "垄断价格来自需求曲线，不来自 MC 或 MR。",
      },
      {
        id: "e-mr-mc",
        kind: "point",
        label: "MR=MC",
        color: "#111827",
        x: 330,
        y: 216,
        labelX: 342,
        labelY: 222,
        description: "这个交点给出利润最大化产量，但它本身不是价格点。",
        examHint: "很多错题来自把 MR=MC 交点的纵坐标当作价格；价格要回到需求曲线读。",
      },
    ],
  },
  {
    id: "cost-curves",
    title: "短期成本曲线",
    subtitle: "MC 穿过 AVC 和 AC 的最低点，是成本曲线读图的主线。",
    xLabel: "产量 Q",
    yLabel: "成本",
    viewBox: "0 0 640 420",
    overview: "短期成本图的核心不是背曲线形状，而是看清 MC 与 AC、AVC 的关系。只要 MC 低于平均量，平均量下降；MC 高于平均量，平均量上升。",
    defaultElementId: "mc",
    elements: [
      {
        id: "mc",
        kind: "curve",
        label: "MC 边际成本",
        color: "#dc2626",
        path: "M124 318 C228 276 270 132 350 122 C436 112 493 176 540 252",
        labelX: 510,
        labelY: 242,
        description: "MC 是新增一单位产量的额外成本。短期里，它常因为边际报酬递减而呈现先降后升。",
        examHint: "MC 穿过 AC 和 AVC 的最低点；这是判断曲线位置最常用的锚点。",
      },
      {
        id: "ac",
        kind: "curve",
        label: "AC 平均成本",
        color: "#2563eb",
        path: "M126 286 C228 204 348 176 536 266",
        labelX: 512,
        labelY: 268,
        description: "AC 是总成本除以产量。它包含固定成本和可变成本，通常呈 U 型。",
        examHint: "只要 MC 低于 AC，AC 就下降；MC 高于 AC，AC 就上升。",
      },
      {
        id: "avc",
        kind: "curve",
        label: "AVC 平均可变成本",
        color: "#059669",
        path: "M128 318 C232 246 355 224 536 295",
        labelX: 506,
        labelY: 299,
        description: "AVC 是可变成本除以产量。它不包含固定成本，因此通常位于 AC 下方。",
        examHint: "停产点常和 AVC 最低点相关；短期供给曲线是 AVC 最低点以上的 MC。",
      },
      {
        id: "afc",
        kind: "curve",
        label: "AFC 平均固定成本",
        color: "#7c3aed",
        path: "M126 142 C240 210 382 263 538 314",
        labelX: 508,
        labelY: 319,
        description: "AFC 随产量增加而不断下降，因为固定成本被更多产量分摊。",
        examHint: "AFC 与 AVC 的差距解释了为什么 AC 在 AVC 上方，并且两者距离会逐渐缩小。",
      },
      {
        id: "min-ac",
        kind: "point",
        label: "AC 最低点",
        color: "#111827",
        x: 348,
        y: 176,
        labelX: 360,
        labelY: 174,
        description: "MC 穿过 AC 最低点。此处之前 AC 下降，此处之后 AC 上升。",
        examHint: "看到 AC 最低点，优先联想到 MC=AC。",
      },
      {
        id: "min-avc",
        kind: "point",
        label: "AVC 最低点",
        color: "#111827",
        x: 356,
        y: 224,
        labelX: 368,
        labelY: 226,
        description: "MC 穿过 AVC 最低点。AVC 最低点也是短期停产规则的重要位置。",
        examHint: "完全竞争短期供给曲线通常从 AVC 最低点以上的 MC 曲线开始。",
      },
    ],
  },
];

export function getEconomicsGraphTemplate(id: EconomicsGraphTemplateId): EconomicsGraphTemplate | undefined {
  return economicsGraphTemplates.find((template) => template.id === id);
}

function normalizeTemplateId(value: unknown): EconomicsGraphTemplateId | null {
  if (typeof value !== "string") return null;
  const key = value.trim().toLowerCase();
  return templateAliases[key] ?? null;
}

function readObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function sanitizeOptionalText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.replace(/\s+/g, " ").trim();
  return text ? text.slice(0, maxLength) : undefined;
}

function normalizeFocus(value: unknown): string[] {
  const values = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
  return values
    .map((item) => typeof item === "string" ? item.trim() : "")
    .filter(Boolean)
    .slice(0, 6);
}

export function parseEconomicsGraphSpec(raw: string): EconomicsGraphParseResult {
  const source = raw.trim();
  if (!source) {
    return { ok: false, message: "缺少图像模板名称。" };
  }

  let parsed: unknown = source;
  if (source.startsWith("{")) {
    try {
      parsed = JSON.parse(source) as unknown;
    } catch {
      return { ok: false, message: "图像配置不是有效 JSON。" };
    }
  }

  const objectValue = readObject(parsed);
  const template = normalizeTemplateId(
    objectValue ? objectValue.template ?? objectValue.type : parsed,
  );

  if (!template) {
    return { ok: false, message: "暂不支持这个经济学图像模板。" };
  }

  const focusSource = objectValue
    ? objectValue.focus ?? objectValue.highlight ?? objectValue.highlights
    : undefined;

  return {
    ok: true,
    spec: {
      template,
      title: objectValue ? sanitizeOptionalText(objectValue.title, 90) : undefined,
      focus: normalizeFocus(focusSource),
    },
  };
}
