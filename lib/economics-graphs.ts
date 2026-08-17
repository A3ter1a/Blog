export type EconomicsGraphTemplateId =
  | "demand-supply"
  | "monopoly-mr-mc"
  | "cost-curves"
  | "individual-demand"
  | "open-economy"
  | "consumer-choice"
  | "risk-utility"
  | "production-isoquant"
  | "competitive-policy"
  | "price-discrimination"
  | "cournot-reaction"
  | "factor-market"
  | "intertemporal-choice"
  | "externality"
  | "loanable-funds"
  | "money-market"
  | "solow-steady-state"
  | "ad-as"
  | "keynesian-cross"
  | "is-lm"
  | "mundell-fleming"
  | "phillips-curve"
  | "macro-consumption"
  | "investment-demand"
  | "wage-rigidity"
  | "production-possibility"
  | "demand-supply-shifts"
  | "elasticity-revenue"
  | "elasticity-shapes"
  | "supply-shift-revenue"
  | "price-controls"
  | "budget-shifts"
  | "special-preferences"
  | "price-consumption"
  | "income-engel"
  | "slutsky-decomposition"
  | "market-demand-sum"
  | "risk-return"
  | "production-curves"
  | "long-run-cost"
  | "payoff-matrix"
  | "game-tree"
  | "edgeworth-box"
  | "ppf-trade"
  | "lemons-market"
  | "signaling"
  | "moral-hazard"
  | "public-good"
  | "common-resource"
  | "network-demand"
  | "scale-returns"
  | "scope-economy"
  | "learning-curve"
  | "competitive-supply"
  | "trade-welfare"
  | "monopolistic-competition"
  | "monopsony"
  | "two-part-tariff"
  | "bundling"
  | "advertising"
  | "transfer-pricing"
  | "stackelberg"
  | "bertrand"
  | "kinked-demand"
  | "auction"
  | "labor-supply"
  | "bilateral-monopoly"
  | "euler-distribution"
  | "investment-timeline"
  | "bond-valuation"
  | "exhaustible-resource"
  | "utility-possibility"
  | "production-box"
  | "lemons-market"
  | "coase-bargaining"
  | "efficiency-wage"
  | "circular-flow"
  | "macro-indicators"
  | "quantity-theory"
  | "inflation-costs"
  | "classical-production"
  | "solow-golden-rule"
  | "growth-accounting"
  | "ak-growth"
  | "growth-convergence"
  | "business-cycle"
  | "ad-policy"
  | "policy-lags"
  | "taylor-rule"
  | "short-run-as-models"
  | "debt-dynamics"
  | "consumption-theories"
  | "investment-q"
  | "money-multiplier"
  | "cycle-schools"
  | "phillips-expectations"
  | "open-policy-comparison"
  | "laffer-curve"
  | "industry-long-run-supply"
  | "price-support-quota"
  | "tax-subsidy"
  | "natural-monopoly-regulation"
  | "third-degree-discrimination"
  | "peak-load-pricing"
  | "cartel-output"
  | "dominant-firm"
  | "union-monopoly"
  | "liquidity-trap"
  | "housing-stock-flow"
  | "baumol-tobin";

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

export interface EconomicsGraphStroke {
  id: string;
  label: string;
  color: string;
  path: string;
  dashed?: boolean;
}

export interface EconomicsGraphSpec {
  template: EconomicsGraphTemplateId;
  title?: string;
  focus: string[];
  customStrokes?: EconomicsGraphStroke[];
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
  "individual-demand": "individual-demand",
  "open-economy": "open-economy",
  "consumer-choice": "consumer-choice",
  budget: "consumer-choice",
  "risk-utility": "risk-utility",
  risk: "risk-utility",
  "production-isoquant": "production-isoquant",
  isoquant: "production-isoquant",
  "competitive-policy": "competitive-policy",
  "policy-welfare": "competitive-policy",
  "price-discrimination": "price-discrimination",
  discrimination: "price-discrimination",
  "cournot-reaction": "cournot-reaction",
  cournot: "cournot-reaction",
  "factor-market": "factor-market",
  "labor-market": "factor-market",
  "intertemporal-choice": "intertemporal-choice",
  intertemporal: "intertemporal-choice",
  externality: "externality",
  "loanable-funds": "loanable-funds",
  "money-market": "money-market",
  "solow-steady-state": "solow-steady-state",
  solow: "solow-steady-state",
  "ad-as": "ad-as",
  "keynesian-cross": "keynesian-cross",
  "is-lm": "is-lm",
  "mundell-fleming": "mundell-fleming",
  "phillips-curve": "phillips-curve",
  "macro-consumption": "macro-consumption",
  "investment-demand": "investment-demand",
  "wage-rigidity": "wage-rigidity",
  "production-possibility": "production-possibility",
  "ppf": "production-possibility",
  "demand-supply-shifts": "demand-supply-shifts",
  "supply-demand-shifts": "demand-supply-shifts",
  "elasticity-revenue": "elasticity-revenue",
  "elasticity-shapes": "elasticity-shapes",
  "supply-shift-revenue": "supply-shift-revenue",
  "price-controls": "price-controls",
  "budget-shifts": "budget-shifts",
  "special-preferences": "special-preferences",
  "price-consumption": "price-consumption",
  "income-engel": "income-engel",
  "slutsky-decomposition": "slutsky-decomposition",
  "market-demand-sum": "market-demand-sum",
  "risk-return": "risk-return",
  "production-curves": "production-curves",
  "long-run-cost": "long-run-cost",
  "payoff-matrix": "payoff-matrix",
  "game-tree": "game-tree",
  "edgeworth-box": "edgeworth-box",
  "ppf-trade": "ppf-trade",
  "lemons-market": "lemons-market",
  "signaling": "signaling",
  "moral-hazard": "moral-hazard",
  "public-good": "public-good",
  "common-resource": "common-resource",
  "network-demand": "network-demand",
  "scale-returns": "scale-returns",
  "scope-economy": "scope-economy",
  "learning-curve": "learning-curve",
  "competitive-supply": "competitive-supply",
  "trade-welfare": "trade-welfare",
  "monopolistic-competition": "monopolistic-competition",
  "monopsony": "monopsony",
  "two-part-tariff": "two-part-tariff",
  "bundling": "bundling",
  "advertising": "advertising",
  "transfer-pricing": "transfer-pricing",
  "stackelberg": "stackelberg",
  "bertrand": "bertrand",
  "kinked-demand": "kinked-demand",
  "auction": "auction",
  "labor-supply": "labor-supply",
  "bilateral-monopoly": "bilateral-monopoly",
  "euler-distribution": "euler-distribution",
  "investment-timeline": "investment-timeline",
  "bond-valuation": "bond-valuation",
  "exhaustible-resource": "exhaustible-resource",
  "utility-possibility": "utility-possibility",
  "production-box": "production-box",
  "coase-bargaining": "coase-bargaining",
  "efficiency-wage": "efficiency-wage",
  "circular-flow": "circular-flow",
  "macro-indicators": "macro-indicators",
  "quantity-theory": "quantity-theory",
  "inflation-costs": "inflation-costs",
  "classical-production": "classical-production",
  "solow-golden-rule": "solow-golden-rule",
  "growth-accounting": "growth-accounting",
  "ak-growth": "ak-growth",
  "growth-convergence": "growth-convergence",
  "business-cycle": "business-cycle",
  "ad-policy": "ad-policy",
  "policy-lags": "policy-lags",
  "taylor-rule": "taylor-rule",
  "short-run-as-models": "short-run-as-models",
  "debt-dynamics": "debt-dynamics",
  "consumption-theories": "consumption-theories",
  "investment-q": "investment-q",
  "money-multiplier": "money-multiplier",
  "cycle-schools": "cycle-schools",
  "phillips-expectations": "phillips-expectations",
  "open-policy-comparison": "open-policy-comparison",
  "laffer-curve": "laffer-curve",
  "industry-long-run-supply": "industry-long-run-supply",
  "price-support-quota": "price-support-quota",
  "tax-subsidy": "tax-subsidy",
  "natural-monopoly-regulation": "natural-monopoly-regulation",
  "third-degree-discrimination": "third-degree-discrimination",
  "peak-load-pricing": "peak-load-pricing",
  "cartel-output": "cartel-output",
  "dominant-firm": "dominant-firm",
  "union-monopoly": "union-monopoly",
  "liquidity-trap": "liquidity-trap",
  "housing-stock-flow": "housing-stock-flow",
  "baumol-tobin": "baumol-tobin",
};

const baseEconomicsGraphTemplates: EconomicsGraphTemplate[] = [
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
        path: "M120 92 L540 328",
        labelX: 512,
        labelY: 326,
        description: "需求曲线向右下方倾斜，表示其他条件不变时，价格越低，消费者愿意购买的数量越多。",
        examHint: "看到需求曲线移动时，先判断是不是非价格因素变化；价格本身变化通常表现为沿着同一条需求曲线移动。",
      },
      {
        id: "supply",
        kind: "curve",
        label: "S 供给曲线",
        color: "#dc2626",
        path: "M120 328 L540 92",
        labelX: 512,
        labelY: 94,
        description: "供给曲线向右上方倾斜，表示价格越高，生产者越愿意提供更多数量。",
        examHint: "供给曲线移动通常来自成本、技术、税收、补贴或生产者预期变化，而不是商品自身价格变化。",
      },
      {
        id: "equilibrium",
        kind: "point",
        label: "E 均衡点",
        color: "#111827",
        x: 330,
        y: 210,
        labelX: 342,
        labelY: 206,
        description: "均衡点是需求曲线和供给曲线的交点。这里对应的价格是均衡价格，对应的数量是均衡数量。",
        examHint: "考试解释均衡变化时，按“曲线移动 -> 新交点 -> 价格和数量变化”的顺序写，最稳。",
      },
      {
        id: "p-star",
        kind: "guide",
        label: "P* 均衡价格",
        color: "#6b7280",
        path: "M80 210 L330 210",
        labelX: 50,
        labelY: 215,
        dashed: true,
        description: "P* 是均衡点投影到价格轴得到的价格。",
        examHint: "不要把 P* 当成外生给定价格；它是供需共同作用后的结果。",
      },
      {
        id: "q-star",
        kind: "guide",
        label: "Q* 均衡数量",
        color: "#6b7280",
        path: "M330 210 L330 340",
        labelX: 318,
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
        path: "M150 160 L330 160 L330 238 L150 238 Z",
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
        path: "M120 70 L540 250",
        labelX: 520,
        labelY: 255,
        description: "垄断者面对向右下方倾斜的市场需求曲线，因此降价才能卖出更多产量。",
        examHint: "Pindyck 里 AR 可以和需求曲线对应；垄断题里价格要从需求曲线上读，不是从 MR 上读。",
      },
      {
        id: "mr",
        kind: "curve",
        label: "MR 边际收益",
        color: "#7c3aed",
        path: "M120 110 L500 335",
        labelX: 456,
        labelY: 332,
        description: "MR 曲线位于需求曲线下方。垄断者多卖一单位通常需要降低价格，原有销量也会受到降价影响。",
        examHint: "遇到“为什么 MR < P”时，抓住一句话：新增销量带来收入，同时降价损失一部分原有收入。",
        formula: "MR = P + Q \\cdot \\frac{dP}{dQ}",
      },
      {
        id: "mc",
        kind: "curve",
        label: "MC 边际成本",
        color: "#dc2626",
        path: "M132 310 C232 292 276 268 330 235 C400 190 462 135 528 94",
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
        path: "M132 280 C212 236 274 226 330 238 C404 250 466 258 530 282",
        labelX: 510,
        labelY: 278,
        description: "AC 用来判断利润、亏损或正常利润。它不直接决定垄断产量，但决定单位成本。",
        examHint: "Q* 处 P 与 AC 的比较决定利润符号：P>AC 有经济利润，P=AC 正常利润，P<AC 亏损。",
      },
      {
        id: "q-star",
        kind: "guide",
        label: "Q* 利润最大化产量",
        color: "#6b7280",
        path: "M330 235 L330 340",
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
        y: 235,
        labelX: 342,
        labelY: 238,
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
        path: "M120 310 C210 325 250 305 300 275 C335 258 360 248 380 245 C430 238 488 170 540 90",
        labelX: 510,
        labelY: 96,
        description: "MC 是新增一单位产量的额外成本。短期里，它常因为边际报酬递减而呈现先降后升。",
        examHint: "MC 穿过 AC 和 AVC 的最低点；这是判断曲线位置最常用的锚点。",
      },
      {
        id: "ac",
        kind: "curve",
        label: "AC 平均成本",
        color: "#2563eb",
        path: "M120 126 C220 204 304 245 380 245 C446 245 500 198 540 150",
        labelX: 508,
        labelY: 154,
        description: "AC 是总成本除以产量。它包含固定成本和可变成本，通常呈 U 型。",
        examHint: "只要 MC 低于 AC，AC 就下降；MC 高于 AC，AC 就上升。",
      },
      {
        id: "avc",
        kind: "curve",
        label: "AVC 平均可变成本",
        color: "#059669",
        path: "M120 180 C206 244 252 275 300 275 C382 275 470 244 540 205",
        labelX: 506,
        labelY: 210,
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
        x: 380,
        y: 245,
        labelX: 392,
        labelY: 243,
        description: "MC 穿过 AC 最低点。此处之前 AC 下降，此处之后 AC 上升。",
        examHint: "看到 AC 最低点，优先联想到 MC=AC。",
      },
      {
        id: "min-avc",
        kind: "point",
        label: "AVC 最低点",
        color: "#111827",
        x: 300,
        y: 275,
        labelX: 312,
        labelY: 277,
        description: "MC 穿过 AVC 最低点。AVC 最低点也是短期停产规则的重要位置。",
        examHint: "完全竞争短期供给曲线通常从 AVC 最低点以上的 MC 曲线开始。",
      },
      {
        id: "q-guide",
        kind: "guide",
        label: "Q 参考产量",
        color: "#6b7280",
        path: "M380 245 V340",
        labelX: 368,
        labelY: 368,
        dashed: true,
        description: "把成本曲线上的参考产量投影到横轴，便于比较 MC、AC 和 AVC 的位置。",
        examHint: "读成本图时先找曲线交点，再用投影线确认对应产量。",
      },
      {
        id: "cost-guide",
        kind: "guide",
        label: "成本水平",
        color: "#6b7280",
        path: "M80 245 H380",
        labelX: 48,
        labelY: 250,
        dashed: true,
        description: "水平投影帮助读取给定产量下的成本水平。",
        examHint: "不要把曲线纵坐标直接当作总成本；AC、AVC 和 MC 的单位含义不同。",
      },
    ],
  },
];

const GRAPH_VIEW_BOX = "0 0 640 420";

function dedicatedEconomicsTemplate(
  template: Omit<EconomicsGraphTemplate, "viewBox">,
): EconomicsGraphTemplate {
  return { ...template, viewBox: GRAPH_VIEW_BOX };
}

const dedicatedEconomicsGraphTemplates: EconomicsGraphTemplate[] = [
  dedicatedEconomicsTemplate({
    id: "consumer-choice",
    title: "消费者预算约束与最优选择",
    subtitle: "预算线把买得起的组合围起来，无差异曲线与预算线的最高切点给出最优消费组合。",
    xLabel: "商品 X 数量",
    yLabel: "商品 Y 数量",
    overview: "先读预算线的截距和斜率，再找最高的可达无差异曲线。内部最优点满足 MRS = Px/Py；角点或折点需要另行检查。",
    defaultElementId: "optimum",
    elements: [
      { id: "budget-line", kind: "curve", label: "预算线", color: "#2563eb", path: "M116 318 L520 86", labelX: 472, labelY: 92, description: "预算线表示收入和价格给定时恰好花完收入的商品组合。斜率为 -Px/Py。", examHint: "收入变动使预算线平行移动；单个价格变动通常改变一个截距并旋转预算线。", formula: "P_xx+P_yy=I" },
      { id: "indifference-low", kind: "curve", label: "较低无差异曲线", color: "#7c3aed", path: "M142 315 C220 240 315 192 460 162", labelX: 414, labelY: 160, description: "同一条无差异曲线上的组合带来相同效用。更靠近原点通常代表更低效用。", examHint: "无差异曲线一般向右下方倾斜且不能相交。" },
      { id: "indifference-high", kind: "curve", label: "最高可达无差异曲线", color: "#059669", path: "M170 350 C270 260 380 215 540 180", labelX: 470, labelY: 178, description: "最高可达曲线与预算线相切，代表在预算约束下的最大效用。", examHint: "不要把预算线与任意无差异曲线的交点都当作最优点；要找最高可达曲线。" },
      { id: "optimum", kind: "point", label: "E 最优组合", color: "#111827", x: 331, y: 209, labelX: 344, labelY: 204, description: "E 是预算线与最高可达无差异曲线的切点。", examHint: "内部最优点写 MRS=Px/Py；若出现角点，要比较角点效用。" },
      { id: "x-optimum", kind: "guide", label: "x*", color: "#6b7280", path: "M331 209 V340", labelX: 323, labelY: 368, dashed: true, description: "把最优点投影到横轴得到商品 X 的最优数量。", examHint: "价格—消费曲线就是把不同价格下的最优点连接起来。" },
      { id: "y-optimum", kind: "guide", label: "y*", color: "#6b7280", path: "M80 209 H331", labelX: 48, labelY: 214, dashed: true, description: "把最优点投影到纵轴得到商品 Y 的最优数量。", examHint: "作答时同时报告两个商品的最优数量，避免只写一个坐标。" },
    ],
  }),
  dedicatedEconomicsTemplate({
    id: "risk-utility",
    title: "风险、期望效用与确定性等价",
    subtitle: "凹效用函数把风险厌恶表现为：期望效用低于期望财富的效用。",
    xLabel: "财富 W",
    yLabel: "效用 U(W)",
    overview: "曲线的凹性是风险厌恶的图形核心。风险彩票的两个结果落在曲线上，连接两点的弦线给出期望效用；与曲线同高的财富水平就是确定性等价。",
    defaultElementId: "expected-utility",
    elements: [
      { id: "utility", kind: "curve", label: "凹效用函数 U(W)", color: "#2563eb", path: "M120 316 C220 248 330 170 520 82", labelX: 452, labelY: 102, description: "边际效用递减使效用函数向下凹，财富增加带来的额外效用逐渐减少。", examHint: "凹函数对应风险厌恶，直线对应风险中性，凸函数对应风险偏好。", formula: "U''(W)<0" },
      { id: "expected-chord", kind: "curve", label: "期望效用弦线", color: "#dc2626", path: "M180 268 L460 138", labelX: 378, labelY: 168, dashed: true, description: "弦线上加权平均点代表风险彩票的期望效用。凹函数下弦线低于曲线。", examHint: "比较 EU 与 U(EW)，不要把期望财富的效用和期望效用混为一谈。", formula: "EU=pU(W_1)+(1-p)U(W_2)" },
      { id: "expected-utility", kind: "point", label: "EU 期望效用", color: "#111827", x: 320, y: 204, labelX: 332, labelY: 199, description: "EU 是彩票结果效用的概率加权平均。", examHint: "风险厌恶时 EU<U(EW)。" },
      { id: "certainty-equivalent", kind: "point", label: "CE 确定性等价", color: "#059669", x: 286, y: 220, labelX: 296, labelY: 244, description: "CE 是带来与彩票相同效用的确定财富。", examHint: "风险溢价 = 期望财富 - 确定性等价。" },
      { id: "ce-guide", kind: "guide", label: "CE 财富", color: "#6b7280", path: "M286 220 V340", labelX: 272, labelY: 368, dashed: true, description: "将 CE 点投影到财富轴，读出愿意用来替代彩票的确定财富。", examHint: "最高公平保费要结合投保前后的确定性等价比较。" },
      { id: "ew-guide", kind: "guide", label: "EW 期望财富", color: "#6b7280", path: "M320 204 V340", labelX: 305, labelY: 388, dashed: true, description: "期望财富是财富结果的概率加权平均，并不等于期望效用。", examHint: "弦线点的横坐标可对应期望财富，纵坐标对应期望效用。" },
    ],
  }),
  dedicatedEconomicsTemplate({
    id: "production-isoquant",
    title: "等产量线与等成本线",
    subtitle: "给定目标产量时，等产量线与等成本线的切点给出成本最小的投入组合。",
    xLabel: "劳动 L",
    yLabel: "资本 K",
    overview: "等产量线表达技术约束，等成本线表达投入价格约束。切点条件 MRTS = w/r，等价于 MPL/w = MPK/r。",
    defaultElementId: "tangency",
    elements: [
      { id: "isoquant", kind: "curve", label: "q̄ 等产量线", color: "#2563eb", path: "M136 302 C210 254 290 220 372 190 C430 170 480 155 530 146", labelX: 458, labelY: 153, description: "等产量线上的不同劳动—资本组合都能生产相同产量。", examHint: "等产量线通常向右下方倾斜且凸向原点。" },
      { id: "isoquant-high", kind: "curve", label: "更高产量等产量线", color: "#7c3aed", path: "M160 340 C260 278 340 238 420 205 C480 182 520 170 560 164", labelX: 482, labelY: 174, description: "离原点更远的等产量线代表更高产量。", examHint: "等产量线不能相交；移动到更高曲线意味着产量增加。" },
      { id: "isocost", kind: "curve", label: "等成本线", color: "#dc2626", path: "M120 330 L540 100", labelX: 486, labelY: 104, description: "等成本线上的投入组合花费相同，斜率为 -w/r。", examHint: "工资或资本租金变化会改变等成本线斜率或截距。", formula: "C=wL+rK" },
      { id: "tangency", kind: "point", label: "E 成本最小点", color: "#111827", x: 360, y: 194, labelX: 372, labelY: 190, description: "E 是目标产量等产量线与最低可达等成本线的切点。", examHint: "成本最小化写成 MRTS=w/r，或 MPL/w=MPK/r。", formula: "MRTS_{LK}=w/r" },
      { id: "labor-optimum", kind: "guide", label: "L*", color: "#6b7280", path: "M360 194 V340", labelX: 352, labelY: 368, dashed: true, description: "切点投影给出最优劳动投入。", examHint: "先确定目标产量，再在对应等产量线上找切点。" },
      { id: "capital-optimum", kind: "guide", label: "K*", color: "#6b7280", path: "M80 194 H360", labelX: 48, labelY: 199, dashed: true, description: "切点投影给出最优资本投入。", examHint: "两种投入都可调整时，不能只比较单个投入的边际产量。" },
    ],
  }),
  dedicatedEconomicsTemplate({
    id: "competitive-policy",
    title: "税收与无谓损失",
    subtitle: "单位税使买方支付价与卖方得到价之间出现楔子，交易量低于有效率水平。",
    xLabel: "交易数量 Q",
    yLabel: "价格 P",
    overview: "政策图先标出无税均衡，再画含税供给（或需求）和新均衡。税收收入是转移支付，不应与无谓损失重复计算。",
    defaultElementId: "deadweight-loss",
    elements: [
      { id: "demand", kind: "curve", label: "D 需求", color: "#2563eb", path: "M120 88 L540 318", labelX: 512, labelY: 322, description: "需求曲线表示边际支付意愿。", examHint: "需求弹性决定税负更多落在买方还是卖方。" },
      { id: "supply", kind: "curve", label: "S 供给", color: "#059669", path: "M120 318 L540 88", labelX: 510, labelY: 92, description: "供给曲线表示边际成本或卖方最低接受价格。", examHint: "税收可以画成供给曲线上移，也可以画成需求曲线下移。" },
      { id: "tax-supply", kind: "curve", label: "S+t 含税供给", color: "#dc2626", path: "M120 350 L540 120", labelX: 470, labelY: 132, description: "单位税把卖方供给曲线向上平移税额。", examHint: "含税供给与需求交点给出税后交易量。" },
      { id: "efficient", kind: "point", label: "E 无税均衡", color: "#111827", x: 330, y: 203, labelX: 342, labelY: 198, description: "无税均衡通常满足 MB=MC，是竞争性市场的有效率交易量。", examHint: "先标 Qe，再比较税后交易量是否减少。" },
      { id: "tax-equilibrium", kind: "point", label: "Et 税后均衡", color: "#f59e0b", x: 286, y: 222, labelX: 298, labelY: 218, description: "税后均衡交易量减少，买卖双方之间出现税收楔子。", examHint: "税收收入矩形不等于无谓损失三角形。" },
      { id: "deadweight-loss", kind: "area", label: "DWL 无谓损失", color: "#f59e0b", path: "M286 222 L330 203 L286 270 Z", labelX: 292, labelY: 260, description: "从税后交易量到有效交易量之间，边际收益与边际成本的差额累积成无谓损失。", examHint: "税收造成的效率损失随税率上升和供需弹性变化。" },
      { id: "tax-wedge", kind: "guide", label: "税收楔子", color: "#6b7280", path: "M286 222 V274", labelX: 296, labelY: 286, dashed: true, description: "同一交易量下买方支付价与卖方得到价之差就是单位税。", examHint: "税负归宿看相对弹性，不看法律上谁缴税。" },
    ],
  }),
  dedicatedEconomicsTemplate({
    id: "price-discrimination",
    title: "统一定价与完全价格歧视",
    subtitle: "统一价格限制交易量并留下消费者剩余；完全价格歧视把每单位保留价格转化为厂商收入。",
    xLabel: "产量 Q",
    yLabel: "价格/收益/成本",
    overview: "统一定价仍在 MR=MC 处决定产量，再从需求曲线读价格；完全价格歧视下，厂商沿需求曲线销售到 P=MC，消费者剩余理论上被全部攫取。",
    defaultElementId: "uniform-output",
    elements: [
      { id: "demand", kind: "curve", label: "D 需求", color: "#2563eb", path: "M120 82 L540 318", labelX: 508, labelY: 322, description: "需求曲线表示不同单位的最高支付意愿。", examHint: "一级价格歧视使用需求曲线上的每个支付意愿，而不是一条统一价格线。" },
      { id: "mr", kind: "curve", label: "MR 统一定价边际收益", color: "#7c3aed", path: "M120 142 L420 332", labelX: 380, labelY: 326, description: "统一价格下，MR 位于需求曲线下方，因为新增销量需要降低原有单位的价格。", examHint: "统一定价先 MR=MC；完全价格歧视不直接使用这条 MR。" },
      { id: "mc", kind: "curve", label: "MC 边际成本", color: "#dc2626", path: "M120 292 C230 276 340 232 520 150", labelX: 478, labelY: 170, description: "MC 与需求曲线的交点给出完全价格歧视下的有效率产量。", examHint: "完全价格歧视通常扩大产量，但分配效果和效率效果要分开写。" },
      { id: "uniform-output", kind: "point", label: "Qu 统一定价产量", color: "#111827", x: 300, y: 235, labelX: 310, labelY: 232, description: "统一定价产量由 MR=MC 决定。", examHint: "统一价格下 Q 通常小于完全价格歧视的有效率产量。" },
      { id: "efficient-output", kind: "point", label: "Qp 完全歧视产量", color: "#059669", x: 420, y: 235, labelX: 430, labelY: 232, description: "完全价格歧视继续销售到需求曲线与 MC 相交的位置。", examHint: "完全价格歧视不等于每个人支付同一个高价，而是每单位价格不同。" },
      { id: "uniform-guide", kind: "guide", label: "Qu", color: "#6b7280", path: "M300 235 V340", labelX: 292, labelY: 368, dashed: true, description: "统一定价产量投影。", examHint: "比较两个产量时要说明为什么 MR 曲线导致统一定价提前停止。" },
      { id: "efficient-guide", kind: "guide", label: "Qp", color: "#6b7280", path: "M420 235 V340", labelX: 412, labelY: 388, dashed: true, description: "完全价格歧视产量投影。", examHint: "Qp 右侧的单位支付意愿低于 MC，不应继续销售。" },
    ],
  }),
  dedicatedEconomicsTemplate({
    id: "cournot-reaction",
    title: "古诺模型反应函数与纳什均衡",
    subtitle: "每条反应函数表示一家厂商在给定对手产量时的最优产量，交点是相互最佳回应。",
    xLabel: "厂商 1 产量 q₁",
    yLabel: "厂商 2 产量 q₂",
    overview: "古诺模型把对手产量当作给定，分别求两家厂商的反应函数。两条反应函数交点不是共谋产量，而是双方同时最优的纳什均衡。",
    defaultElementId: "nash",
    elements: [
      { id: "reaction-1", kind: "curve", label: "R₁ 厂商 1 的反应", color: "#2563eb", path: "M120 90 L540 320", labelX: 464, labelY: 304, description: "对手产量越高，厂商 1 的最优产量越低。", examHint: "反应函数的负斜率体现战略替代。" },
      { id: "reaction-2", kind: "curve", label: "R₂ 厂商 2 的反应", color: "#dc2626", path: "M120 320 L540 90", labelX: 464, labelY: 106, description: "对手产量越高，厂商 2 也会选择更低的最优产量。", examHint: "对称模型中两条反应函数关于 45° 线对称。" },
      { id: "nash", kind: "point", label: "N 纳什均衡", color: "#111827", x: 330, y: 205, labelX: 342, labelY: 200, description: "N 点同时落在两条反应函数上，任何一家单独偏离都会降低自己的利润。", examHint: "先联立两条反应函数，再区分纳什均衡与共谋解。" },
      { id: "q1-guide", kind: "guide", label: "q₁*", color: "#6b7280", path: "M330 205 V340", labelX: 320, labelY: 368, dashed: true, description: "投影得到厂商 1 的均衡产量。", examHint: "总产量要把 q₁* 和 q₂* 相加。" },
      { id: "q2-guide", kind: "guide", label: "q₂*", color: "#6b7280", path: "M80 205 H330", labelX: 45, labelY: 210, dashed: true, description: "投影得到厂商 2 的均衡产量。", examHint: "对称时两家均衡产量相等；不对称时不能直接平分。" },
    ],
  }),
  dedicatedEconomicsTemplate({
    id: "factor-market",
    title: "竞争性劳动市场与买方垄断",
    subtitle: "竞争市场用 MRP=w，买方垄断则用 MRP=ME，并从劳动供给曲线读工资。",
    xLabel: "劳动 L",
    yLabel: "工资/劳动边际收益",
    overview: "劳动需求是 MRP_L，劳动供给是 S_L，买方垄断的边际支出 ME_L 位于供给曲线上方。买方垄断因此减少就业并压低工资。",
    defaultElementId: "monopsony",
    elements: [
      { id: "mrp", kind: "curve", label: "D=MRP_L 劳动需求", color: "#2563eb", path: "M120 88 L540 320", labelX: 470, labelY: 308, description: "每增加一单位劳动带来的边际收益产出。", examHint: "MRP_L=MR×MPL；产品市场垄断时 MR 低于 P，劳动需求会下移。" },
      { id: "supply", kind: "curve", label: "S_L 劳动供给", color: "#059669", path: "M120 320 L540 88", labelX: 486, labelY: 100, description: "劳动者愿意提供不同数量劳动所要求的最低工资。", examHint: "竞争性劳动市场的工资由 D_L 与 S_L 交点决定。" },
      { id: "me", kind: "curve", label: "ME_L 边际支出", color: "#dc2626", path: "M120 350 L540 120", labelX: 464, labelY: 134, description: "买方垄断者增加雇佣量时必须提高所有工人的工资，因此 ME_L>w。", examHint: "买方垄断最优条件是 MRP_L=ME_L，不是 MRP_L=w。", formula: "ME_L=w+L\\frac{dw}{dL}" },
      { id: "competitive", kind: "point", label: "Ec 竞争均衡", color: "#111827", x: 330, y: 205, labelX: 342, labelY: 200, description: "D_L 与 S_L 交点给出竞争性工资和就业量。", examHint: "竞争市场下 w 是给定的，单个厂商面对水平的劳动供给。" },
      { id: "monopsony", kind: "point", label: "Em 买方垄断", color: "#f59e0b", x: 280, y: 230, labelX: 292, labelY: 226, description: "MRP_L 与 ME_L 交点决定买方垄断就业量，再从 S_L 读取工资。", examHint: "通常 Lm<Lc、wm<wc；工资不是从 ME_L 读，而是回到 S_L 读。" },
      { id: "employment-guide", kind: "guide", label: "Lm<Lc", color: "#6b7280", path: "M280 230 V340 M330 205 V340", labelX: 290, labelY: 370, dashed: true, description: "两条就业投影直观显示买方垄断减少就业。", examHint: "比较就业先比较 MRP 与 ME 的交点，再比较工资。" },
    ],
  }),
  dedicatedEconomicsTemplate({
    id: "intertemporal-choice",
    title: "跨期选择与借贷约束",
    subtitle: "跨期预算线连接今天和未来的消费，无差异曲线切点决定最优储蓄或借贷。",
    xLabel: "当期消费 C₁",
    yLabel: "未来消费 C₂",
    overview: "利率改变跨期预算线的斜率，收入或财富改变其截距。最优点左侧通常对应储蓄，右侧对应借贷；借贷约束会把最优点推到边界。",
    defaultElementId: "intertemporal-optimum",
    elements: [
      { id: "intertemporal-budget", kind: "curve", label: "跨期预算线", color: "#2563eb", path: "M120 300 L520 100", labelX: 446, labelY: 106, description: "预算线表示今天少消费一单位可以换取未来更多消费，斜率由 1+r 决定。", examHint: "实际利率上升会改变替代效应与收入效应，不能只写消费必然上升或下降。", formula: "C_1+\\frac{C_2}{1+r}=Y_1+\\frac{Y_2}{1+r}" },
      { id: "intertemporal-low", kind: "curve", label: "较低效用", color: "#7c3aed", path: "M142 300 C220 240 318 190 460 162", labelX: 414, labelY: 160, description: "较低无差异曲线表示较低跨期消费效用。", examHint: "和第三章消费者选择的切点逻辑相同，只是商品换成今天和未来。" },
      { id: "intertemporal-high", kind: "curve", label: "最高可达效用", color: "#059669", path: "M180 340 C270 260 380 212 540 176", labelX: 472, labelY: 174, description: "最高可达无差异曲线与预算线相切。", examHint: "切点左侧是储蓄，右侧是借贷；先判断坐标位置再解释行为。" },
      { id: "intertemporal-optimum", kind: "point", label: "E 跨期最优", color: "#111827", x: 330, y: 205, labelX: 342, labelY: 200, description: "E 是跨期资源配置的最优消费组合。", examHint: "借贷约束存在时，最优点可能不是切点而是约束边界。" },
      { id: "today-guide", kind: "guide", label: "C₁*", color: "#6b7280", path: "M330 205 V340", labelX: 320, labelY: 368, dashed: true, description: "当期最优消费投影。", examHint: "当期收入变化会平移预算线，利率变化会旋转预算线。" },
      { id: "future-guide", kind: "guide", label: "C₂*", color: "#6b7280", path: "M80 205 H330", labelX: 48, labelY: 210, dashed: true, description: "未来最优消费投影。", examHint: "不要把未来消费的货币单位和当期消费混用，先统一现值口径。" },
    ],
  }),
  dedicatedEconomicsTemplate({
    id: "externality",
    title: "外部性与社会最优产量",
    subtitle: "私人边际条件没有计入外部损害或外部收益时，市场数量会偏离社会最优。",
    xLabel: "产量 Q",
    yLabel: "边际收益/边际成本",
    overview: "负外部性把社会边际成本推到私人边际成本上方，市场产量过多；正外部性把社会边际收益推到私人边际收益上方，市场产量过少。",
    defaultElementId: "social-optimum",
    elements: [
      { id: "marginal-benefit", kind: "curve", label: "MB 私人边际收益", color: "#2563eb", path: "M120 88 L540 318", labelX: 478, labelY: 304, description: "私人决策者感受到的边际收益。", examHint: "负外部性通常不改变需求侧 MB，而是抬高社会成本。" },
      { id: "marginal-cost", kind: "curve", label: "MC 私人边际成本", color: "#059669", path: "M120 318 L540 88", labelX: 492, labelY: 96, description: "生产者承担的私人边际成本。", examHint: "市场均衡通常满足 MB=MC。" },
      { id: "social-cost", kind: "curve", label: "MSC 社会边际成本", color: "#dc2626", path: "M120 350 L540 120", labelX: 470, labelY: 132, description: "负生产外部性下 MSC=MC+MEC，位于 MC 上方。", examHint: "正外部性则改看 MSB=MB+MEB，社会收益曲线位于 MB 上方。" },
      { id: "market-equilibrium", kind: "point", label: "Qc 市场产量", color: "#f59e0b", x: 330, y: 205, labelX: 342, labelY: 200, description: "市场只比较 MB 与私人 MC，忽略外部损害。", examHint: "负外部性下 Qc>Q*；正外部性下 Qc<Q*。" },
      { id: "social-optimum", kind: "point", label: "Q* 社会最优", color: "#111827", x: 280, y: 230, labelX: 292, labelY: 226, description: "社会最优满足 MSB=MSC，内部化外部性后才会到达这里。", examHint: "政策工具包括矫正税、补贴、排放标准和可交易许可证。" },
      { id: "externality-dwl", kind: "area", label: "DWL 外部性无谓损失", color: "#f59e0b", path: "M280 230 L330 205 L280 278 Z", labelX: 286, labelY: 268, description: "市场产量与社会最优产量之间的净社会损失。", examHint: "不要把外部损害本身和无谓损失面积混为一谈。" },
      { id: "social-guide", kind: "guide", label: "Q* 投影", color: "#6b7280", path: "M280 230 V340", labelX: 270, labelY: 368, dashed: true, description: "社会最优产量投影。", examHint: "图形题要同时写出市场均衡条件和社会最优条件。" },
    ],
  }),
  dedicatedEconomicsTemplate({
    id: "loanable-funds",
    title: "可贷资金市场与财政赤字",
    subtitle: "实际利率调节储蓄供给和投资需求；财政赤字减少国民储蓄并推高实际利率。",
    xLabel: "可贷资金",
    yLabel: "实际利率 r",
    overview: "古典模型把储蓄看作可贷资金供给，把投资看作可贷资金需求。财政赤字使储蓄曲线左移，产生挤出效应。",
    defaultElementId: "loanable-equilibrium",
    elements: [
      { id: "saving", kind: "curve", label: "S 储蓄供给", color: "#059669", path: "M120 300 L520 108", labelX: 468, labelY: 118, description: "国民储蓄提供可贷资金。", examHint: "政府赤字减少公共储蓄，国民储蓄下降，S 左移。" },
      { id: "investment", kind: "curve", label: "I 投资需求", color: "#2563eb", path: "M120 90 L520 300", labelX: 474, labelY: 294, description: "利率越高，企业愿意进行的投资越少。", examHint: "投资曲线右移表示投资需求增加，不等于沿曲线增加投资。" },
      { id: "saving-deficit", kind: "curve", label: "S′ 赤字后的储蓄", color: "#dc2626", path: "M120 340 L520 170", labelX: 430, labelY: 178, dashed: true, description: "财政赤字使可贷资金供给减少。", examHint: "S 左移的结果通常是 r 上升、I 下降。" },
      { id: "loanable-equilibrium", kind: "point", label: "E 原均衡", color: "#111827", x: 330, y: 205, labelX: 342, labelY: 200, description: "储蓄与投资相等的均衡利率和资金量。", examHint: "先读 r，再读可贷资金量。" },
      { id: "deficit-equilibrium", kind: "point", label: "E′ 赤字后均衡", color: "#f59e0b", x: 270, y: 232, labelX: 282, labelY: 228, description: "赤字后均衡利率上升、投资下降。", examHint: "这就是政府借款对私人投资的挤出效应。" },
      { id: "interest-guide", kind: "guide", label: "r 上升", color: "#6b7280", path: "M270 232 H330", labelX: 288, labelY: 224, dashed: true, description: "比较两个均衡点的纵坐标，读出实际利率变化。", examHint: "财政政策不只影响需求，还通过储蓄—投资市场影响利率。" },
    ],
  }),
  dedicatedEconomicsTemplate({
    id: "money-market",
    title: "货币市场均衡",
    subtitle: "实际货币供给竖直，货币需求随利率下降；交点决定均衡利率。",
    xLabel: "实际货币余额 M/P",
    yLabel: "利率 i",
    overview: "价格水平或名义货币供给变化会移动实际货币供给，收入变化会移动货币需求。不要把货币市场的纵轴利率与可贷资金图的实际利率混写。",
    defaultElementId: "money-equilibrium",
    elements: [
      { id: "money-demand", kind: "curve", label: "L(i,Y) 货币需求", color: "#2563eb", path: "M120 92 L520 300", labelX: 458, labelY: 294, description: "利率越低，持有货币的机会成本越低，货币需求越大。", examHint: "收入上升通常使货币需求曲线右移。" },
      { id: "money-supply", kind: "curve", label: "M/P 实际货币供给", color: "#dc2626", path: "M330 70 L330 340", labelX: 340, labelY: 92, description: "给定名义货币供给和价格水平时，实际货币供给是竖直线。", examHint: "名义货币供给增加或价格下降会使实际货币供给右移。" },
      { id: "money-supply-expansion", kind: "curve", label: "M′/P 货币扩张", color: "#059669", path: "M420 70 L420 340", labelX: 430, labelY: 92, dashed: true, description: "扩张性货币政策使实际货币供给右移。", examHint: "短期价格黏性下，货币供给增加通常使利率下降。" },
      { id: "money-equilibrium", kind: "point", label: "E 货币市场均衡", color: "#111827", x: 330, y: 200, labelX: 342, labelY: 196, description: "货币需求与实际货币供给相交，决定均衡利率。", examHint: "读图时先确认供给线位置，再看需求曲线交点。" },
      { id: "money-expansion-equilibrium", kind: "point", label: "E′ 扩张后均衡", color: "#f59e0b", x: 420, y: 248, labelX: 432, labelY: 244, description: "货币供给右移后，均衡利率下降。", examHint: "利率变化还会通过投资影响 IS-LM 和总需求。" },
      { id: "rate-guide", kind: "guide", label: "i*", color: "#6b7280", path: "M80 200 H330", labelX: 48, labelY: 205, dashed: true, description: "均衡利率的水平投影。", examHint: "不要把货币需求曲线与货币供给曲线的斜率方向画反。" },
    ],
  }),
  dedicatedEconomicsTemplate({
    id: "solow-steady-state",
    title: "Solow 模型稳态",
    subtitle: "储蓄投资曲线与维持资本所需投资的交点决定稳态人均资本。",
    xLabel: "人均资本 k",
    yLabel: "人均投资/产出",
    overview: "曲线 sf(k) 表示实际投资，(δ+n+g)k 表示折旧、人口增长和技术进步带来的资本稀释。交点左侧资本增加，右侧资本减少。",
    defaultElementId: "steady-state",
    elements: [
      { id: "saving-investment", kind: "curve", label: "sf(k) 实际投资", color: "#2563eb", path: "M120 300 C220 180 340 120 540 88", labelX: 462, labelY: 104, description: "储蓄率乘以人均产出，随资本增加而上升但边际递减。", examHint: "储蓄率上升使 sf(k) 上移，稳态 k* 和 y* 上升。" },
      { id: "break-even", kind: "curve", label: "(δ+n+g)k 保本投资", color: "#dc2626", path: "M120 330 L540 88", labelX: 430, labelY: 112, description: "维持有效人均资本不变所需的投资。人口增长或折旧率上升会使该线变陡。", examHint: "无技术进步时 g=0；加入技术进步后要用有效工人变量。" },
      { id: "steady-state", kind: "point", label: "k* 稳态", color: "#111827", x: 360, y: 194, labelX: 372, labelY: 190, description: "稳态满足实际投资等于保本投资，资本不再变化。", examHint: "稳态不是经济停止生产，而是人均资本和人均产出不再变化。", formula: "sf(k^*)=(\\delta+n+g)k^*" },
      { id: "output-guide", kind: "guide", label: "y*", color: "#059669", path: "M360 194 H80", labelX: 48, labelY: 199, dashed: true, description: "稳态资本对应稳态人均产出 f(k*)。", examHint: "区分稳态水平和稳态增长率：外生技术进步决定长期人均增长率。" },
      { id: "capital-guide", kind: "guide", label: "k*", color: "#6b7280", path: "M360 194 V340", labelX: 352, labelY: 368, dashed: true, description: "稳态资本投影。", examHint: "判断参数变化时先看两条曲线谁移动，再判断交点。" },
    ],
  }),
  dedicatedEconomicsTemplate({
    id: "ad-as",
    title: "总需求—总供给模型",
    subtitle: "AD、SRAS 与 LRAS 的交点区分短期波动和长期自然产出。",
    xLabel: "实际产出 Y",
    yLabel: "物价水平 P",
    overview: "AD 向右下方倾斜，SRAS 在短期通常向右上方倾斜，LRAS 在自然产出处竖直。需求冲击短期改变产出，预期调整后产出回到自然水平。",
    defaultElementId: "short-run-equilibrium",
    elements: [
      { id: "ad", kind: "curve", label: "AD 总需求", color: "#2563eb", path: "M120 92 L540 318", labelX: 500, labelY: 322, description: "物价越高，实际货币余额越低，能够支持的总支出越少。", examHint: "货币、财政、信心和净出口变化会使 AD 整体移动。" },
      { id: "sras", kind: "curve", label: "SRAS 短期总供给", color: "#dc2626", path: "M120 318 L540 100", labelX: 492, labelY: 108, description: "价格或工资黏性使短期供给向右上方倾斜。", examHint: "负供给冲击使 SRAS 左移，造成滞胀。" },
      { id: "lras", kind: "curve", label: "LRAS 长期总供给", color: "#059669", path: "M340 70 L340 340", labelX: 350, labelY: 86, description: "长期产出由资本、劳动和技术决定，LRAS 位于自然产出处。", examHint: "长期 AD 变化主要改变价格，不改变自然产出。" },
      { id: "short-run-equilibrium", kind: "point", label: "E 短期均衡", color: "#111827", x: 340, y: 205, labelX: 352, labelY: 200, description: "AD、SRAS 和 LRAS 交点是长期均衡；若 AD/SRAS 变化，短期点会偏离 LRAS。", examHint: "画图时标明是短期交点还是长期交点，避免把二者混称。" },
      { id: "natural-output", kind: "guide", label: "Ȳ 自然产出", color: "#6b7280", path: "M340 205 V340", labelX: 326, labelY: 368, dashed: true, description: "自然产出是长期充分就业产出。", examHint: "AD 右移短期使 Y 上升、P 上升，长期 Y 回到 Ȳ。" },
      { id: "price-guide", kind: "guide", label: "P*", color: "#6b7280", path: "M80 205 H340", labelX: 48, labelY: 210, dashed: true, description: "均衡物价水平的投影。", examHint: "物价变化沿既定 AD 移动，非价格冲击才使 AD 移动。" },
    ],
  }),
  dedicatedEconomicsTemplate({
    id: "keynesian-cross",
    title: "凯恩斯交叉图",
    subtitle: "计划支出线与 45° 线的交点给出产品市场均衡收入。",
    xLabel: "收入/产出 Y",
    yLabel: "计划支出 E",
    overview: "45° 线表示实际支出等于收入，计划支出线表示家庭、企业和政府想购买的总额。交点之外会通过存货变化推动产出调整。",
    defaultElementId: "income-equilibrium",
    elements: [
      { id: "forty-five", kind: "curve", label: "45° 线 E=Y", color: "#6b7280", path: "M120 320 L540 80", labelX: 486, labelY: 94, description: "所有点都满足计划支出等于实际产出。", examHint: "它不是需求曲线，而是帮助识别均衡的几何基准。" },
      { id: "planned-expenditure", kind: "curve", label: "E 计划支出", color: "#2563eb", path: "M120 278 C220 235 340 190 540 145", labelX: 478, labelY: 144, description: "计划支出通常随收入上升，但斜率是 MPC，低于 1。", examHint: "政府购买或投资增加使计划支出线平行上移，乘数放大收入变化。", formula: "E=C(Y-T)+I+G" },
      { id: "income-equilibrium", kind: "point", label: "E* 均衡收入", color: "#111827", x: 330, y: 200, labelX: 342, labelY: 196, description: "计划支出等于产出的交点。", examHint: "交点左侧计划支出大于产出，存货下降；右侧则相反。" },
      { id: "income-guide", kind: "guide", label: "Y*", color: "#6b7280", path: "M330 200 V340", labelX: 320, labelY: 368, dashed: true, description: "均衡收入投影。", examHint: "政府购买乘数是 1/(1-MPC)，不是简单的 1。" },
      { id: "spending-guide", kind: "guide", label: "E*", color: "#6b7280", path: "M80 200 H330", labelX: 48, labelY: 205, dashed: true, description: "均衡计划支出投影。", examHint: "在均衡点 E*=Y*，但不要把符号 E* 和企业期望混淆。" },
    ],
  }),
  dedicatedEconomicsTemplate({
    id: "is-lm",
    title: "IS-LM 模型",
    subtitle: "IS 表示产品市场均衡，LM 表示货币市场均衡，交点决定短期收入和利率。",
    xLabel: "收入 Y",
    yLabel: "利率 r",
    overview: "IS 向右下方倾斜，LM 向右上方倾斜。财政政策移动 IS，货币政策移动 LM；交点是两个市场同时均衡的短期组合。",
    defaultElementId: "is-lm-equilibrium",
    elements: [
      { id: "is", kind: "curve", label: "IS 产品市场均衡", color: "#2563eb", path: "M120 90 L540 320", labelX: 482, labelY: 306, description: "利率下降刺激投资，产品市场均衡收入上升。", examHint: "增加政府购买或减税使 IS 右移。" },
      { id: "lm", kind: "curve", label: "LM 货币市场均衡", color: "#dc2626", path: "M120 320 L540 90", labelX: 488, labelY: 104, description: "收入上升增加货币需求，给定实际货币供给下利率上升。", examHint: "增加货币供给使 LM 右下移。" },
      { id: "is-lm-equilibrium", kind: "point", label: "E IS-LM 均衡", color: "#111827", x: 330, y: 205, labelX: 342, labelY: 200, description: "IS 与 LM 交点同时满足产品市场和货币市场均衡。", examHint: "财政扩张通常使 Y、r 上升；货币扩张通常使 Y 上升、r 下降。" },
      { id: "income-guide", kind: "guide", label: "Y*", color: "#6b7280", path: "M330 205 V340", labelX: 320, labelY: 368, dashed: true, description: "短期均衡收入投影。", examHint: "挤出效应来自财政扩张推高利率、抑制投资。" },
      { id: "rate-guide", kind: "guide", label: "r*", color: "#6b7280", path: "M80 205 H330", labelX: 48, labelY: 210, dashed: true, description: "短期均衡利率投影。", examHint: "从 IS-LM 推 AD 时，价格上升会使 M/P 下降，LM 左移。" },
    ],
  }),
  dedicatedEconomicsTemplate({
    id: "mundell-fleming",
    title: "蒙代尔—弗莱明模型",
    subtitle: "资本完全流动时，世界利率与汇率调整共同决定开放经济的短期均衡。",
    xLabel: "收入 Y",
    yLabel: "汇率 e",
    overview: "小型开放经济的国内利率被世界利率钉住，IS* 与 LM* 的交点决定收入和汇率。浮动汇率与固定汇率下政策效果不同。",
    defaultElementId: "mf-equilibrium",
    elements: [
      { id: "is-star", kind: "curve", label: "IS* 产品市场", color: "#2563eb", path: "M120 90 L540 320", labelX: 480, labelY: 306, description: "汇率升值使净出口下降，产品市场均衡收入减少。", examHint: "浮动汇率下扩张性财政政策主要推高汇率，收入效果弱。" },
      { id: "lm-star", kind: "curve", label: "LM* 货币市场", color: "#dc2626", path: "M330 70 L330 340", labelX: 342, labelY: 88, description: "资本完全流动和 r=r* 使 LM* 表现为竖直约束。", examHint: "货币扩张使汇率贬值并提高收入；固定汇率下央行需干预。" },
      { id: "world-rate", kind: "guide", label: "r=r*", color: "#059669", path: "M80 205 H560", labelX: 492, labelY: 198, dashed: true, description: "国内利率等于世界利率是小型开放经济的关键假设。", examHint: "先确认汇率制度，再判断财政和货币政策的有效性。" },
      { id: "mf-equilibrium", kind: "point", label: "E* 开放经济均衡", color: "#111827", x: 330, y: 205, labelX: 342, labelY: 200, description: "IS*、LM* 与世界利率约束共同确定收入和汇率。", examHint: "固定汇率下货币供给是内生的，不能照搬浮动汇率结论。" },
      { id: "income-guide", kind: "guide", label: "Y*", color: "#6b7280", path: "M330 205 V340", labelX: 320, labelY: 368, dashed: true, description: "开放经济均衡收入投影。", examHint: "贸易限制通常使汇率升值，收入不一定改变。" },
    ],
  }),
  dedicatedEconomicsTemplate({
    id: "phillips-curve",
    title: "短期与长期菲利普斯曲线",
    subtitle: "短期通胀—失业取舍向右下倾斜，长期曲线在自然失业率处竖直。",
    xLabel: "失业率 u",
    yLabel: "通货膨胀率 π",
    overview: "短期中未预期的需求扩张可以降低失业并提高通胀；预期调整后，长期失业率回到自然失业率，长期曲线竖直。",
    defaultElementId: "natural-rate",
    elements: [
      { id: "short-run-phillips", kind: "curve", label: "SRPC 短期菲利普斯曲线", color: "#2563eb", path: "M130 100 C230 150 330 220 500 300", labelX: 390, labelY: 240, description: "短期通胀与失业之间存在反向关系。", examHint: "只能写成短期取舍，不能据此断言长期永久降低失业。" },
      { id: "long-run-phillips", kind: "curve", label: "LRPC 长期菲利普斯曲线", color: "#dc2626", path: "M330 70 L330 340", labelX: 342, labelY: 88, description: "长期曲线在自然失业率处竖直。", examHint: "长期通胀预期调整后，失业率回到 uⁿ。" },
      { id: "natural-rate", kind: "point", label: "uⁿ 自然失业率", color: "#111827", x: 330, y: 205, labelX: 342, labelY: 200, description: "自然失业率由搜寻、匹配、制度和结构因素决定。", examHint: "需求管理政策不能永久把失业率压到自然率以下。" },
      { id: "inflation-guide", kind: "guide", label: "π", color: "#6b7280", path: "M80 205 H330", labelX: 48, labelY: 210, dashed: true, description: "给定短期通胀率的投影。", examHint: "供给冲击可能使通胀和失业同时上升，短期菲利普斯曲线整体移动。" },
      { id: "unemployment-guide", kind: "guide", label: "uⁿ", color: "#6b7280", path: "M330 205 V340", labelX: 318, labelY: 368, dashed: true, description: "自然失业率投影。", examHint: "先区分沿短期曲线移动和短期曲线本身移动。" },
    ],
  }),
  dedicatedEconomicsTemplate({
    id: "macro-consumption",
    title: "宏观消费函数",
    subtitle: "消费随可支配收入增加而增加，但斜率 MPC 小于 1。",
    xLabel: "可支配收入 Y-T",
    yLabel: "消费 C",
    overview: "消费函数的斜率是边际消费倾向，截距可以表示自主消费。45° 线用于判断消费等于收入的位置，长期消费理论还要加入财富和预期收入。",
    defaultElementId: "consumption-function",
    elements: [
      { id: "forty-five", kind: "curve", label: "45° 线 C=Yd", color: "#6b7280", path: "M120 320 L540 80", labelX: 486, labelY: 94, description: "收入全部用于消费的参考线。", examHint: "不要把 45° 线当作实际消费函数。" },
      { id: "consumption-function", kind: "curve", label: "C=a+cYd 消费函数", color: "#2563eb", path: "M120 260 L540 145", labelX: 452, labelY: 146, description: "消费函数斜率 c=MPC，通常介于 0 和 1 之间。", examHint: "MPC+MPS=1；税收改变可支配收入，不等于直接改变 MPC。", formula: "C=a+c(Y-T)" },
      { id: "break-even", kind: "point", label: "收支平衡点", color: "#111827", x: 340, y: 200, labelX: 352, labelY: 196, description: "消费函数与 45° 线相交时，储蓄为零。", examHint: "低于收支平衡收入可能负储蓄，高于它才出现正储蓄。" },
      { id: "income-guide", kind: "guide", label: "Yd*", color: "#6b7280", path: "M340 200 V340", labelX: 328, labelY: 368, dashed: true, description: "收支平衡收入投影。", examHint: "短期消费之谜要和生命周期、持久收入理论结合解释。" },
    ],
  }),
  dedicatedEconomicsTemplate({
    id: "investment-demand",
    title: "投资需求与实际利率",
    subtitle: "实际利率是资本的使用成本，利率上升会沿投资需求曲线减少投资。",
    xLabel: "投资 I",
    yLabel: "实际利率 r",
    overview: "企业比较资本边际收益与实际利率，形成向右下方倾斜的投资需求。技术、预期需求和税收优惠会使投资曲线整体移动。",
    defaultElementId: "investment-equilibrium",
    elements: [
      { id: "investment-demand", kind: "curve", label: "I(r) 投资需求", color: "#2563eb", path: "M120 92 L540 320", labelX: 480, labelY: 308, description: "利率越高，资本项目的净现值越低，愿意实施的投资越少。", examHint: "沿曲线移动由 r 变化引起，曲线移动由技术、预期和税收等因素引起。" },
      { id: "investment-shift", kind: "curve", label: "I′ 投资需求右移", color: "#dc2626", path: "M160 80 L580 280", labelX: 496, labelY: 276, dashed: true, description: "技术进步或未来需求乐观会使投资需求右移。", examHint: "融资约束收紧则使投资需求左移。" },
      { id: "investment-equilibrium", kind: "point", label: "E 投资选择", color: "#111827", x: 330, y: 205, labelX: 342, labelY: 200, description: "给定实际利率下，曲线读出最优投资量。", examHint: "不要把购买股票或债券的金融投资与宏观固定投资混为一谈。" },
      { id: "rate-guide", kind: "guide", label: "r*", color: "#6b7280", path: "M80 205 H330", labelX: 48, labelY: 210, dashed: true, description: "市场实际利率投影。", examHint: "名义利率要扣除预期通胀，投资决策看实际融资成本。" },
      { id: "quantity-guide", kind: "guide", label: "I*", color: "#6b7280", path: "M330 205 V340", labelX: 320, labelY: 368, dashed: true, description: "最优投资量投影。", examHint: "净投资还要扣除折旧，总投资=净投资+折旧。" },
    ],
  }),
  dedicatedEconomicsTemplate({
    id: "wage-rigidity",
    title: "实际工资刚性与结构性失业",
    subtitle: "当实际工资被制度或效率工资固定在市场出清水平之上，劳动供给超过劳动需求。",
    xLabel: "劳动 L",
    yLabel: "实际工资 w/P",
    overview: "劳动需求向右下方倾斜，劳动供给向右上方倾斜。刚性工资高于出清工资时，就业由劳动需求决定，多出来的供给形成失业。",
    defaultElementId: "unemployment",
    elements: [
      { id: "labor-demand", kind: "curve", label: "D_L 劳动需求", color: "#2563eb", path: "M120 92 L540 320", labelX: 476, labelY: 308, description: "实际工资越高，企业愿意雇佣的劳动越少。", examHint: "劳动需求由 MRP_L 决定，产品价格或生产率上升会使其右移。" },
      { id: "labor-supply", kind: "curve", label: "S_L 劳动供给", color: "#059669", path: "M120 320 L540 92", labelX: 486, labelY: 104, description: "实际工资越高，愿意工作的劳动者通常越多。", examHint: "要区分劳动力参与、就业和失业三个概念。" },
      { id: "rigid-wage", kind: "guide", label: "刚性工资 w̄", color: "#dc2626", path: "M80 170 H540", labelX: 88, labelY: 162, dashed: true, description: "工会合同、最低工资或效率工资可能使工资不能立即下降。", examHint: "刚性工资高于均衡工资才会产生非自愿失业。" },
      { id: "employment-demand", kind: "point", label: "Ld 就业", color: "#111827", x: 300, y: 170, labelX: 310, labelY: 166, description: "在刚性工资下，企业劳动需求决定实际就业量。", examHint: "就业量沿劳动需求曲线读取，不是供给量。" },
      { id: "unemployment", kind: "area", label: "失业缺口", color: "#f59e0b", path: "M300 170 L420 170 L420 236 L300 170 Z", labelX: 344, labelY: 212, description: "劳动供给量与劳动需求量之间的差额是失业。", examHint: "结构性失业来自工资不能调整或技能匹配失败，不等于所有失业都是自愿的。" },
      { id: "clearing-guide", kind: "point", label: "竞争均衡", color: "#7c3aed", x: 330, y: 205, labelX: 342, labelY: 240, description: "供求交点是没有工资刚性时的市场出清位置。", examHint: "比较刚性工资和均衡工资，才能判断是否存在失业。" },
    ],
  }),
  dedicatedEconomicsTemplate({
    id: "individual-demand",
    title: "个人需求曲线与价格变化",
    subtitle: "把不同价格下的最优购买量重新配对，就得到个人需求曲线。",
    xLabel: "商品 X 数量 x",
    yLabel: "价格 Pₓ",
    overview: "消费者选择模型先在预算—偏好图中找最优组合，再把每个价格对应的 x* 投影到价格—数量图，形成个人需求曲线。",
    defaultElementId: "individual-demand",
    elements: [
      { id: "individual-demand", kind: "curve", label: "Dₓ 个人需求", color: "#2563eb", path: "M130 92 C230 142 330 215 520 318", labelX: 458, labelY: 304, description: "价格越低，最优选择中的商品 X 数量通常越大。", examHint: "需求曲线是最优选择的投影结果，不是直接把预算线当需求曲线。" },
      { id: "high-price", kind: "point", label: "A 高价—少买", color: "#dc2626", x: 250, y: 150, labelX: 262, labelY: 146, description: "较高价格对应较小的最优购买量。", examHint: "价格变化沿需求曲线移动，收入、偏好或相关商品价格变化才使需求曲线移动。" },
      { id: "low-price", kind: "point", label: "B 低价—多买", color: "#059669", x: 420, y: 246, labelX: 432, labelY: 242, description: "较低价格对应较大的最优购买量。", examHint: "总效应可以继续分解为替代效应与收入效应。" },
      { id: "high-price-guide", kind: "guide", label: "P₁", color: "#6b7280", path: "M80 150 H250 M250 150 V340", labelX: 48, labelY: 155, dashed: true, description: "高价格和对应购买量的投影。", examHint: "先读纵轴价格，再读横轴数量，不能把坐标顺序写反。" },
      { id: "low-price-guide", kind: "guide", label: "P₂", color: "#6b7280", path: "M80 246 H420 M420 246 V340", labelX: 48, labelY: 251, dashed: true, description: "低价格和对应购买量的投影。", examHint: "从个人需求横向加总才能得到市场需求。" },
    ],
  }),
  dedicatedEconomicsTemplate({
    id: "open-economy",
    title: "开放经济的实际汇率与净出口",
    subtitle: "净出口曲线与资本净流出相交，决定均衡实际汇率和贸易余额。",
    xLabel: "净出口 NX",
    yLabel: "实际汇率 ε",
    overview: "小型开放经济中，资本净流出 S-I 可看作给定的净出口供给；实际汇率调整到使 NX(ε)=S-I。汇率升值会降低净出口。",
    defaultElementId: "open-equilibrium",
    elements: [
      { id: "net-exports", kind: "curve", label: "NX(ε) 净出口需求", color: "#2563eb", path: "M120 92 L520 300", labelX: 456, labelY: 294, description: "实际汇率升值使本国产品相对更贵，净出口下降。", examHint: "沿 NX 曲线移动由实际汇率变化引起，曲线移动来自外国收入、国内收入或贸易政策。" },
      { id: "capital-outflow", kind: "guide", label: "S-I 资本净流出", color: "#dc2626", path: "M330 70 L330 340", labelX: 342, labelY: 88, description: "国民储蓄减投资决定资本净流出，因而决定可供匹配的净出口量。", examHint: "开放经济恒等式是 NX=S-I，也是经常账户与资本账户联系的核心。" },
      { id: "open-equilibrium", kind: "point", label: "E 开放经济均衡", color: "#111827", x: 330, y: 205, labelX: 342, labelY: 200, description: "NX(ε) 与 S-I 的交点决定实际汇率和净出口。", examHint: "财政赤字降低 S-I，通常使实际汇率升值、净出口下降。" },
      { id: "exchange-rate-guide", kind: "guide", label: "ε*", color: "#6b7280", path: "M80 205 H330", labelX: 48, labelY: 210, dashed: true, description: "均衡实际汇率投影。", examHint: "购买力平价是长期基准，不要把短期资本流动图直接当作 PPP。" },
      { id: "trade-guide", kind: "guide", label: "NX*", color: "#6b7280", path: "M330 205 V340", labelX: 320, labelY: 368, dashed: true, description: "均衡净出口投影。", examHint: "NX>0 表示贸易顺差，NX<0 表示贸易逆差。" },
    ],
  }),
];

function chapterGraphTemplate(config: Omit<EconomicsGraphTemplate, "viewBox">): EconomicsGraphTemplate {
  return dedicatedEconomicsTemplate(config);
}

const additionalEconomicsGraphTemplates: EconomicsGraphTemplate[] = [
  chapterGraphTemplate({
    id: "network-demand", title: "网络外部性与需求曲线移动", subtitle: "他人的购买行为改变我的支付意愿，因此移动的是需求曲线本身。", xLabel: "数量 Q", yLabel: "价格 P",
    overview: "从众效应使购买者越多，个人需求越向右；攀比效应可能使一部分消费者反而减少购买。先区分沿曲线移动和曲线整体移动。", defaultElementId: "network-new",
    elements: [
      { id: "network-old", kind: "curve", label: "D₀ 初始需求", color: "#6b7280", path: "M120 100 L520 320", labelX: 470, labelY: 314, description: "其他消费者购买量给定时的个人需求。", examHint: "价格变化沿 D₀ 移动。" },
      { id: "network-new", kind: "curve", label: "D₁ 从众后需求", color: "#2563eb", path: "M180 90 L580 310", labelX: 520, labelY: 306, description: "更多人购买提高了本人的支付意愿，需求右移。", examHint: "网络规模变化是非价格因素，属于需求曲线移动。" },
      { id: "network-price", kind: "guide", label: "P₀", color: "#6b7280", path: "M80 210 H430 M430 210 V340", labelX: 48, labelY: 215, dashed: true, description: "同一价格下，需求右移对应更大购买量。", examHint: "先固定价格再比较数量。" },
      { id: "network-old-point", kind: "point", label: "Q₀", color: "#dc2626", x: 300, y: 210, labelX: 310, labelY: 206, description: "网络效应发生前的数量。", examHint: "不要误写成沿 D₁ 移动。" },
      { id: "network-new-point", kind: "point", label: "Q₁", color: "#111827", x: 430, y: 210, labelX: 440, labelY: 206, description: "网络效应发生后的数量。", examHint: "从众效应通常扩大市场需求。" },
    ],
  }),
  chapterGraphTemplate({
    id: "risk-return", title: "风险—收益与投资组合选择", subtitle: "更高的期望收益通常伴随更高风险，投资者在可行前沿上选择最偏好的组合。", xLabel: "风险 σ", yLabel: "期望收益 E(R)",
    overview: "把无差异曲线与风险—收益可行集放在同一图中，能同时解释风险溢价、多样化和最优组合。", defaultElementId: "portfolio-optimum",
    elements: [
      { id: "frontier", kind: "curve", label: "可行组合前沿", color: "#2563eb", path: "M150 300 C240 250 340 170 520 92", labelX: 438, labelY: 112, description: "不同资产权重形成的风险—收益组合边界。", examHint: "有效前沿是给定风险下收益最高的组合。" },
      { id: "indifference", kind: "curve", label: "投资者无差异曲线", color: "#7c3aed", path: "M170 330 C280 240 390 200 540 170", labelX: 445, labelY: 174, description: "越靠左上通常代表更高偏好。", examHint: "风险厌恶者偏好更陡的收益补偿。" },
      { id: "portfolio-optimum", kind: "point", label: "E 最优组合", color: "#111827", x: 360, y: 190, labelX: 372, labelY: 186, description: "无差异曲线与有效前沿相切的组合。", examHint: "不要只看收益最大，还要考虑风险。" },
      { id: "risk-guide", kind: "guide", label: "σ*", color: "#6b7280", path: "M360 190 V340", labelX: 350, labelY: 368, dashed: true, description: "最优组合承担的风险。", examHint: "分散化通常降低非系统风险。" },
    ],
  }),
  chapterGraphTemplate({
    id: "production-curves", title: "TP、AP 与 MP 三条短期产量曲线", subtitle: "MP 是 TP 的斜率，AP 是原点射线斜率，MP=AP 时 AP 达到最大。", xLabel: "劳动 L", yLabel: "产量/劳动生产率",
    overview: "用同一组示意点把总产量、平均产量和边际产量的关系放在一张图中，避免把三条曲线的纵轴含义混在一起。", defaultElementId: "mp-ap-cross",
    elements: [
      { id: "tp", kind: "curve", label: "TP 总产量", color: "#2563eb", path: "M120 320 C190 292 250 220 320 150 C390 92 470 86 540 140", labelX: 492, labelY: 132, description: "总产量先加速、后减速，MP=0 时达到峰值。", examHint: "TP 的斜率就是 MP。" },
      { id: "mp", kind: "curve", label: "MP 边际产量", color: "#dc2626", path: "M120 300 C210 250 270 120 340 110 C430 120 500 260 540 320", labelX: 475, labelY: 246, description: "新增一单位劳动带来的产量增量。", examHint: "MP>0 时 TP 上升，MP<0 时 TP 下降。" },
      { id: "ap", kind: "curve", label: "AP 平均产量", color: "#059669", path: "M120 290 C220 225 300 170 380 182 C460 200 510 250 540 300", labelX: 480, labelY: 236, description: "平均每单位劳动的产量。", examHint: "MP 曲线穿过 AP 最高点。" },
      { id: "mp-ap-cross", kind: "point", label: "MP=AP", color: "#111827", x: 380, y: 182, labelX: 392, labelY: 178, description: "边际产量与平均产量相等的位置。", examHint: "此处 AP 达到最大。" },
      { id: "tp-peak", kind: "point", label: "TP 最大", color: "#f59e0b", x: 470, y: 88, labelX: 482, labelY: 84, description: "MP=0 对应总产量峰值。", examHint: "不要把 TP 最大与 AP 最大混为一谈。" },
      { id: "production-guide", kind: "guide", label: "MP=AP、MP=0", color: "#6b7280", path: "M380 182 V340 M470 88 V340", labelX: 382, labelY: 368, dashed: true, description: "两条投影线分别标出 AP 最大和 TP 最大的位置。", examHint: "先看 MP 与零轴、AP 的交点，再判断 TP 和 AP 的峰值。" },
    ],
  }),
  chapterGraphTemplate({
    id: "scale-returns", title: "规模报酬", subtitle: "按相同比例扩大全部投入，比较产出扩大比例，而不是沿单条等产量线换投入。", xLabel: "资本 K", yLabel: "劳动 L",
    overview: "规模报酬递增、 不变和递减分别对应等产量线间距逐渐变小、相等或变大。图形与边际技术替代率递减必须分开。", defaultElementId: "q2",
    elements: [
      { id: "q1", kind: "curve", label: "q₁", color: "#6b7280", path: "M160 280 C250 230 340 190 480 150", labelX: 454, labelY: 146, description: "较低产量等产量线。", examHint: "比较曲线离原点的距离和间距。" },
      { id: "q2", kind: "curve", label: "q₂", color: "#2563eb", path: "M180 330 C300 260 390 220 540 170", labelX: 510, labelY: 166, description: "扩大投入后的产量水平。", examHint: "若投入加倍、产量超过两倍，是规模报酬递增。" },
      { id: "ray", kind: "guide", label: "扩张路径", color: "#dc2626", path: "M130 330 L520 90", labelX: 430, labelY: 100, dashed: true, description: "沿同一投入比例方向比较规模。", examHint: "规模报酬看射线上的产量变化。" },
      { id: "q2-point", kind: "point", label: "规模比较", color: "#111827", x: 360, y: 220, labelX: 372, labelY: 216, description: "同一比例扩张后的参考组合。", examHint: "不要用单个投入增加判断规模报酬。" },
    ],
  }),
  chapterGraphTemplate({
    id: "long-run-cost", title: "长期成本曲线与短期成本包络", subtitle: "长期平均成本是不同工厂规模短期平均成本曲线的下包络。", xLabel: "产量 Q", yLabel: "成本",
    overview: "工厂规模可调时，企业会在每个产量选择成本最低的短期工厂。LRAC 的下降段体现规模经济，最低点之后体现规模不经济。", defaultElementId: "lrac",
    elements: [
      { id: "srac-small", kind: "curve", label: "SRAC₁ 小厂", color: "#94a3b8", path: "M120 300 C210 120 310 120 420 300", labelX: 220, labelY: 150, description: "小规模工厂的短期平均成本。", examHint: "不同工厂规模对应不同 SRAC。" },
      { id: "srac-medium", kind: "curve", label: "SRAC₂ 中厂", color: "#7c3aed", path: "M180 320 C280 120 390 120 500 320", labelX: 350, labelY: 150, description: "中等规模工厂的短期平均成本。", examHint: "LRAC 在每个产量处取最低点。" },
      { id: "srac-large", kind: "curve", label: "SRAC₃ 大厂", color: "#f59e0b", path: "M250 330 C350 130 460 130 560 330", labelX: 450, labelY: 164, description: "大规模工厂的短期平均成本。", examHint: "长期不是把一条 SRAC 延长。" },
      { id: "lrac", kind: "curve", label: "LRAC 长期平均成本", color: "#2563eb", path: "M120 285 C220 180 300 148 390 160 C470 174 520 220 560 285", labelX: 430, labelY: 170, description: "短期平均成本的下包络。", examHint: "LRAC 最低点对应最低有效规模。" },
      { id: "lrac-min", kind: "point", label: "MES", color: "#111827", x: 390, y: 160, labelX: 402, labelY: 156, description: "长期平均成本最低点。", examHint: "规模经济与规模不经济的分界。" },
      { id: "envelope-guide", kind: "guide", label: "MES 投影", color: "#6b7280", path: "M390 160 V340 M80 160 H390", labelX: 48, labelY: 155, dashed: true, description: "从长期平均成本最低点读出最低有效规模和单位成本。", examHint: "LRAC 是短期平均成本的下包络，不是任意一条 SRAC 的延长。" },
    ],
  }),
  chapterGraphTemplate({
    id: "scope-economy", title: "范围经济与产品转换曲线", subtitle: "联合生产两种产品的成本低于分别生产时，存在范围经济。", xLabel: "产品 X", yLabel: "产品 Y",
    overview: "产品转换曲线表示给定资源下两种产品的最大组合；联合生产若位于分别生产机会集合之外，说明共享投入带来范围经济。", defaultElementId: "joint-point",
    elements: [
      { id: "transformation", kind: "curve", label: "产品转换曲线", color: "#2563eb", path: "M130 90 C220 150 300 220 390 280 C450 320 500 340 540 350", labelX: 420, labelY: 310, description: "两种产品之间的生产取舍。", examHint: "曲线斜率是产品转换的机会成本。" },
      { id: "separate-frontier", kind: "curve", label: "分别生产边界", color: "#dc2626", path: "M130 120 L540 330", labelX: 430, labelY: 280, description: "把两种产品完全分开生产时的可行边界。", examHint: "联合生产曲线向外表示范围经济。" },
      { id: "joint-point", kind: "point", label: "J 联合生产", color: "#111827", x: 360, y: 255, labelX: 372, labelY: 250, description: "联合生产可实现的组合。", examHint: "不能把范围经济等同于规模报酬递增。" },
      { id: "tradeoff-guide", kind: "guide", label: "MRT", color: "#6b7280", path: "M360 255 H430 M430 255 V300", labelX: 380, labelY: 248, dashed: true, description: "曲线斜率反映产品之间的边际转换率。", examHint: "比较产品组合变化时要说明机会成本。" },
    ],
  }),
  chapterGraphTemplate({
    id: "learning-curve", title: "学习曲线与动态成本", subtitle: "累计产量增加带来经验积累，单位成本下降，但这不同于静态规模经济。", xLabel: "累计产量", yLabel: "单位成本",
    overview: "学习效应来自做得更多而学得更快；规模经济来自同时扩大投入规模。两者都可能使平均成本下降，但横轴和机制不同。", defaultElementId: "learning",
    elements: [
      { id: "learning", kind: "curve", label: "学习曲线", color: "#2563eb", path: "M120 100 C220 150 300 215 380 260 C450 300 510 325 550 340", labelX: 440, labelY: 292, description: "累计产量越高，单位成本越低。", examHint: "学习曲线横轴是累计产量，不是当期产量。" },
      { id: "scale-cost", kind: "curve", label: "规模成本", color: "#dc2626", path: "M120 320 C240 260 350 210 540 150", labelX: 468, labelY: 174, description: "静态规模经济的成本关系。", examHint: "不要把学习效应写成投入同比例扩张。" },
      { id: "cost-drop", kind: "guide", label: "成本下降", color: "#6b7280", path: "M260 190 H260 M260 190 V300", labelX: 270, labelY: 245, dashed: true, description: "同一经验水平下单位成本的下降。", examHint: "动态成本变化可能影响长期供给和进入壁垒。" },
      { id: "learning-point", kind: "point", label: "经验节点", color: "#111827", x: 380, y: 260, labelX: 392, labelY: 256, description: "累计产量与成本的对应点。", examHint: "经验优势可能形成先发优势。" },
    ],
  }),
  chapterGraphTemplate({
    id: "competitive-supply", title: "竞争厂商的利润、停产与长期供给", subtitle: "短期供给是 AVC 最低点以上的 MC，长期供给还要考虑进入退出与行业成本。", xLabel: "产量 Q", yLabel: "价格/成本",
    overview: "先用 P=MR=MC 找产量，再用 P 与 AC、AVC 比较利润和停产；行业长期供给取决于成本是否随行业扩张变化。", defaultElementId: "profit-price",
    elements: [
      { id: "mc", kind: "curve", label: "MC", color: "#dc2626", path: "M150 310 C250 320 300 270 350 220 C420 150 480 110 540 80", labelX: 505, labelY: 92, description: "边际成本曲线。", examHint: "P=MC 决定短期最优产量。" },
      { id: "ac", kind: "curve", label: "AC", color: "#2563eb", path: "M150 150 C250 230 320 250 390 235 C460 220 510 180 550 140", labelX: 510, labelY: 145, description: "平均总成本。", examHint: "P>AC 有超额利润。" },
      { id: "avc", kind: "curve", label: "AVC", color: "#059669", path: "M150 200 C250 275 330 285 400 270 C470 255 520 220 550 190", labelX: 508, labelY: 202, description: "平均可变成本。", examHint: "P<AVC 最低点时停产。" },
      { id: "profit-price", kind: "guide", label: "P=MR", color: "#7c3aed", path: "M80 180 H390 M390 180 V340", labelX: 48, labelY: 185, dashed: true, description: "竞争厂商把市场价格视为给定。", examHint: "产量点沿 MC 读取。" },
      { id: "profit-area", kind: "area", label: "利润", color: "#f59e0b", path: "M220 180 L390 180 L390 235 L220 235 Z", labelX: 285, labelY: 212, description: "价格高于 AC 时的利润矩形。", examHint: "利润=(P-AC)Q。" },
    ],
  }),
  chapterGraphTemplate({
    id: "trade-welfare", title: "自由贸易、关税与配额福利", subtitle: "世界价格把国内市场分成消费者、生产者和进口区间，关税或配额会造成无谓损失。", xLabel: "数量 Q", yLabel: "价格 P",
    overview: "先标国内供需与世界价格，再读国内生产、消费和进口；政策分析要同时标出税收或配额租以及两块无谓损失。", defaultElementId: "world-price",
    elements: [
      { id: "demand", kind: "curve", label: "D 国内需求", color: "#2563eb", path: "M120 90 L540 320", labelX: 492, labelY: 314, description: "国内边际支付意愿。", examHint: "世界价格下读消费量。" },
      { id: "supply", kind: "curve", label: "S 国内供给", color: "#dc2626", path: "M120 320 L540 90", labelX: 490, labelY: 96, description: "国内边际成本。", examHint: "世界价格下读生产量。" },
      { id: "world-price", kind: "guide", label: "P_w", color: "#059669", path: "M80 210 H540", labelX: 48, labelY: 215, dashed: true, description: "小型开放经济无法影响世界价格。", examHint: "进口量=消费量-生产量。" },
      { id: "tariff-price", kind: "guide", label: "P_w+t", color: "#7c3aed", path: "M80 165 H540", labelX: 48, labelY: 170, dashed: true, description: "关税把国内价格抬高。", examHint: "关税收入是矩形，效率损失是两三角。" },
      { id: "import-area", kind: "area", label: "进口", color: "#f59e0b", path: "M300 210 L430 210 L380 245 Z", labelX: 360, labelY: 236, description: "世界价格下的进口缺口。", examHint: "配额与关税在租金归属上可能不同。" },
    ],
  }),
  chapterGraphTemplate({
    id: "monopolistic-competition", title: "垄断竞争的短期与长期均衡", subtitle: "差异化带来向下倾斜需求，进入退出使长期需求曲线与平均成本相切。", xLabel: "产量 Q", yLabel: "价格/成本",
    overview: "短期先用 MR=MC 找产量，长期新厂商进入会分走需求，使需求左移，直到 P=AC 且利润为零，但仍有过剩生产能力。", defaultElementId: "long-run-tangent",
    elements: [
      { id: "demand", kind: "curve", label: "D 短期需求", color: "#2563eb", path: "M120 95 L540 300", labelX: 490, labelY: 294, description: "差异化产品面对向下倾斜需求。", examHint: "P>MC 说明存在一定市场势力。" },
      { id: "mr", kind: "curve", label: "MR", color: "#7c3aed", path: "M120 150 L450 330", labelX: 430, labelY: 324, description: "需求曲线下方的边际收益。", examHint: "短期产量由 MR=MC。" },
      { id: "ac", kind: "curve", label: "AC", color: "#dc2626", path: "M150 310 C250 170 390 150 540 250", labelX: 480, labelY: 242, description: "平均成本曲线。", examHint: "长期均衡要求需求曲线与 AC 相切。" },
      { id: "long-run-tangent", kind: "point", label: "E 长期相切", color: "#111827", x: 360, y: 200, labelX: 372, labelY: 196, description: "P=AC、利润为零但 P>MC 的长期均衡。", examHint: "零经济利润不等于没有会计收入。" },
      { id: "excess-capacity", kind: "guide", label: "过剩生产能力", color: "#6b7280", path: "M360 200 V340 M430 235 V340", labelX: 382, labelY: 368, dashed: true, description: "实际产量低于 AC 最低点对应产量。", examHint: "垄断竞争的效率损失来自 P>MC 和过剩能力。" },
    ],
  }),
  chapterGraphTemplate({
    id: "monopsony", title: "买方垄断与劳动市场无谓损失", subtitle: "买方垄断用 ME=MRP 决定雇佣量，再从供给曲线读取工资。", xLabel: "劳动 L", yLabel: "工资/边际收益",
    overview: "供给向上倾斜时，买方增加雇佣会提高所有工人的工资，因此 ME 位于供给曲线上方，就业和工资都低于竞争均衡。", defaultElementId: "monopsony-optimum",
    elements: [
      { id: "mrp", kind: "curve", label: "MRP_L", color: "#2563eb", path: "M120 88 L540 310", labelX: 474, labelY: 300, description: "劳动的边际收益产出。", examHint: "买方垄断条件是 MRP=ME。" },
      { id: "supply", kind: "curve", label: "S_L", color: "#059669", path: "M120 320 L540 92", labelX: 486, labelY: 104, description: "劳动供给曲线。", examHint: "工资从 S_L 读取。" },
      { id: "me", kind: "curve", label: "ME_L", color: "#dc2626", path: "M120 350 L540 120", labelX: 470, labelY: 132, description: "边际劳动支出。", examHint: "ME>w，因为新增工资要支付给全部工人。" },
      { id: "monopsony-optimum", kind: "point", label: "M 买方垄断", color: "#111827", x: 280, y: 230, labelX: 292, labelY: 226, description: "MRP 与 ME 的交点决定就业量。", examHint: "从该就业量垂直回到 S_L 读工资。" },
      { id: "competitive-optimum", kind: "point", label: "C 竞争均衡", color: "#f59e0b", x: 340, y: 195, labelX: 352, labelY: 190, description: "MRP 与 S_L 的交点是竞争基准。", examHint: "通常 Lm<Lc、wm<wc。" },
      { id: "deadweight", kind: "area", label: "DWL", color: "#f59e0b", path: "M280 230 L340 195 L280 275 Z", labelX: 292, labelY: 260, description: "就业不足造成的配置损失。", examHint: "工资转移与无谓损失要分开。" },
      { id: "employment-guide", kind: "guide", label: "L_m<L_c", color: "#6b7280", path: "M280 230 V340 M340 195 V340", labelX: 286, labelY: 368, dashed: true, description: "比较买方垄断与竞争均衡的就业量。", examHint: "先由 MRP=ME 找 L_m，再从 S_L 读 w_m；竞争基准由 MRP=S_L 给出。" },
    ],
  }),
  chapterGraphTemplate({
    id: "two-part-tariff", title: "两部收费与消费者剩余攫取", subtitle: "单位价格负责决定消费量，入门费负责转移剩余。", xLabel: "数量 Q", yLabel: "价格/成本",
    overview: "相同消费者时可把单位使用费设为 MC，再把消费者剩余设为入门费；消费者不同则要考虑参与约束和筛选。", defaultElementId: "entry-fee",
    elements: [
      { id: "demand", kind: "curve", label: "D 需求", color: "#2563eb", path: "M120 90 L540 320", labelX: 492, labelY: 314, description: "消费者边际支付意愿。", examHint: "需求曲线下方、价格线上方是消费者剩余。" },
      { id: "mc", kind: "curve", label: "MC", color: "#dc2626", path: "M120 230 H540", labelX: 510, labelY: 224, description: "单位使用费可设为边际成本。", examHint: "p=MC 可实现有效率消费量。" },
      { id: "entry-fee", kind: "area", label: "T 入门费", color: "#f59e0b", path: "M120 230 L360 230 L360 100 L120 230 Z", labelX: 220, labelY: 190, description: "入门费等于目标消费者的剩余上限。", examHint: "先算 CS，再设 T；不能把入门费当单位价格。" },
      { id: "efficient-choice", kind: "point", label: "Q*", color: "#111827", x: 360, y: 230, labelX: 372, labelY: 226, description: "单位价格为 MC 时的消费量。", examHint: "两部收费把效率与分配分开处理。" },
      { id: "fee-guide", kind: "guide", label: "CS=T", color: "#6b7280", path: "M80 100 H360 M360 100 V340", labelX: 48, labelY: 105, dashed: true, description: "入门费对应消费者剩余面积。", examHint: "消费者必须至少获得零净剩余才会进入。" },
    ],
  }),
  chapterGraphTemplate({
    id: "bundling", title: "捆绑销售与相关需求", subtitle: "捆绑可以把不同消费者对两种商品的估值差异压平，从而提高可攫取收入。", xLabel: "商品 A 估值", yLabel: "商品 B 估值",
    overview: "用估值散点图看纯捆绑：单独定价难以同时覆盖差异化估值，捆绑价格线把购买者分成购买与不购买区域。", defaultElementId: "bundle-region",
    elements: [
      { id: "valuation-a", kind: "point", label: "消费者甲", color: "#2563eb", x: 220, y: 270, labelX: 230, labelY: 264, description: "对 A 估值高、对 B 估值低。", examHint: "比较单独购买与捆绑支付意愿。" },
      { id: "valuation-b", kind: "point", label: "消费者乙", color: "#dc2626", x: 430, y: 160, labelX: 440, labelY: 154, description: "对 B 估值高、对 A 估值低。", examHint: "估值负相关时捆绑尤其有利。" },
      { id: "bundle-region", kind: "curve", label: "vA+vB=T 捆绑线", color: "#7c3aed", path: "M150 320 L520 90", labelX: 420, labelY: 120, description: "捆绑价格线把总估值超过 T 的消费者分到购买区。", examHint: "捆绑价不能只看单个商品最高估值。" },
      { id: "bundle-price", kind: "guide", label: "T", color: "#6b7280", path: "M150 320 H520 M520 320 V90", labelX: 500, labelY: 334, dashed: true, description: "捆绑价格的可接受区域。", examHint: "混合捆绑还要比较单买与买包的选择。" },
    ],
  }),
  chapterGraphTemplate({
    id: "advertising", title: "广告、需求弹性与利润", subtitle: "广告同时提高需求和可能的成本，最优广告强度取决于广告弹性。", xLabel: "广告支出 A", yLabel: "需求/利润",
    overview: "广告投入使需求曲线右移，但广告本身也有成本。最优条件可写为广告销售比率等于需求广告弹性与价格弹性绝对值之比。", defaultElementId: "ad-optimum",
    elements: [
      { id: "demand-low", kind: "curve", label: "D₀ 无广告需求", color: "#6b7280", path: "M120 300 L500 120", labelX: 430, labelY: 126, description: "广告前的需求。", examHint: "广告不是沿 D₀ 移动。" },
      { id: "demand-high", kind: "curve", label: "D₁ 广告后需求", color: "#2563eb", path: "M160 300 L540 100", labelX: 470, labelY: 106, description: "广告提高知名度或偏好后需求右移。", examHint: "需求广告弹性越大，广告越有价值。" },
      { id: "profit", kind: "curve", label: "π(A) 利润", color: "#059669", path: "M130 300 C250 180 370 150 530 260", labelX: 450, labelY: 188, description: "利润先因需求扩张上升，过度广告后因成本下降。", examHint: "利润最大点不是广告支出最大点。" },
      { id: "ad-optimum", kind: "point", label: "A*", color: "#111827", x: 370, y: 160, labelX: 382, labelY: 156, description: "利润曲线峰值对应的广告支出。", examHint: "记住 A/(PQ)=E_A/|E_d|。" },
      { id: "ad-guide", kind: "guide", label: "广告收益=成本", color: "#6b7280", path: "M370 160 V340", labelX: 350, labelY: 368, dashed: true, description: "边际广告收益等于边际广告成本。", examHint: "需求弹性变化会改变最优广告强度。" },
    ],
  }),
  chapterGraphTemplate({
    id: "transfer-pricing", title: "内部转移定价与剩余需求", subtitle: "集团内部价格应反映上游的机会成本，不能把外部垄断加价直接当作内部最优价格。", xLabel: "内部转移量 Q", yLabel: "价格/成本",
    overview: "下游需求决定内部用量，上游外部市场机会成本决定最低转移价格；两条曲线之间的转移价格区间取决于集团协调。", defaultElementId: "transfer-point",
    elements: [
      { id: "downstream-demand", kind: "curve", label: "D_d 下游需求", color: "#2563eb", path: "M120 90 L540 320", labelX: 486, labelY: 314, description: "下游愿意为内部投入支付的边际价值。", examHint: "下游产量减少会降低对内部品的需求。" },
      { id: "opportunity-cost", kind: "curve", label: "MC/机会成本", color: "#dc2626", path: "M120 260 C240 250 360 210 540 130", labelX: 450, labelY: 150, description: "上游内部供货放弃外部销售的机会成本。", examHint: "外部竞争市场时转移价接近外部市场价格。" },
      { id: "transfer-range", kind: "guide", label: "p_T 区间", color: "#7c3aed", path: "M80 180 H380 M80 230 H380", labelX: 48, labelY: 176, dashed: true, description: "集团内部协商形成的可行转移价格区间。", examHint: "内部转移只改变利润归属，不必改变集团总利润。" },
      { id: "transfer-point", kind: "point", label: "E 内部最优用量", color: "#111827", x: 380, y: 205, labelX: 392, labelY: 201, description: "集团层面边际收益与机会成本相等。", examHint: "过高转移价会压低下游产量并损害集团利益。" },
    ],
  }),
  chapterGraphTemplate({
    id: "stackelberg", title: "斯塔克尔伯格领导者模型", subtitle: "领导者先承诺产量，追随者沿反应函数调整，领导者把反应函数代回自己的利润。", xLabel: "追随者 q₂", yLabel: "领导者 q₁",
    overview: "先写 q₂=R₂(q₁)，再把它代入领导者利润函数。领导者的先动承诺使均衡总产量通常高于古诺、低于伯特兰。", defaultElementId: "stackelberg-point",
    elements: [
      { id: "follower-reaction", kind: "curve", label: "R₂(q₁) 追随者反应", color: "#dc2626", path: "M120 320 L540 90", labelX: 446, labelY: 104, description: "领导者产量越高，追随者最优产量越低。", examHint: "追随者把领导者产量当作给定。" },
      { id: "leader-contour", kind: "curve", label: "领导者等利润线", color: "#2563eb", path: "M150 280 C250 230 360 180 520 120", labelX: 430, labelY: 140, description: "领导者在反应函数上选使自己利润最大的点。", examHint: "领导者不是忽略对方，而是把对方反应内生化。" },
      { id: "stackelberg-point", kind: "point", label: "S 斯塔克尔伯格均衡", color: "#111827", x: 360, y: 190, labelX: 372, labelY: 186, description: "领导者最优选择与追随者反应的交会点。", examHint: "先动优势来自承诺，而非‘对方必定服从’。" },
      { id: "commitment-guide", kind: "guide", label: "q₁ 承诺", color: "#6b7280", path: "M360 190 V340", labelX: 350, labelY: 368, dashed: true, description: "领导者先选择并承诺产量。", examHint: "若承诺不可置信，序贯均衡要重新求。" },
    ],
  }),
  chapterGraphTemplate({
    id: "bertrand", title: "伯特兰价格竞争", subtitle: "同质产品下，谁的价格略低谁就抢走市场，均衡价格被压到边际成本。", xLabel: "厂商 1 价格 p₁", yLabel: "厂商 2 价格 p₂",
    overview: "价格是策略变量。对称边际成本下，任何高于 MC 的共同价格都能被略微降价打破，因此纳什均衡是 p₁=p₂=MC。", defaultElementId: "bertrand-point",
    elements: [
      { id: "best-response-1", kind: "curve", label: "BR₁", color: "#2563eb", path: "M120 300 H330 V90", labelX: 338, labelY: 100, description: "厂商 1 对厂商 2 价格的最优反应。", examHint: "p₂>MC 时厂商 1 有降价抢量激励。" },
      { id: "best-response-2", kind: "curve", label: "BR₂", color: "#dc2626", path: "M120 300 V90 H330", labelX: 338, labelY: 82, description: "厂商 2 的对称反应。", examHint: "两个反应的交点给价格纳什均衡。" },
      { id: "bertrand-point", kind: "point", label: "B p=MC", color: "#111827", x: 330, y: 300, labelX: 342, labelY: 296, description: "伯特兰均衡价格等于边际成本。", examHint: "差异化产品时通常 P>MC。" },
      { id: "mc-guide", kind: "guide", label: "MC", color: "#6b7280", path: "M80 300 H540 M330 300 V340", labelX: 48, labelY: 305, dashed: true, description: "边际成本基准。", examHint: "不能把伯特兰结论套到差异化产品。" },
    ],
  }),
  chapterGraphTemplate({
    id: "kinked-demand", title: "折弯需求曲线与价格刚性", subtitle: "涨价被对手跟随降价、降价被对手跟随，形成需求折弯和 MR 缺口。", xLabel: "产量 Q", yLabel: "价格 P / MR",
    overview: "在折点以上需求富有弹性、以下需求缺乏弹性，对应 MR 曲线出现缺口；只要 MC 在缺口内移动，价格和产量不变。", defaultElementId: "kink",
    elements: [
      { id: "kink", kind: "curve", label: "D 折弯需求", color: "#2563eb", path: "M120 100 L330 210 L540 260", labelX: 476, labelY: 258, description: "折点处两段需求斜率不同。", examHint: "上段对涨价敏感，下段对降价不敏感。" },
      { id: "mr-upper", kind: "curve", label: "MR 上段", color: "#7c3aed", path: "M120 150 L330 280", labelX: 278, labelY: 270, description: "折点上方需求对应的 MR。", examHint: "降价和涨价的对手反应不对称。" },
      { id: "mr-lower", kind: "curve", label: "MR 下段", color: "#dc2626", path: "M330 150 L540 205", labelX: 470, labelY: 206, description: "折点下方需求对应的 MR。", examHint: "两段 MR 之间形成垂直缺口。" },
      { id: "mc-band", kind: "guide", label: "MC 缺口内移动", color: "#059669", path: "M80 180 H540 M80 240 H540", labelX: 48, labelY: 176, dashed: true, description: "MC 在缺口内变化不改变最优 Q 和 P。", examHint: "超出缺口才会触发价格调整。" },
      { id: "kink-point", kind: "point", label: "K 折点", color: "#111827", x: 330, y: 210, labelX: 342, labelY: 206, description: "现行价格—产量组合。", examHint: "模型能解释刚性，但不能解释折点本身如何形成。" },
    ],
  }),
  chapterGraphTemplate({
    id: "payoff-matrix", title: "囚徒困境支付矩阵", subtitle: "严格占优策略可以导致纳什均衡，但均衡未必帕累托有效。", xLabel: "厂商 B 策略", yLabel: "厂商 A 策略",
    overview: "矩阵图把双方在合作、背叛下的收益放在一起，沿行列比较最佳反应，才能判断占优策略与纳什均衡。", defaultElementId: "nash-cell",
    elements: [
      { id: "matrix-border", kind: "curve", label: "支付矩阵边界", color: "#64748b", path: "M150 110 H500 V300 H150 Z", labelX: 320, labelY: 100, description: "四个格子分别表示四种策略组合。", examHint: "先看每个玩家自己的收益，不要只看总收益。" },
      { id: "cooperate-cell", kind: "area", label: "合作/合作", color: "#059669", path: "M150 110 H325 V205 H150 Z", labelX: 185, labelY: 160, description: "双方合作往往给出更高总收益。", examHint: "合作结果可能被单方背叛偏离。" },
      { id: "nash-cell", kind: "area", label: "背叛/背叛", color: "#f59e0b", path: "M325 205 H500 V300 H325 Z", labelX: 360, labelY: 255, description: "双方严格占优背叛时的纳什均衡。", examHint: "纳什均衡不等于帕累托最优。" },
      { id: "best-response", kind: "guide", label: "最佳反应", color: "#2563eb", path: "M325 110 V300 M150 205 H500", labelX: 332, labelY: 320, dashed: true, description: "逐行逐列标记最佳反应。", examHint: "两个玩家的最佳反应交叉处是纳什均衡。" },
    ],
  }),
  chapterGraphTemplate({
    id: "game-tree", title: "序贯博弈与子博弈精炼均衡", subtitle: "先行动者的承诺、后行动者的最优反应和可信威胁要沿博弈树逆向归纳。", xLabel: "行动顺序", yLabel: "收益/节点",
    overview: "博弈树能显示进入、容纳、阻击等分支。先解末端子博弈，再回到先行动者判断实际路径。", defaultElementId: "equilibrium-path",
    elements: [
      { id: "branch-entry", kind: "curve", label: "进入分支", color: "#2563eb", path: "M130 210 C230 210 250 130 340 130 M250 210 C340 210 370 290 460 290", labelX: 250, labelY: 126, description: "潜在进入者在根节点选择进入或不进入。", examHint: "每个信息集都要考虑后续最优行动。" },
      { id: "response-branch", kind: "curve", label: "容纳/阻击", color: "#dc2626", path: "M340 130 C410 130 430 90 520 90 M340 130 C410 130 430 170 520 170", labelX: 420, labelY: 84, description: "既有厂商在进入后选择容纳或价格战。", examHint: "收益决定威胁是否可信。" },
      { id: "entry-node", kind: "point", label: "根节点", color: "#111827", x: 130, y: 210, labelX: 140, labelY: 205, description: "先行动者决策点。", examHint: "从末端向根节点逆推。" },
      { id: "equilibrium-path", kind: "guide", label: "均衡路径", color: "#059669", path: "M130 210 C230 210 250 130 340 130 M340 130 C410 130 430 170 520 170", labelX: 270, labelY: 230, dashed: true, description: "子博弈精炼均衡选出的实际路径。", examHint: "未发生分支上的行动也必须最优。" },
      { id: "terminal-payoff", kind: "point", label: "末端收益", color: "#f59e0b", x: 520, y: 170, labelX: 530, labelY: 166, description: "比较末端收益后确定后行动者选择。", examHint: "空头威胁不能支撑子博弈精炼均衡。" },
    ],
  }),
  chapterGraphTemplate({
    id: "auction", title: "拍卖机制与赢者诅咒", subtitle: "英式、荷式和密封投标的出价规则不同，共同价值拍卖要警惕赢者诅咒。", xLabel: "出价 b", yLabel: "价值/概率",
    overview: "图形用价值—出价关系比较私人价值与共同价值：出价超过真实期望价值会带来负收益，信息越不充分，赢者诅咒越明显。", defaultElementId: "truth-value",
    elements: [
      { id: "truth-value", kind: "curve", label: "v 私人价值", color: "#2563eb", path: "M120 320 L540 90", labelX: 490, labelY: 100, description: "竞拍者对标的物的私人估值。", examHint: "私人价值拍卖通常出价不超过自身估值。" },
      { id: "expected-value", kind: "curve", label: "E(v|信息) 期望价值", color: "#dc2626", path: "M120 260 L540 150", labelX: 430, labelY: 160, description: "共同价值下基于信息形成的条件期望。", examHint: "赢得拍卖往往意味着自己高估了价值。" },
      { id: "bid", kind: "guide", label: "b 出价", color: "#7c3aed", path: "M300 320 V120 M80 210 H300", labelX: 288, labelY: 110, dashed: true, description: "出价与价值的比较。", examHint: "先判私人价值还是共同价值，再选策略。" },
      { id: "winner-curse", kind: "point", label: "赢者诅咒", color: "#f59e0b", x: 360, y: 180, labelX: 372, labelY: 176, description: "中标条件暴露了自己高估价值的信号。", examHint: "共同价值拍卖的理性出价通常低于无条件估值。" },
    ],
  }),
  chapterGraphTemplate({
    id: "labor-supply", title: "劳动供给的后弯曲线", subtitle: "工资上升的替代效应鼓励工作，收入效应鼓励休闲，后者占优时劳动供给向后弯曲。", xLabel: "劳动 L", yLabel: "工资 w",
    overview: "低工资段劳动供给向右上方，高工资段可能向左弯。不能把所有工资上升都写成劳动供给增加。", defaultElementId: "backward-bend",
    elements: [
      { id: "backward-bend", kind: "curve", label: "S_L 后弯劳动供给", color: "#2563eb", path: "M130 320 C260 300 350 240 400 150 C430 100 490 92 540 110", labelX: 430, labelY: 106, description: "工资超过某点后，劳动者选择更多休闲。", examHint: "收入效应强于替代效应才会后弯。" },
      { id: "substitution", kind: "guide", label: "替代效应", color: "#059669", path: "M280 270 L350 210", labelX: 290, labelY: 236, dashed: true, description: "工资上升提高闲暇机会成本，推动工作。", examHint: "低工资段通常由替代效应主导。" },
      { id: "income", kind: "guide", label: "收入效应", color: "#dc2626", path: "M430 150 L390 220", labelX: 438, labelY: 190, dashed: true, description: "工资上升提高收入，推动购买休闲。", examHint: "高工资段可能由收入效应主导。" },
      { id: "turning-point", kind: "point", label: "拐点", color: "#111827", x: 400, y: 150, labelX: 412, labelY: 146, description: "两种效应力量相当的位置。", examHint: "劳动供给曲线形状取决于偏好与约束。" },
    ],
  }),
  chapterGraphTemplate({
    id: "bilateral-monopoly", title: "劳动市场双边垄断", subtitle: "买方垄断的 ME 与工会的卖方垄断相遇，工资和就业量需要谈判决定。", xLabel: "劳动 L", yLabel: "工资 w",
    overview: "医院等单一买方与工会等单一卖方同时有势力时，模型只能给出谈判区间，不能仅靠一条最优化条件确定唯一工资。", defaultElementId: "bargaining-band",
    elements: [
      { id: "mrp", kind: "curve", label: "MRP_L 买方需求", color: "#2563eb", path: "M120 90 L540 320", labelX: 480, labelY: 310, description: "买方愿意支付的劳动边际价值。", examHint: "医院希望压低工资但不愿过度减少就业。" },
      { id: "union-supply", kind: "curve", label: "S_U 工会供给/保留工资", color: "#dc2626", path: "M120 320 L540 90", labelX: 470, labelY: 104, description: "工会要求的最低工资或劳动供给条件。", examHint: "工会希望提高工资并维持就业。" },
      { id: "buyer-me", kind: "curve", label: "ME_L 买方边际支出", color: "#7c3aed", path: "M120 350 L540 120", labelX: 470, labelY: 136, description: "买方垄断的边际支出。", examHint: "单边极端结果只是双边谈判边界。" },
      { id: "bargaining-band", kind: "area", label: "谈判区间", color: "#f59e0b", path: "M260 190 L360 205 L360 260 L260 240 Z", labelX: 280, labelY: 230, description: "双方都愿意接受的工资—就业组合区域。", examHint: "最终结果取决于谈判力量和制度。" },
      { id: "agreement", kind: "point", label: "协商结果", color: "#111827", x: 320, y: 225, labelX: 332, labelY: 221, description: "双边垄断下的可行协议点。", examHint: "不能机械写成竞争均衡或买方垄断均衡。" },
      { id: "bargaining-guide", kind: "guide", label: "工资谈判带", color: "#7c3aed", path: "M80 190 H360 M80 260 H360 M320 225 V340", labelX: 48, labelY: 185, dashed: true, description: "辅助线标出可协商工资区间和最终就业投影。", examHint: "双边垄断通常不能仅凭一条边际条件确定唯一工资。" },
    ],
  }),
  chapterGraphTemplate({
    id: "euler-distribution", title: "欧拉定理与要素报酬分配", subtitle: "一次齐次生产函数下，按边际产品支付正好耗尽总产出。", xLabel: "投入规模", yLabel: "产出/报酬",
    overview: "欧拉定理把生产函数的齐次性与劳动、资本收入份额联系起来：Q=MP_L·L+MP_K·K。规模报酬递增时按边际产品支付会留下正利润。", defaultElementId: "euler-point",
    elements: [
      { id: "output", kind: "curve", label: "Q=f(K,L)", color: "#2563eb", path: "M120 310 C230 250 330 170 540 90", labelX: 470, labelY: 104, description: "投入扩大带来产出增加。", examHint: "先确认生产函数是否一次齐次。" },
      { id: "labor-share", kind: "area", label: "劳动报酬", color: "#059669", path: "M150 300 L350 190 L350 300 Z", labelX: 245, labelY: 280, description: "劳动边际产品乘劳动数量。", examHint: "wL=MP_L·L（在 P=1 时）。" },
      { id: "capital-share", kind: "area", label: "资本报酬", color: "#f59e0b", path: "M350 190 L520 100 L520 300 L350 300 Z", labelX: 410, labelY: 270, description: "资本边际产品乘资本数量。", examHint: "两部分之和等于总产出时是规模报酬不变。" },
      { id: "euler-point", kind: "point", label: "欧拉分解", color: "#111827", x: 350, y: 190, labelX: 362, labelY: 186, description: "总产出被要素边际报酬分配。", examHint: "区分数学恒等式和竞争性分配条件。" },
      { id: "euler-guide", kind: "guide", label: "Q=MP_L·L+MP_K·K", color: "#6b7280", path: "M350 190 V300 M80 190 H350", labelX: 48, labelY: 185, dashed: true, description: "把欧拉分解点投影到投入和产出轴。", examHint: "一次齐次生产函数按边际产品支付时，报酬之和耗尽总产出。" },
    ],
  }),
  chapterGraphTemplate({
    id: "investment-timeline", title: "投资项目的现值与净现值", subtitle: "把各期现金流折现到同一时点，再用 NPV 与机会成本比较。", xLabel: "时间 t", yLabel: "现金流",
    overview: "时间线能防止把不同期金额直接相加。负的初始投资在 t=0，未来收益按贴现率折现后相加。", defaultElementId: "npv-point",
    elements: [
      { id: "timeline", kind: "curve", label: "现金流时间线", color: "#64748b", path: "M120 220 H540", labelX: 460, labelY: 212, description: "横轴表示项目生命周期。", examHint: "先标 t=0，再标每期现金流。" },
      { id: "initial-outlay", kind: "guide", label: "-I₀", color: "#dc2626", path: "M160 220 V320", labelX: 146, labelY: 340, dashed: true, description: "初始投资支出。", examHint: "初始支出通常为负现金流。" },
      { id: "future-cash", kind: "guide", label: "CF₁, CF₂", color: "#059669", path: "M330 220 V110 M480 220 V90", labelX: 440, labelY: 82, dashed: true, description: "未来各期现金流。", examHint: "每期都要用对应期数折现。" },
      { id: "npv-point", kind: "point", label: "NPV", color: "#111827", x: 420, y: 260, labelX: 430, labelY: 256, description: "折现现金流之和减去初始投资。", examHint: "NPV>0 才值得接受（在同一风险口径下）。", formula: "NPV=-I_0+\\sum_t\\frac{CF_t}{(1+r)^t}" },
    ],
  }),
  chapterGraphTemplate({
    id: "bond-valuation", title: "债券价格与收益率", subtitle: "市场利率上升会降低固定票息债券的现值，因此债券价格与收益率反向变动。", xLabel: "收益率 r", yLabel: "债券价格 P_B",
    overview: "永久债券、零息债券和附息债券都可用现值定价。曲线读图比死记公式更能防止利率方向写反。", defaultElementId: "bond-point",
    elements: [
      { id: "bond-price", kind: "curve", label: "P_B(r)", color: "#2563eb", path: "M120 90 C220 120 350 210 540 320", labelX: 488, labelY: 314, description: "债券价格随收益率上升而下降。", examHint: "固定票息债券的久期越长，对利率越敏感。" },
      { id: "yield-guide", kind: "guide", label: "r₀", color: "#6b7280", path: "M330 205 V340 M80 205 H330", labelX: 48, labelY: 210, dashed: true, description: "给定市场收益率下的债券价格。", examHint: "现值公式中的贴现率是机会成本。" },
      { id: "bond-point", kind: "point", label: "P₀", color: "#111827", x: 330, y: 205, labelX: 342, labelY: 201, description: "当前债券价格。", examHint: "价格与收益率反向变动。" },
      { id: "rate-shift", kind: "curve", label: "利率上升", color: "#dc2626", path: "M420 90 C470 150 520 240 570 330", labelX: 472, labelY: 150, description: "更高利率对应更低价格区间。", examHint: "债券市场题先写现金流，再判断价格方向。" },
    ],
  }),
  chapterGraphTemplate({
    id: "exhaustible-resource", title: "可耗竭资源与霍特林规则", subtitle: "资源价格扣除边际开采成本后的净价格按利率增长，才没有跨期套利。", xLabel: "时间 t", yLabel: "净资源价格",
    overview: "资源所有者在今天开采还是留到未来之间比较现值。若净价格增长慢于利率，应推迟开采；增长快于利率则应提前开采。", defaultElementId: "hotelling-path",
    elements: [
      { id: "hotelling-path", kind: "curve", label: "p−MC 资源净价", color: "#2563eb", path: "M120 300 C220 260 330 200 540 90", labelX: 450, labelY: 112, description: "净价格按利率增长的路径。", examHint: "霍特林规则是跨期均衡条件，不是任意价格趋势。" },
      { id: "interest-path", kind: "curve", label: "r 贴现基准", color: "#dc2626", path: "M120 290 C240 240 360 190 540 130", labelX: 450, labelY: 144, description: "机会成本决定等待收益。", examHint: "比较资源净价增长率和利率。" },
      { id: "resource-stock", kind: "guide", label: "存量耗尽", color: "#6b7280", path: "M440 80 V340", labelX: 448, labelY: 368, dashed: true, description: "有限存量最终被耗尽。", examHint: "技术进步和新发现会改变路径。" },
      { id: "hotelling-point", kind: "point", label: "跨期均衡", color: "#111827", x: 360, y: 190, labelX: 372, labelY: 186, description: "在该路径上今天与未来开采无套利。", examHint: "先扣除边际开采成本再比较价格。" },
    ],
  }),
  chapterGraphTemplate({
    id: "edgeworth-box", title: "交换效率与埃奇沃思盒状图", subtitle: "两个人的无差异曲线相切处形成交换契约曲线，满足 MRS_A=MRS_B。", xLabel: "A 的商品 X / B 的商品 X", yLabel: "A 的商品 Y / B 的商品 Y",
    overview: "盒子的宽高是总资源，右上角是 B 的原点。两人的无差异曲线相切的点使双方不能再通过交换同时改善。", defaultElementId: "contract-point",
    elements: [
      { id: "box", kind: "curve", label: "资源盒边界", color: "#64748b", path: "M120 90 H520 V330 H120 Z", labelX: 300, labelY: 80, description: "盒子的面积代表全部可分配资源。", examHint: "先标两个原点，再画双方曲线。" },
      { id: "a-indifference", kind: "curve", label: "A 无差异曲线", color: "#2563eb", path: "M160 290 C250 220 330 170 420 120", labelX: 360, labelY: 156, description: "从 A 原点看向右上。", examHint: "A 的效用沿曲线不变。" },
      { id: "b-indifference", kind: "curve", label: "B 无差异曲线", color: "#dc2626", path: "M220 110 C300 170 380 240 480 300", labelX: 410, labelY: 260, description: "从 B 原点看向左下。", examHint: "双方曲线相切是交换效率条件。" },
      { id: "contract-point", kind: "point", label: "E 契约曲线", color: "#111827", x: 330, y: 205, labelX: 342, labelY: 201, description: "无差异曲线相切的有效率配置。", examHint: "MRS_A=MRS_B。" },
      { id: "contract-line", kind: "guide", label: "契约曲线", color: "#059669", path: "M180 280 C280 220 360 170 480 120", labelX: 430, labelY: 118, dashed: true, description: "连接所有交换有效率配置。", examHint: "效率不等于公平。" },
    ],
  }),
  chapterGraphTemplate({
    id: "utility-possibility", title: "效用可能性边界与社会福利", subtitle: "交换效率确定可达效用集合，社会福利函数再决定偏好的社会最优点。", xLabel: "U_A", yLabel: "U_B",
    overview: "效用可能性边界上的点是帕累托有效的，但社会福利函数的权重不同会选择不同点。", defaultElementId: "social-optimum",
    elements: [
      { id: "upf", kind: "curve", label: "UPF 效用可能性边界", color: "#2563eb", path: "M130 310 C220 230 340 150 520 100", labelX: 430, labelY: 112, description: "经济可以实现的效用组合边界。", examHint: "边界上没有可行的帕累托改进。" },
      { id: "welfare-curve", kind: "curve", label: "W 社会福利曲线", color: "#7c3aed", path: "M160 330 C280 250 390 190 540 160", labelX: 450, labelY: 166, description: "不同社会福利水平的等值线。", examHint: "公平权重不同，切点可能不同。" },
      { id: "social-optimum", kind: "point", label: "S 社会最优", color: "#111827", x: 350, y: 190, labelX: 362, labelY: 186, description: "福利曲线与 UPF 的最高切点。", examHint: "帕累托有效不自动等于社会最优。" },
      { id: "efficiency-guide", kind: "guide", label: "帕累托有效", color: "#059669", path: "M350 190 V340", labelX: 330, labelY: 368, dashed: true, description: "把选择点投影到效用坐标。", examHint: "区分效率和公平。" },
    ],
  }),
  chapterGraphTemplate({
    id: "production-box", title: "生产效率与生产契约曲线", subtitle: "两种产品的等产量线相切，满足 MRTS_X=MRTS_Y，生产投入配置有效率。", xLabel: "工厂 A 的劳动/工厂 B 的劳动", yLabel: "工厂 A 的资本/工厂 B 的资本",
    overview: "生产埃奇沃思盒状图把劳动和资本在两个工厂之间分配。等产量线相切的集合形成生产契约曲线。", defaultElementId: "production-contract",
    elements: [
      { id: "production-box", kind: "curve", label: "生产盒边界", color: "#64748b", path: "M120 90 H520 V330 H120 Z", labelX: 300, labelY: 80, description: "两种投入的总资源约束。", examHint: "右上角对应另一工厂原点。" },
      { id: "isoquant-a", kind: "curve", label: "A 等产量线", color: "#2563eb", path: "M160 290 C250 225 330 170 420 120", labelX: 360, labelY: 156, description: "工厂 A 的产量保持不变。", examHint: "沿等产量线比较投入替代。" },
      { id: "isoquant-b", kind: "curve", label: "B 等产量线", color: "#dc2626", path: "M220 110 C310 175 390 235 480 300", labelX: 412, labelY: 260, description: "工厂 B 的等产量线。", examHint: "双方等产量线相切才没有生产改进。" },
      { id: "production-contract", kind: "point", label: "生产契约", color: "#111827", x: 330, y: 205, labelX: 342, labelY: 201, description: "生产效率点。", examHint: "MRTS_A=MRTS_B。" },
      { id: "contract-path", kind: "guide", label: "生产契约曲线", color: "#059669", path: "M180 280 C280 220 360 170 480 120", labelX: 420, labelY: 118, dashed: true, description: "所有生产有效率配置的集合。", examHint: "下一步把这些投入组合映射为 PPF。" },
    ],
  }),
  chapterGraphTemplate({
    id: "ppf-trade", title: "生产可能性边界与比较优势", subtitle: "边际转换率决定机会成本，贸易使消费点超出本国生产边界。", xLabel: "产品 X", yLabel: "产品 Y",
    overview: "先画本国 PPF，再画世界相对价格线。沿比较优势专业化和贸易，可以在 PPF 外达到更高消费组合。", defaultElementId: "trade-consumption",
    elements: [
      { id: "ppf", kind: "curve", label: "PPF", color: "#2563eb", path: "M130 90 C230 130 310 210 390 270 C450 315 500 335 540 345", labelX: 440, labelY: 308, description: "本国生产可能性边界。", examHint: "曲线斜率绝对值是边际转换率。" },
      { id: "price-line", kind: "curve", label: "世界价格线", color: "#dc2626", path: "M150 300 L520 120", labelX: 430, labelY: 128, description: "国际交换比率。", examHint: "世界价格高于本国机会成本的商品是比较优势品。" },
      { id: "autarky", kind: "point", label: "A 自给均衡", color: "#7c3aed", x: 330, y: 215, labelX: 342, labelY: 211, description: "没有贸易时的生产和消费点。", examHint: "自给相对价格等于 PPF 斜率。" },
      { id: "trade-consumption", kind: "point", label: "C 贸易消费", color: "#111827", x: 420, y: 160, labelX: 432, labelY: 156, description: "贸易后可达的消费点。", examHint: "消费点可以在生产边界外。" },
      { id: "specialization", kind: "guide", label: "专业化方向", color: "#059669", path: "M330 215 L500 120", labelX: 392, labelY: 182, dashed: true, description: "沿比较优势方向调整生产。", examHint: "绝对优势不等于比较优势。" },
    ],
  }),
  chapterGraphTemplate({
    id: "lemons-market", title: "柠檬市场与逆向选择", subtitle: "买方无法区分质量时按平均质量定价，高质量卖方退出，市场可能萎缩。", xLabel: "交易量 Q", yLabel: "价格/质量",
    overview: "把高质量与低质量供给放在同一价格轴上，说明信息不对称如何让平均价格下降，进一步诱发高质量退出。", defaultElementId: "lemons-price",
    elements: [
      { id: "high-quality", kind: "curve", label: "高质量卖方保留价", color: "#2563eb", path: "M120 110 L540 300", labelX: 460, labelY: 294, description: "高质量产品的最低接受价格更高。", examHint: "信息充分时可按质量分别定价。" },
      { id: "low-quality", kind: "curve", label: "低质量卖方保留价", color: "#dc2626", path: "M120 260 L540 340", labelX: 452, labelY: 332, description: "低质量产品更愿意以低价出售。", examHint: "平均价格下降会挤出高质量供给。" },
      { id: "lemons-price", kind: "guide", label: "P̄ 平均价格", color: "#7c3aed", path: "M80 210 H540", labelX: 48, labelY: 215, dashed: true, description: "买方按预期平均质量报价。", examHint: "价格由预期质量而非观察到的真实质量决定。" },
      { id: "high-exit", kind: "point", label: "高质量退出", color: "#111827", x: 330, y: 180, labelX: 342, labelY: 176, description: "平均价格低于高质量保留价时，高质量退出。", examHint: "逆向选择发生在交易前。" },
    ],
  }),
  chapterGraphTemplate({
    id: "signaling", title: "市场信号与分离均衡", subtitle: "有效信号必须让高质量类型的信号成本相对更低，从而实现类型分离。", xLabel: "信号强度 e", yLabel: "成本/工资",
    overview: "教育、认证和保修等信号不是因为本身必然提高生产率，而是不同类型承担成本不同。分离均衡与混同均衡要分别判断。", defaultElementId: "separating",
    elements: [
      { id: "high-type-cost", kind: "curve", label: "高类型成本 c_H(e)", color: "#2563eb", path: "M120 300 C240 240 370 160 540 90", labelX: 450, labelY: 104, description: "高类型承担信号成本较低。", examHint: "信号要满足激励相容。" },
      { id: "low-type-cost", kind: "curve", label: "低类型成本 c_L(e)", color: "#dc2626", path: "M120 220 C250 200 380 180 540 170", labelX: 450, labelY: 184, description: "低类型模仿成本更高。", examHint: "成本差异是分离的关键。" },
      { id: "separating", kind: "point", label: "e* 分离信号", color: "#111827", x: 360, y: 180, labelX: 372, labelY: 176, description: "只有高类型愿意选择的信号强度。", examHint: "分离后市场可以根据信号推断类型。" },
      { id: "signal-guide", kind: "guide", label: "工资差", color: "#7c3aed", path: "M360 180 V340 M80 180 H360", labelX: 48, labelY: 185, dashed: true, description: "信号改变雇主对类型的后验判断。", examHint: "信号成本不是社会生产成本时可能存在浪费。" },
    ],
  }),
  chapterGraphTemplate({
    id: "moral-hazard", title: "道德风险与激励合同", subtitle: "行动发生在合同之后且难以观察，完全保险会削弱努力激励。", xLabel: "努力 e", yLabel: "期望收益/成本",
    overview: "把努力的边际收益和边际成本画在一起，说明风险分担与激励之间的权衡。道德风险发生在交易之后。", defaultElementId: "effort-optimum",
    elements: [
      { id: "effort-benefit", kind: "curve", label: "努力边际收益", color: "#2563eb", path: "M120 90 L540 300", labelX: 464, labelY: 294, description: "努力提高成功概率或产出，但边际收益递减。", examHint: "委托人只能通过合同间接激励努力。" },
      { id: "effort-cost", kind: "curve", label: "努力边际成本", color: "#dc2626", path: "M120 310 L540 100", labelX: 470, labelY: 112, description: "努力的辛苦成本通常递增。", examHint: "最优努力在边际收益等于边际成本处。" },
      { id: "effort-optimum", kind: "point", label: "e*", color: "#111827", x: 330, y: 205, labelX: 342, labelY: 201, description: "激励相容下的努力水平。", examHint: "完全保险可能使努力边际收益降为零。" },
      { id: "insurance-guide", kind: "guide", label: "保险—激励权衡", color: "#7c3aed", path: "M330 205 V340", labelX: 300, labelY: 368, dashed: true, description: "风险分担越充分，努力激励可能越弱。", examHint: "合同设计要平衡风险分担与激励。" },
    ],
  }),
  chapterGraphTemplate({
    id: "efficiency-wage", title: "效率工资与失业", subtitle: "高于市场出清工资的工资可能提高努力、降低流动并形成非自愿失业。", xLabel: "劳动 L", yLabel: "工资 w",
    overview: "效率工资模型把工资看作激励变量。企业最优工资在劳动成本与努力效率的比值最低处，可能高于供需均衡。", defaultElementId: "efficiency-wage-point",
    elements: [
      { id: "labor-demand", kind: "curve", label: "D_L", color: "#2563eb", path: "M120 90 L540 320", labelX: 480, labelY: 310, description: "企业对劳动的边际收益需求。", examHint: "工资提高通常减少雇佣量。" },
      { id: "labor-supply", kind: "curve", label: "S_L", color: "#059669", path: "M120 320 L540 90", labelX: 480, labelY: 104, description: "劳动供给。", examHint: "效率工资可能使工资高于出清点。" },
      { id: "effort-ratio", kind: "curve", label: "w/e(w)", color: "#dc2626", path: "M130 300 C240 240 330 150 520 180", labelX: 450, labelY: 174, description: "单位有效劳动成本。", examHint: "最小点对应效率工资。" },
      { id: "efficiency-wage-point", kind: "point", label: "w_e", color: "#111827", x: 330, y: 150, labelX: 342, labelY: 146, description: "效率工资高于市场出清工资的可能位置。", examHint: "失业可成为纪律约束。" },
      { id: "unemployment", kind: "area", label: "非自愿失业", color: "#f59e0b", path: "M280 150 L400 150 L340 210 Z", labelX: 310, labelY: 192, description: "高工资下劳动供给量超过企业需求量。", examHint: "不是所有失业都由最低工资造成。" },
      { id: "wage-guide", kind: "guide", label: "w_e 高于出清工资", color: "#7c3aed", path: "M80 150 H540 M280 150 V340 M400 150 V340", labelX: 84, labelY: 144, dashed: true, description: "从效率工资水平投影需求与供给数量，显示非自愿失业区间。", examHint: "工资高于出清水平时，就业量由企业需求决定，供给量超过需求量。" },
    ],
  }),
];

const macroEconomicsGraphTemplates: EconomicsGraphTemplate[] = [
  chapterGraphTemplate({
    id: "public-good", title: "公共产品的有效供给", subtitle: "公共产品的社会边际收益是各人的边际收益竖向相加。", xLabel: "公共产品数量 G", yLabel: "边际收益/成本",
    overview: "非竞争性和非排他性导致免费搭车。社会最优满足 MB_A+MB_B=MC，而不是把个人需求横向相加。", defaultElementId: "public-optimum",
    elements: [
      { id: "mb-a", kind: "curve", label: "MB_A", color: "#2563eb", path: "M120 90 L540 220", labelX: 480, labelY: 214, description: "成员 A 的边际收益。", examHint: "公共产品需求沿价格轴竖向加总。" },
      { id: "mb-b", kind: "curve", label: "MB_B", color: "#7c3aed", path: "M120 180 L540 300", labelX: 480, labelY: 294, description: "成员 B 的边际收益。", examHint: "不能横向相加数量。" },
      { id: "social-mb", kind: "curve", label: "SMB=MB_A+MB_B", color: "#059669", path: "M120 60 L540 170", labelX: 430, labelY: 164, description: "社会边际收益。", examHint: "社会最优满足 SMB=MC。" },
      { id: "mc-public", kind: "curve", label: "MC", color: "#dc2626", path: "M120 320 L540 90", labelX: 490, labelY: 100, description: "提供公共产品的边际成本。", examHint: "与社会边际收益交点给出有效供给量。" },
      { id: "public-optimum", kind: "point", label: "G*", color: "#111827", x: 350, y: 200, labelX: 362, labelY: 196, description: "公共产品社会最优数量。", examHint: "免费搭车使市场自愿供给通常不足。" },
      { id: "public-guide", kind: "guide", label: "SMB=MC", color: "#6b7280", path: "M350 200 V340 M80 200 H350", labelX: 48, labelY: 195, dashed: true, description: "从社会边际收益与边际成本交点读取公共产品最优数量。", examHint: "公共产品需求沿价格轴竖向加总，不能横向加总个人需求。" },
    ],
  }),
  chapterGraphTemplate({
    id: "common-resource", title: "公共资源与公地悲剧", subtitle: "开放进入时，个体只考虑私人收益，公共资源会被过度使用。", xLabel: "使用量 Q", yLabel: "收益/成本",
    overview: "公共资源具有竞争性但难排他。私人平均收益与社会边际成本的差异，使自由进入的使用量超过社会最优。", defaultElementId: "common-social",
    elements: [
      { id: "private-benefit", kind: "curve", label: "AR 私人平均收益", color: "#2563eb", path: "M120 100 L540 260", labelX: 470, labelY: 254, description: "个体进入者看到的平均收益。", examHint: "开放进入时会有更多人进入。" },
      { id: "private-cost", kind: "curve", label: "MC 私人边际成本", color: "#059669", path: "M120 300 L540 110", labelX: 470, labelY: 122, description: "单个使用者承担的成本。", examHint: "私人决策忽略对他人的拥挤损害。" },
      { id: "social-cost", kind: "curve", label: "MSC 社会边际成本", color: "#dc2626", path: "M120 340 L540 150", labelX: 460, labelY: 162, description: "包含拥挤或资源耗竭损害的社会成本。", examHint: "社会最优满足社会收益=MSC。" },
      { id: "common-social", kind: "point", label: "Q* 社会最优", color: "#111827", x: 280, y: 230, labelX: 292, labelY: 226, description: "限制使用或产权治理后的有效数量。", examHint: "自由进入均衡通常 Q_free>Q*。" },
      { id: "common-free", kind: "point", label: "Q_free", color: "#f59e0b", x: 390, y: 190, labelX: 402, labelY: 186, description: "开放进入下的过度使用量。", examHint: "公地悲剧是外部性和产权缺失的结合。" },
      { id: "common-guide", kind: "guide", label: "Q_free>Q*", color: "#6b7280", path: "M280 230 V340 M390 190 V340", labelX: 286, labelY: 368, dashed: true, description: "比较社会最优使用量与开放进入下的过度使用量。", examHint: "公共资源的竞争性使一个人的使用减少他人可用资源，开放进入会忽略这项外部成本。" },
    ],
  }),
  chapterGraphTemplate({
    id: "coase-bargaining", title: "科斯定理与讨价还价", subtitle: "产权清晰且交易成本为零时，谈判可以把产量推向社会最优。", xLabel: "污染/产量 Q", yLabel: "边际收益/损害",
    overview: "无论初始产权给污染者还是受害者，只要协商无摩擦，最终数量相同；分配结果和谁支付补偿不同。", defaultElementId: "coase-optimum",
    elements: [
      { id: "marginal-benefit", kind: "curve", label: "MB 生产收益", color: "#2563eb", path: "M120 90 L540 310", labelX: 470, labelY: 302, description: "减少污染或扩大产量的边际收益。", examHint: "产权改变分配，不改变零交易成本下的效率数量。" },
      { id: "marginal-damage", kind: "curve", label: "MD 边际损害", color: "#dc2626", path: "M120 320 L540 100", labelX: 470, labelY: 112, description: "污染增加带来的边际损害。", examHint: "社会最优满足 MB=MD。" },
      { id: "bargain-zone", kind: "area", label: "可互利谈判区间", color: "#f59e0b", path: "M250 230 L350 195 L350 250 L250 270 Z", labelX: 270, labelY: 250, description: "双方边际收益与边际损害之间存在互利空间。", examHint: "交易成本、人数和信息会破坏科斯结果。" },
      { id: "coase-optimum", kind: "point", label: "Q*", color: "#111827", x: 300, y: 220, labelX: 312, labelY: 216, description: "谈判达到的社会最优数量。", examHint: "效率与补偿分配要分开。" },
      { id: "coase-guide", kind: "guide", label: "Q* 协商投影", color: "#6b7280", path: "M300 220 V340 M80 220 H300", labelX: 48, labelY: 215, dashed: true, description: "把谈判后的社会最优数量投影到坐标轴。", examHint: "产权决定补偿分配，零交易成本下的效率数量由 MB=MD 决定。" },
    ],
  }),
  chapterGraphTemplate({
    id: "circular-flow", title: "国民收入循环流量", subtitle: "家庭提供要素并获得收入，企业生产并支付要素报酬，支出与收入在循环中相等。", xLabel: "部门关系", yLabel: "资金/实物流",
    overview: "循环流量图把产品市场、要素市场、家庭、企业、政府和国外部门连在一起，帮助检查 GDP 三种核算口径的一致性。", defaultElementId: "income-flow",
    elements: [
      { id: "household", kind: "point", label: "家庭", color: "#2563eb", x: 180, y: 200, labelX: 142, labelY: 200, description: "提供劳动资本并购买产品。", examHint: "家庭得到工资、租金、利息和利润。" },
      { id: "firm", kind: "point", label: "企业", color: "#dc2626", x: 460, y: 200, labelX: 470, labelY: 200, description: "购买要素并生产产品。", examHint: "企业支出形成要素收入。" },
      { id: "income-flow", kind: "curve", label: "要素收入流", color: "#059669", path: "M220 170 C300 90 380 90 420 170", labelX: 300, labelY: 100, description: "工资、租金、利润从企业流向家庭。", examHint: "收入法核算 GDP。" },
      { id: "spending-flow", kind: "curve", label: "消费支出流", color: "#7c3aed", path: "M420 230 C340 310 260 310 220 230", labelX: 300, labelY: 318, description: "家庭消费支出回到企业。", examHint: "支出法核算 GDP。" },
      { id: "flow-guide", kind: "guide", label: "政府/国外漏出注入", color: "#f59e0b", path: "M320 120 V280", labelX: 330, labelY: 200, dashed: true, description: "储蓄、税收和进口是漏出，投资、政府购买和出口是注入。", examHint: "Y=C+I+G+NX。" },
    ],
  }),
  chapterGraphTemplate({
    id: "macro-indicators", title: "GDP、CPI 与失业率的测量", subtitle: "宏观数据图要区分产量流量、价格指数和劳动力市场存量。", xLabel: "时间 t", yLabel: "指数/百分比",
    overview: "GDP 关注最终产品产量，CPI 关注固定消费篮子价格，失业率关注失业人口占劳动力比例。三者不能用一条指标替代。", defaultElementId: "cpi-path",
    elements: [
      { id: "real-gdp", kind: "curve", label: "实际 GDP", color: "#2563eb", path: "M120 300 C220 270 320 190 540 90", labelX: 470, labelY: 104, description: "剔除价格因素后的产出。", examHint: "实际 GDP 适合衡量产量增长。" },
      { id: "cpi-path", kind: "curve", label: "CPI", color: "#dc2626", path: "M120 320 C240 270 350 230 540 150", labelX: 480, labelY: 160, description: "消费篮子价格指数。", examHint: "GDP 平减指数与 CPI 篮子不同。" },
      { id: "unemployment-path", kind: "curve", label: "失业率", color: "#059669", path: "M120 140 C230 180 330 150 540 210", labelX: 470, labelY: 214, description: "失业人口占劳动力比例。", examHint: "失业率下降不等于所有人都找到工作，可能有人退出劳动力。" },
      { id: "indicator-guide", kind: "guide", label: "基期=100", color: "#6b7280", path: "M80 220 H540", labelX: 48, labelY: 225, dashed: true, description: "价格指数常以基期标准化。", examHint: "增长率与水平值分开写。" },
    ],
  }),
  chapterGraphTemplate({
    id: "quantity-theory", title: "货币数量论与长期物价水平", subtitle: "在货币流通速度和实际产出给定时，货币供给增长主要体现为物价增长。", xLabel: "货币量 M", yLabel: "物价水平 P",
    overview: "交换方程 MV=PY 连接货币、流通速度、价格和产出。长期中货币是名义变量，实际产出由供给侧决定。", defaultElementId: "quantity-point",
    elements: [
      { id: "quantity-relation", kind: "curve", label: "P=MV/Y", color: "#2563eb", path: "M120 320 C220 270 340 190 540 90", labelX: 470, labelY: 104, description: "给定 V、Y 时物价随货币量上升。", examHint: "货币增长率约等于通货膨胀率加实际增长率。" },
      { id: "money-shift", kind: "curve", label: "M′ 扩张", color: "#dc2626", path: "M180 320 C290 250 400 160 580 70", labelX: 492, labelY: 86, description: "货币供给扩张使名义价格水平上移。", examHint: "短期价格黏性时不能直接套长期结论。" },
      { id: "quantity-point", kind: "point", label: "E", color: "#111827", x: 330, y: 205, labelX: 342, labelY: 201, description: "给定货币量对应的长期价格水平。", examHint: "先说明 V、Y 是否给定。" },
      { id: "price-guide", kind: "guide", label: "P↑", color: "#6b7280", path: "M330 205 H80 M420 160 H80", labelX: 48, labelY: 166, dashed: true, description: "比较货币扩张前后的价格水平。", examHint: "区分通货膨胀率和价格水平。" },
    ],
  }),
  chapterGraphTemplate({
    id: "inflation-costs", title: "通货膨胀成本与实际货币余额", subtitle: "通胀降低实际货币余额，带来菜单成本、鞋底成本和税收扭曲。", xLabel: "通胀率 π", yLabel: "实际货币余额/成本",
    overview: "图形把实际货币余额下降和通胀成本联系起来。预期通胀与未预期通胀的再分配效应不同。", defaultElementId: "inflation-cost",
    elements: [
      { id: "real-balances", kind: "curve", label: "M/P 实际余额", color: "#2563eb", path: "M120 90 C220 140 350 240 540 320", labelX: 470, labelY: 312, description: "通胀率上升使持币实际购买力下降。", examHint: "名义货币量不变时，P 上升降低 M/P。" },
      { id: "menu-cost", kind: "curve", label: "通胀成本", color: "#dc2626", path: "M120 320 C230 270 350 170 540 90", labelX: 470, labelY: 104, description: "通胀越高，调价和交易成本可能越大。", examHint: "成本大小取决于制度和通胀是否预期。" },
      { id: "inflation-cost", kind: "point", label: "π*", color: "#111827", x: 330, y: 205, labelX: 342, labelY: 201, description: "给定政策权衡下的通胀参考点。", examHint: "通胀成本不是所有价格变化的同义词。" },
      { id: "cost-guide", kind: "guide", label: "实际余额下降", color: "#6b7280", path: "M330 205 V340", labelX: 300, labelY: 368, dashed: true, description: "把通胀率对应到实际货币余额。", examHint: "通货膨胀税是持有名义货币的机会成本。" },
    ],
  }),
  chapterGraphTemplate({
    id: "classical-production", title: "古典模型的生产与要素市场", subtitle: "给定资本、劳动和技术，生产函数决定自然产出，实际工资由劳动边际产量决定。", xLabel: "劳动 L", yLabel: "实际工资/产出",
    overview: "古典模型先在劳动市场由 MPL 决定实际工资和就业，再由生产函数确定自然产出。价格水平主要决定名义工资。", defaultElementId: "classical-employment",
    elements: [
      { id: "production", kind: "curve", label: "Y=F(K,L)", color: "#2563eb", path: "M120 320 C220 250 320 150 540 90", labelX: 470, labelY: 104, description: "劳动增加带来递减的产出增量。", examHint: "生产函数是供给侧基础。" },
      { id: "mpl", kind: "curve", label: "MPL", color: "#dc2626", path: "M120 90 L540 320", labelX: 482, labelY: 310, description: "劳动边际产品决定竞争性实际工资。", examHint: "w/P=MPL。" },
      { id: "classical-employment", kind: "point", label: "L̄ 自然就业", color: "#111827", x: 330, y: 205, labelX: 342, labelY: 201, description: "劳动供给与 MPL 的交点。", examHint: "自然产出不是由短期总需求决定。" },
      { id: "output-guide", kind: "guide", label: "Ȳ", color: "#059669", path: "M330 205 V340", labelX: 320, labelY: 368, dashed: true, description: "自然就业对应的潜在产出。", examHint: "区分名义工资和实际工资。" },
    ],
  }),
  chapterGraphTemplate({
    id: "solow-golden-rule", title: "Solow 黄金规则资本水平", subtitle: "黄金规则最大化稳态消费：MPK−δ=n（无技术进步时）。", xLabel: "人均资本 k", yLabel: "人均产出/消费",
    overview: "在不同储蓄率产生的稳态中比较消费，黄金规则不是资本越多越好，而是边际产出刚好覆盖资本稀释和折旧。", defaultElementId: "golden-rule",
    elements: [
      { id: "output", kind: "curve", label: "f(k)", color: "#2563eb", path: "M120 300 C230 190 360 120 540 90", labelX: 472, labelY: 104, description: "人均生产函数。", examHint: "产出曲线边际递减。" },
      { id: "break-even", kind: "curve", label: "(n+δ)k", color: "#dc2626", path: "M120 330 L540 110", labelX: 430, labelY: 122, description: "维持资本不变所需投资。", examHint: "资本稀释来自人口增长和折旧。" },
      { id: "consumption", kind: "curve", label: "c(k)=f(k)-(n+δ)k", color: "#059669", path: "M120 280 C240 210 340 180 430 190 C490 205 530 245 550 285", labelX: 430, labelY: 184, description: "稳态消费随资本先增后减。", examHint: "消费峰值对应黄金规则资本。" },
      { id: "golden-rule", kind: "point", label: "k_gold", color: "#111827", x: 390, y: 185, labelX: 402, labelY: 181, description: "稳态消费最大点。", examHint: "不要把黄金规则与最大产出混同。" },
      { id: "golden-guide", kind: "guide", label: "c_max", color: "#7c3aed", path: "M80 185 H390 M390 185 V340", labelX: 48, labelY: 180, dashed: true, description: "从消费峰值投影读取黄金规则资本和最大稳态消费。", examHint: "黄金规则条件是净边际产出等于资本稀释率，而不是产出最大。" },
    ],
  }),
  chapterGraphTemplate({
    id: "growth-accounting", title: "增长核算与技术进步", subtitle: "产出增长可分解为资本深化、劳动增长和全要素生产率。", xLabel: "时间 t", yLabel: "人均产出",
    overview: "增长核算把生产函数对数微分，识别资本、劳动和技术对增长的贡献。技术进步是长期人均增长的关键。", defaultElementId: "tfp-growth",
    elements: [
      { id: "capital-deepening", kind: "curve", label: "资本深化贡献", color: "#2563eb", path: "M120 310 C240 270 350 190 540 120", labelX: 460, labelY: 132, description: "每工人资本提高带来产出增长。", examHint: "需乘以资本收入份额。" },
      { id: "tfp-growth", kind: "curve", label: "TFP 技术进步", color: "#dc2626", path: "M120 280 C250 220 360 130 540 80", labelX: 452, labelY: 94, description: "同样投入下产出提高。", examHint: "TFP 是剩余项，不等于简单的设备增加。" },
      { id: "output-growth", kind: "curve", label: "人均产出增长", color: "#059669", path: "M120 330 C230 250 360 145 540 70", labelX: 440, labelY: 82, description: "各项贡献加总后的增长路径。", examHint: "增长率分解而非水平相加。" },
      { id: "growth-guide", kind: "guide", label: "g_y=αg_k+g_A", color: "#6b7280", path: "M330 205 V340", labelX: 300, labelY: 368, dashed: true, description: "增长核算恒等式的图形标识。", examHint: "先统一每个变量是水平还是增长率。" },
    ],
  }),
  chapterGraphTemplate({
    id: "business-cycle", title: "经济波动、趋势与产出缺口", subtitle: "实际产出围绕长期趋势波动，衰退表现为负产出缺口。", xLabel: "时间 t", yLabel: "实际产出 Y",
    overview: "趋势线代表潜在产出或长期增长路径，实际 GDP 在其周围上下波动。产出缺口连接总需求冲击与失业变化。", defaultElementId: "output-gap",
    elements: [
      { id: "trend", kind: "curve", label: "潜在产出 Ȳ", color: "#64748b", path: "M120 280 L540 100", labelX: 450, labelY: 106, description: "长期趋势或自然产出。", examHint: "潜在产出不等于最大机械产能。" },
      { id: "actual-output", kind: "curve", label: "实际 GDP", color: "#2563eb", path: "M120 300 C180 250 220 290 280 230 C340 170 390 230 440 150 C490 100 520 140 540 80", labelX: 450, labelY: 132, description: "围绕趋势波动的实际产出。", examHint: "峰谷与扩张、衰退对应。" },
      { id: "output-gap", kind: "area", label: "产出缺口", color: "#f59e0b", path: "M300 200 L360 175 L360 140 L300 175 Z", labelX: 310, labelY: 190, description: "实际产出与潜在产出的差距。", examHint: "负缺口通常伴随失业上升。" },
      { id: "cycle-guide", kind: "guide", label: "衰退", color: "#dc2626", path: "M360 175 V340", labelX: 350, labelY: 368, dashed: true, description: "实际产出低于潜在产出的阶段。", examHint: "不要把短期波动写成长期增长下降。" },
    ],
  }),
  chapterGraphTemplate({
    id: "ad-policy", title: "总需求冲击与稳定政策", subtitle: "财政或货币政策移动 AD，短期改变产出和物价，长期产出回到自然水平。", xLabel: "实际产出 Y", yLabel: "物价水平 P",
    overview: "把 AD、SRAS 和 LRAS 同图，直观看到需求扩张的短期乘数效果与长期价格调整。", defaultElementId: "policy-new",
    elements: [
      { id: "ad-old", kind: "curve", label: "AD₀", color: "#6b7280", path: "M120 90 L540 320", labelX: 492, labelY: 314, description: "政策冲击前总需求。", examHint: "货币、G、T、信心都会移动 AD。" },
      { id: "ad-new", kind: "curve", label: "AD₁ 扩张后", color: "#2563eb", path: "M180 90 L600 320", labelX: 548, labelY: 314, description: "扩张性政策使 AD 右移。", examHint: "短期 Y、P 通常都上升。" },
      { id: "sras", kind: "curve", label: "SRAS", color: "#dc2626", path: "M120 320 L540 100", labelX: 492, labelY: 108, description: "短期总供给。", examHint: "供给冲击与需求冲击的方向不同。" },
      { id: "lras", kind: "curve", label: "LRAS", color: "#059669", path: "M350 70 V340", labelX: 360, labelY: 86, description: "自然产出。", examHint: "长期需求扩张主要转化为物价上涨。" },
      { id: "policy-new", kind: "point", label: "E₁", color: "#111827", x: 390, y: 190, labelX: 402, labelY: 186, description: "短期政策后均衡。", examHint: "标明新旧均衡点的 Y 和 P 变化。" },
      { id: "policy-guide", kind: "guide", label: "短期 P₁、Y₁", color: "#7c3aed", path: "M80 190 H390 M390 190 V340", labelX: 48, labelY: 185, dashed: true, description: "把政策后均衡投影到物价和产出轴。", examHint: "短期同时报告物价和产出变化，长期再回到 LRAS。" },
    ],
  }),
  chapterGraphTemplate({
    id: "policy-lags", title: "稳定政策的时滞与自动稳定器", subtitle: "识别、决策和实施时滞会削弱相机抉择，自动稳定器反应较快。", xLabel: "时间 t", yLabel: "产出缺口/政策力度",
    overview: "时间线把冲击发生、数据识别、立法决策和政策生效分开，解释为什么政策可能在经济已经转向后才发挥作用。", defaultElementId: "policy-effect",
    elements: [
      { id: "shock", kind: "curve", label: "产出缺口", color: "#2563eb", path: "M120 220 C210 160 280 180 350 250 C420 300 480 230 540 160", labelX: 460, labelY: 238, description: "经济冲击造成的缺口路径。", examHint: "先判断冲击方向，再判断政策时点。" },
      { id: "discretionary", kind: "curve", label: "相机抉择", color: "#dc2626", path: "M260 320 C340 260 400 180 500 120", labelX: 410, labelY: 154, description: "识别和立法后才开始生效。", examHint: "过晚政策可能放大波动。" },
      { id: "automatic", kind: "curve", label: "自动稳定器", color: "#059669", path: "M130 300 C210 250 280 230 350 220 C430 210 500 190 540 170", labelX: 438, labelY: 202, description: "税收和转移支付随收入自动变化。", examHint: "自动稳定器通常无需新的立法。" },
      { id: "policy-effect", kind: "point", label: "生效", color: "#111827", x: 430, y: 190, labelX: 442, labelY: 186, description: "政策效果出现的时间点。", examHint: "区分内部时滞和外部时滞。" },
      { id: "timing-guide", kind: "guide", label: "识别—决策—生效", color: "#7c3aed", path: "M220 70 V340 M330 70 V340 M430 70 V340", labelX: 212, labelY: 58, dashed: true, description: "三条时间线标出识别、决策和政策生效的先后。", examHint: "政策时滞要按内部时滞和外部时滞分段说明。" },
    ],
  }),
  chapterGraphTemplate({
    id: "debt-dynamics", title: "政府债务动态", subtitle: "债务率变化取决于实际利率、经济增长率和初级赤字。", xLabel: "时间 t", yLabel: "债务/GDP",
    overview: "当增长率高于实际利率且初级预算平衡时，债务率可下降；反之即使没有新增政策，债务率也可能上升。", defaultElementId: "debt-stable",
    elements: [
      { id: "debt-high-growth", kind: "curve", label: "g>r 债务率下降", color: "#059669", path: "M120 100 C240 140 350 220 540 310", labelX: 430, labelY: 274, description: "经济增长快于利率时债务率下降。", examHint: "分子利息与分母 GDP 同时变化。" },
      { id: "debt-low-growth", kind: "curve", label: "r>g 债务率上升", color: "#dc2626", path: "M120 300 C240 250 360 170 540 90", labelX: 450, labelY: 106, description: "利率高于增长率时债务率上升。", examHint: "还要加入初级赤字项。" },
      { id: "debt-stable", kind: "point", label: "稳定债务率", color: "#111827", x: 330, y: 205, labelX: 342, labelY: 201, description: "债务率不再变化的条件。", examHint: "不能只看绝对债务额。" },
      { id: "debt-guide", kind: "guide", label: "b/Y", color: "#6b7280", path: "M330 205 V340", labelX: 320, labelY: 368, dashed: true, description: "债务率是债务存量相对 GDP 的比率。", examHint: "区分赤字流量和债务存量。" },
    ],
  }),
  chapterGraphTemplate({
    id: "consumption-theories", title: "消费理论的三条曲线", subtitle: "凯恩斯、永久收入和生命周期理论对消费—收入关系的斜率与波动给出不同预测。", xLabel: "收入 Y", yLabel: "消费 C",
    overview: "把短期凯恩斯消费函数、永久收入平滑线和生命周期资源配置放在同一图中，理解平均消费倾向和跨期平滑。", defaultElementId: "permanent-income",
    elements: [
      { id: "keynesian", kind: "curve", label: "C=a+bY 凯恩斯", color: "#2563eb", path: "M120 300 L540 120", labelX: 470, labelY: 132, description: "当期收入提高带来消费增加，但边际消费倾向小于 1。", examHint: "短期 APC 随收入提高下降。" },
      { id: "permanent-income", kind: "curve", label: "C(Yp) 永久收入", color: "#059669", path: "M120 320 L540 90", labelX: 450, labelY: 104, description: "消费主要跟随永久收入，暂时收入被平滑。", examHint: "预期收入变化比一次性收入更重要。" },
      { id: "life-cycle", kind: "curve", label: "生命周期消费", color: "#dc2626", path: "M120 250 C220 170 330 120 430 160 C500 190 530 250 540 300", labelX: 430, labelY: 180, description: "消费围绕一生资源配置平滑。", examHint: "年轻借贷、中年储蓄、老年消耗是典型预测。" },
      { id: "consumption-guide", kind: "guide", label: "APC=C/Y", color: "#6b7280", path: "M330 205 V340", labelX: 300, labelY: 368, dashed: true, description: "平均消费倾向是原点射线斜率。", examHint: "不要把 MPC 与 APC 混同。" },
    ],
  }),
  chapterGraphTemplate({
    id: "investment-q", title: "托宾 q 与投资", subtitle: "企业市场价值相对资本重置成本越高，扩大资本存量的激励越强。", xLabel: "投资 I", yLabel: "q 或资本边际价值",
    overview: "托宾 q 把股票市场价值与新增资本成本联系起来，说明融资条件、预期利润和利率如何影响投资需求。", defaultElementId: "q-optimum",
    elements: [
      { id: "q-investment", kind: "curve", label: "I(q)", color: "#2563eb", path: "M120 320 L540 90", labelX: 480, labelY: 104, description: "q 越高，投资越多。", examHint: "q>1 通常表示扩张资本有利。" },
      { id: "capital-cost", kind: "curve", label: "资本使用者成本", color: "#dc2626", path: "M120 100 L540 300", labelX: 460, labelY: 294, description: "利率和折旧决定新增资本成本。", examHint: "利率上升会抑制投资。" },
      { id: "q-optimum", kind: "point", label: "q*", color: "#111827", x: 330, y: 205, labelX: 342, labelY: 201, description: "市场价值与重置成本相匹配的投资点。", examHint: "股票价格变化可先通过 q 影响投资。" },
      { id: "investment-guide", kind: "guide", label: "I*", color: "#6b7280", path: "M330 205 V340", labelX: 320, labelY: 368, dashed: true, description: "最优投资量。", examHint: "区分存量调整和当期投资流量。" },
    ],
  }),
  chapterGraphTemplate({
    id: "money-multiplier", title: "银行体系与货币乘数", subtitle: "准备金进入银行体系后，通过贷款和存款派生扩大货币供给。", xLabel: "基础货币 H", yLabel: "货币供给 M",
    overview: "简单存款乘数模型中 m=1/rr；现实中现金持有、超额准备金和利率政策会让乘数偏离机械值。", defaultElementId: "multiplier-point",
    elements: [
      { id: "multiplier", kind: "curve", label: "M=mH", color: "#2563eb", path: "M120 320 L540 90", labelX: 480, labelY: 104, description: "货币供给与基础货币的放大关系。", examHint: "准备金率下降使斜率增大。" },
      { id: "multiplier-shift", kind: "curve", label: "m′ 更低准备金率", color: "#059669", path: "M120 330 L580 70", labelX: 460, labelY: 84, description: "更低法定准备金率提高乘数。", examHint: "不能忽略公众现金持有。" },
      { id: "multiplier-point", kind: "point", label: "M₀", color: "#111827", x: 330, y: 205, labelX: 342, labelY: 201, description: "给定基础货币对应的货币供给。", examHint: "乘数是比率，不是新增货币量。" },
      { id: "reserve-guide", kind: "guide", label: "rr", color: "#dc2626", path: "M330 205 V340", labelX: 320, labelY: 368, dashed: true, description: "准备金率决定派生存款规模。", examHint: "现代央行也通过利率和资产负债表操作影响货币。" },
    ],
  }),
  chapterGraphTemplate({
    id: "cycle-schools", title: "宏观学派的冲击与调整路径", subtitle: "古典、凯恩斯和真实经济周期理论对价格黏性与冲击来源的假设不同。", xLabel: "实际产出 Y", yLabel: "物价水平 P",
    overview: "同一 AD 冲击在不同总供给假设下产生不同结果：古典长期主要是价格变化，凯恩斯短期同时改变产出与价格，RBC 强调技术冲击。", defaultElementId: "keynesian-point",
    elements: [
      { id: "classical-as", kind: "curve", label: "古典 LRAS", color: "#059669", path: "M350 70 V340", labelX: 360, labelY: 86, description: "价格灵活时产出由供给决定。", examHint: "长期货币中性。" },
      { id: "keynesian-as", kind: "curve", label: "凯恩斯 SRAS", color: "#dc2626", path: "M120 320 L540 100", labelX: 490, labelY: 108, description: "价格黏性使短期供给向右上方倾斜。", examHint: "需求冲击改变产出和价格。" },
      { id: "rbc-shock", kind: "curve", label: "技术冲击", color: "#2563eb", path: "M130 280 C250 230 360 150 540 80", labelX: 450, labelY: 94, description: "真实经济周期模型强调技术冲击移动供给。", examHint: "区分需求冲击和供给冲击。" },
      { id: "keynesian-point", kind: "point", label: "短期均衡", color: "#111827", x: 330, y: 205, labelX: 342, labelY: 201, description: "不同学派对同一冲击的预测分歧。", examHint: "先写假设，再写曲线移动。" },
      { id: "school-guide", kind: "guide", label: "Ȳ 自然产出", color: "#7c3aed", path: "M330 70 V340 M80 205 H330", labelX: 338, labelY: 88, dashed: true, description: "把短期均衡与自然产出基准放在同一坐标中比较。", examHint: "同一需求冲击下，价格黏性、灵活价格和技术冲击的产出反应不同。" },
    ],
  }),
  chapterGraphTemplate({
    id: "phillips-expectations", title: "预期扩展的菲利普斯曲线", subtitle: "短期通胀—失业权衡依赖预期，长期菲利普斯曲线回到自然失业率。", xLabel: "失业率 u", yLabel: "通货膨胀率 π",
    overview: "预期通胀上升使短期菲利普斯曲线上移；长期中预期调整，经济回到自然失业率，不能永久用通胀换低失业。", defaultElementId: "long-run-point",
    elements: [
      { id: "srpc-old", kind: "curve", label: "SRPC₀", color: "#2563eb", path: "M120 100 C260 160 380 240 540 320", labelX: 470, labelY: 310, description: "原预期下的短期菲利普斯曲线。", examHint: "沿 SRPC 移动是需求冲击。" },
      { id: "srpc-new", kind: "curve", label: "SRPC₁ 预期上升", color: "#dc2626", path: "M120 60 C260 120 380 200 540 280", labelX: 460, labelY: 272, description: "预期通胀上升使曲线上移。", examHint: "预期调整会抵消长期权衡。" },
      { id: "lrpc", kind: "curve", label: "LRPC 自然失业率", color: "#059669", path: "M330 70 V340", labelX: 340, labelY: 86, description: "长期菲利普斯曲线在自然失业率处竖直。", examHint: "长期没有稳定的通胀—失业替代。" },
      { id: "long-run-point", kind: "point", label: "u_n", color: "#111827", x: 330, y: 205, labelX: 342, labelY: 201, description: "自然失业率。", examHint: "区分摩擦性、结构性与周期性失业。" },
      { id: "expectation-guide", kind: "guide", label: "π_e↑", color: "#7c3aed", path: "M80 160 H330", labelX: 48, labelY: 165, dashed: true, description: "预期通胀变化的垂直距离。", examHint: "理性预期会更快调整。" },
    ],
  }),
  chapterGraphTemplate({
    id: "open-policy-comparison", title: "固定与浮动汇率下的政策效果", subtitle: "蒙代尔—弗莱明模型中，政策效果取决于汇率制度和资本流动。", xLabel: "收入 Y", yLabel: "汇率 e/利率",
    overview: "把固定汇率的外汇干预和浮动汇率的汇率调整放在一张对比图中，避免只背‘财政有效、货币无效’而漏掉制度条件。", defaultElementId: "floating-monetary",
    elements: [
      { id: "fixed-is", kind: "curve", label: "固定汇率 IS*", color: "#2563eb", path: "M120 100 L540 300", labelX: 480, labelY: 294, description: "财政扩张使 IS* 右移并带来央行干预。", examHint: "固定汇率下货币供给内生调整。" },
      { id: "fixed-lm", kind: "curve", label: "固定汇率 LM*", color: "#dc2626", path: "M330 70 V340", labelX: 340, labelY: 86, description: "汇率目标约束货币市场。", examHint: "财政政策通常更有效。" },
      { id: "floating-is", kind: "curve", label: "浮动汇率 IS*", color: "#059669", path: "M160 110 L580 300", labelX: 500, labelY: 294, description: "浮动汇率下财政冲击会被升值部分抵消。", examHint: "货币扩张通过贬值提高净出口。" },
      { id: "floating-monetary", kind: "point", label: "货币扩张", color: "#111827", x: 390, y: 205, labelX: 402, labelY: 201, description: "浮动汇率下货币扩张提高收入。", examHint: "先写汇率制度，再给政策结论。" },
      { id: "exchange-guide", kind: "guide", label: "e 调整", color: "#7c3aed", path: "M390 205 H80", labelX: 48, labelY: 210, dashed: true, description: "汇率变化是政策传导的一部分。", examHint: "固定汇率下央行买卖外汇维持目标。" },
    ],
  }),
  chapterGraphTemplate({
    id: "laffer-curve", title: "拉弗曲线：税率与税收收入", subtitle: "税率从零提高时税收先增后减，峰值取决于税基和激励反应。", xLabel: "税率 t", yLabel: "税收收入 T",
    overview: "税收收入等于税率乘以税基。税率过低时提高税率扩大收入，税率过高时劳动、储蓄、投资和守法程度下降，税基收缩，收入反而下降。",
    defaultElementId: "revenue-peak",
    elements: [
      { id: "laffer", kind: "curve", label: "T(t) 拉弗曲线", color: "#2563eb", path: "M120 320 C190 300 250 230 330 170 C410 110 500 150 540 320", labelX: 430, labelY: 138, description: "税率与税收收入的倒 U 形关系。", examHint: "只有知道经济位于峰值左侧还是右侧，才能判断减税是否增收。" },
      { id: "zero-left", kind: "point", label: "t=0, T=0", color: "#059669", x: 120, y: 320, labelX: 128, labelY: 312, description: "零税率没有税收收入。", examHint: "税基存在不等于税收收入自动存在。" },
      { id: "zero-right", kind: "point", label: "t=100%, T≈0", color: "#dc2626", x: 540, y: 320, labelX: 430, labelY: 312, description: "极高税率可能使税基消失或转入逃税、地下经济。", examHint: "右端是模型极端，不代表现实税率一定达到 100%。" },
      { id: "revenue-peak", kind: "point", label: "t* 峰值", color: "#111827", x: 330, y: 170, labelX: 342, labelY: 166, description: "税收收入最大的税率位置。", examHint: "峰值两侧的政策含义相反。" },
      { id: "peak-guide", kind: "guide", label: "T_max", color: "#7c3aed", path: "M80 170 H330 M330 170 V340", labelX: 48, labelY: 175, dashed: true, description: "从峰值投影读取最大税收收入与对应税率。", examHint: "拉弗曲线不是无条件的减税增收定理。" },
    ],
  }),
];

// Extra chapter-level diagrams are kept separate from the original template
// set so the older article payloads remain backward compatible.
const extendedEconomicsGraphTemplates: EconomicsGraphTemplate[] = [
  dedicatedEconomicsTemplate({
    id: "production-possibility",
    title: "生产可能性边界与机会成本",
    subtitle: "稀缺资源在两种用途之间配置时，增加一种产出通常要放弃另一种产出。",
    xLabel: "产品 X",
    yLabel: "产品 Y",
    overview: "生产可能性边界把给定资源、技术下可实现的产出组合画出来。边界上的点表示生产效率，边界内的点表示资源未充分利用，边界外的点在当前条件下不可达。",
    defaultElementId: "efficient",
    elements: [
      { id: "ppf", kind: "curve", label: "PPF 生产可能性边界", color: "#2563eb", path: "M120 90 C220 105 300 160 365 225 C430 286 492 320 540 335", labelX: 420, labelY: 310, description: "边界表示现有资源与技术下的最大可实现组合。", examHint: "PPF 上的斜率绝对值体现机会成本，边界向外移动通常来自资源增加或技术进步。" },
      { id: "efficient", kind: "point", label: "E 有效率", color: "#111827", x: 365, y: 225, labelX: 378, labelY: 220, description: "边界上的点用尽了可用资源，属于生产效率意义上的有效点。", examHint: "有效率不等于社会最优，还要结合偏好和分配标准。" },
      { id: "inside", kind: "point", label: "I 边界内", color: "#f59e0b", x: 300, y: 270, labelX: 312, labelY: 266, description: "边界内点可以通过减少闲置或失业提高至少一种产出。", examHint: "不要把边界内点误写成当前技术下不可达。" },
      { id: "outside", kind: "point", label: "U 边界外", color: "#dc2626", x: 470, y: 150, labelX: 482, labelY: 146, description: "边界外组合在当前资源与技术条件下不可实现。", examHint: "技术进步或资源增加可能使原来的边界外点变得可达。" },
      { id: "opportunity-guide", kind: "guide", label: "机会成本", color: "#6b7280", path: "M365 225 H430 M430 225 V286", labelX: 390, labelY: 216, dashed: true, description: "沿边界增加 X 时，需要放弃一定数量的 Y。", examHint: "边界越陡，增加一单位 X 的机会成本越高。" },
    ],
  }),
  dedicatedEconomicsTemplate({
    id: "demand-supply-shifts",
    title: "需求与供给曲线移动",
    subtitle: "非价格冲击使整条曲线移动，旧均衡与新均衡可以在同一坐标系中比较。",
    xLabel: "数量 Q",
    yLabel: "价格 P",
    overview: "把 D0、D1 或 S0、S1 放在一起，直接比较冲击前后的交点。价格变化本身只会造成沿曲线移动，不会让曲线整体平移。",
    defaultElementId: "new-equilibrium",
    elements: [
      { id: "demand-old", kind: "curve", label: "D₀ 初始需求", color: "#2563eb", path: "M120 92 L540 328", labelX: 506, labelY: 326, description: "冲击前的需求曲线。", examHint: "先确认是需求量变动还是需求曲线移动。" },
      { id: "demand-new", kind: "curve", label: "D₁ 需求增加", color: "#7c3aed", path: "M180 92 L600 328", labelX: 548, labelY: 326, description: "偏好、收入或替代品价格变化可能使需求右移。", examHint: "需求右移通常使均衡价格和数量都上升。" },
      { id: "supply-old", kind: "curve", label: "S₀ 初始供给", color: "#dc2626", path: "M120 328 L540 92", labelX: 506, labelY: 94, description: "冲击前的供给曲线。", examHint: "成本、技术和厂商数量变化会使供给曲线移动。" },
      { id: "supply-new", kind: "curve", label: "S₁ 供给增加", color: "#059669", path: "M180 328 L600 92", labelX: 548, labelY: 94, description: "技术进步或成本下降可能使供给右移。", examHint: "供给右移通常使均衡价格下降、数量上升。" },
      { id: "old-equilibrium", kind: "point", label: "E₀ 初始均衡", color: "#111827", x: 330, y: 210, labelX: 342, labelY: 206, description: "初始需求与供给的交点。", examHint: "比较静态要明确新旧均衡点。" },
      { id: "new-equilibrium", kind: "point", label: "E₁ 新均衡", color: "#f59e0b", x: 390, y: 176, labelX: 402, labelY: 172, description: "冲击后曲线与另一条曲线的新交点。", examHint: "两条曲线同时移动时，价格或数量可能出现不确定结论。" },
      { id: "new-guide", kind: "guide", label: "新均衡投影", color: "#6b7280", path: "M80 176 H390 M390 176 V340", labelX: 48, labelY: 181, dashed: true, description: "把新交点投影到价格轴和数量轴。", examHint: "最后必须把曲线移动、交点变化和价格数量结论写成完整链条。" },
    ],
  }),
  dedicatedEconomicsTemplate({
    id: "elasticity-revenue",
    title: "需求弹性与销售收入",
    subtitle: "在线性需求上，需求弹性随位置变化，销售收入在单位弹性点达到峰值。",
    xLabel: "数量 Q",
    yLabel: "价格 P / 总收入",
    overview: "价格与数量的乘积是销售收入。需求富有弹性时降价可能增加收入，缺乏弹性时涨价可能增加收入；单位弹性点对应总收入峰值。",
    defaultElementId: "unit-elastic",
    elements: [
      { id: "demand", kind: "curve", label: "D 线性需求", color: "#2563eb", path: "M120 80 L540 330", labelX: 492, labelY: 322, description: "同一条线性需求曲线不同位置的弹性不同。", examHint: "不能因为斜率恒定就说弹性恒定，弹性还取决于 P/Q。" },
      { id: "revenue", kind: "curve", label: "TR 总收入", color: "#f59e0b", path: "M130 320 C220 250 318 205 390 210 C470 220 520 268 550 320", labelX: 460, labelY: 245, description: "TR=P×Q 在单位弹性处达到最大。", examHint: "利润还要减去成本，收入最大不等于利润最大。" },
      { id: "unit-elastic", kind: "point", label: "E 单位弹性", color: "#111827", x: 360, y: 210, labelX: 372, labelY: 206, description: "单位弹性点把富有弹性和缺乏弹性的区间分开。", examHint: "在线性需求中点通常是单位弹性，但要以具体函数为准。" },
      { id: "elastic-guide", kind: "guide", label: "E=1", color: "#6b7280", path: "M80 210 H360 M360 210 V340", labelX: 48, labelY: 215, dashed: true, description: "单位弹性点的价格和数量投影。", examHint: "写收入题时先判断弹性区间，再判断涨价或降价对 TR 的方向。" },
    ],
  }),
  dedicatedEconomicsTemplate({
    id: "price-controls",
    title: "最高限价、最低限价与市场失衡",
    subtitle: "有约束力的价格管制会让交易量由短边决定，并产生短缺或过剩。",
    xLabel: "数量 Q",
    yLabel: "价格 P",
    overview: "最高限价低于均衡价格时形成短缺，最低限价高于均衡价格时形成过剩。图中同时标出均衡和受管制价格，避免把无约束情形与有效管制混淆。",
    defaultElementId: "ceiling",
    elements: [
      { id: "demand", kind: "curve", label: "D 需求", color: "#2563eb", path: "M120 92 L540 328", labelX: 506, labelY: 326, description: "买方在各个价格下愿意且能够购买的数量。", examHint: "沿需求曲线读数量时要固定其他条件。" },
      { id: "supply", kind: "curve", label: "S 供给", color: "#dc2626", path: "M120 328 L540 92", labelX: 506, labelY: 94, description: "卖方在各个价格下愿意且能够提供的数量。", examHint: "价格管制不等于供给曲线移动。" },
      { id: "ceiling", kind: "guide", label: "Pmax 最高限价", color: "#7c3aed", path: "M80 260 H540", labelX: 82, labelY: 252, dashed: true, description: "低于均衡价格的最高限价有约束力，需求量大于供给量。", examHint: "短缺量是 Qd(Pmax)-Qs(Pmax)，实际成交量由供给短边决定。" },
      { id: "floor", kind: "guide", label: "Pmin 最低限价", color: "#059669", path: "M80 150 H540", labelX: 82, labelY: 142, dashed: true, description: "高于均衡价格的最低限价有约束力，供给量大于需求量。", examHint: "过剩量是 Qs(Pmin)-Qd(Pmin)。" },
      { id: "shortage", kind: "area", label: "短缺", color: "#f59e0b", path: "M250 260 L370 260 L310 294 Z", labelX: 296, labelY: 286, description: "最高限价下买方想买的数量超过卖方愿卖的数量。", examHint: "短缺不等于实际成交量增加。" },
      { id: "surplus", kind: "area", label: "过剩", color: "#f59e0b", path: "M250 150 L370 150 L310 116 Z", labelX: 296, labelY: 130, description: "最低限价下卖方愿卖的数量超过买方愿买的数量。", examHint: "最低工资造成的失业是劳动市场最低限价的同类机制。" },
    ],
  }),
  dedicatedEconomicsTemplate({
    id: "budget-shifts",
    title: "预算线的平移与旋转",
    subtitle: "收入改变使预算线平行移动，单个商品价格改变使预算线绕截距旋转。",
    xLabel: "商品 X",
    yLabel: "商品 Y",
    overview: "比较预算线时先看两个截距，再判断是购买力整体变化还是相对价格变化。收入与所有价格同比例变化时，预算线不变。",
    defaultElementId: "income-new",
    elements: [
      { id: "income-old", kind: "curve", label: "B₀ 初始预算线", color: "#6b7280", path: "M120 318 L520 100", labelX: 470, labelY: 106, description: "原收入和价格给出的预算边界。", examHint: "预算线斜率是 -Px/Py。" },
      { id: "income-new", kind: "curve", label: "B₁ 收入增加", color: "#2563eb", path: "M120 350 L580 100", labelX: 520, labelY: 106, description: "收入增加、价格不变时预算线平行向外移动。", examHint: "收入变化不改变预算线斜率。" },
      { id: "price-new", kind: "curve", label: "B₂ Px 下降", color: "#7c3aed", path: "M120 318 L600 60", labelX: 548, labelY: 70, description: "X 价格下降时绕 Y 轴截距向外旋转。", examHint: "只有一个价格改变时，两个截距不会同比例变化。" },
      { id: "income-guide", kind: "guide", label: "购买力", color: "#6b7280", path: "M120 318 V350 M120 318 H520", labelX: 86, labelY: 336, dashed: true, description: "截距变化帮助识别平移还是旋转。", examHint: "先比较截距，再判断政策对可行集合的影响。" },
    ],
  }),
  dedicatedEconomicsTemplate({
    id: "special-preferences",
    title: "完全替代品与完全互补品",
    subtitle: "偏好形状不同，最优点可能是角点，也可能落在无差异曲线的折点。",
    xLabel: "商品 X",
    yLabel: "商品 Y",
    overview: "完全替代品的无差异曲线是直线，消费者比较每元钱效用后常取角点；完全互补品的无差异曲线呈直角，最优点通常位于固定比例的折点。",
    defaultElementId: "complement-optimum",
    elements: [
      { id: "budget", kind: "curve", label: "预算线", color: "#2563eb", path: "M120 318 L520 90", labelX: 470, labelY: 96, description: "同一预算约束下的可行组合。", examHint: "特殊偏好不能机械套用切点条件。" },
      { id: "substitute", kind: "curve", label: "完全替代无差异线", color: "#7c3aed", path: "M150 280 L500 120", labelX: 420, labelY: 150, description: "直线表示 MRS 恒定。", examHint: "比较 a/Px 与 b/Py，判断只买 X、只买 Y 或任意组合。" },
      { id: "complement", kind: "curve", label: "完全互补无差异线", color: "#059669", path: "M180 300 V190 H390 M240 340 V240 H450", labelX: 390, labelY: 184, description: "直角形状表示固定比例搭配。", examHint: "多出来的单个商品不能替代缺少的配套商品。" },
      { id: "corner-optimum", kind: "point", label: "A 角点解", color: "#dc2626", x: 500, y: 120, labelX: 512, labelY: 116, description: "完全替代品可能把全部收入用于一种商品。", examHint: "角点不要求 MRS=Px/Py。" },
      { id: "complement-optimum", kind: "point", label: "B 配套折点", color: "#111827", x: 390, y: 190, labelX: 402, labelY: 186, description: "完全互补品的最优消费通常在折点。", examHint: "先找固定比例，再检查预算是否允许。" },
      { id: "preference-guide", kind: "guide", label: "最优点投影", color: "#6b7280", path: "M500 120 V340 M390 190 V340 M80 190 H390", labelX: 404, labelY: 368, dashed: true, description: "把角点解和配套折点投影到数量轴，比较两类特殊偏好。", examHint: "完全替代品常为角点，完全互补品通常在折点，不要机械套用切点条件。" },
    ],
  }),
  dedicatedEconomicsTemplate({
    id: "price-consumption",
    title: "价格—消费曲线与个人需求",
    subtitle: "把不同价格下的最优消费点连接起来，再投影到价格—数量平面得到需求曲线。",
    xLabel: "商品 X 数量 x",
    yLabel: "商品 Y / 价格",
    overview: "预算—偏好图中的最优点随 Px 改变而移动，连接这些点得到价格—消费曲线；把 x* 与对应 Px 配对，得到个人需求曲线。",
    defaultElementId: "price-path",
    elements: [
      { id: "budget-high", kind: "curve", label: "B₁ 高 Px", color: "#dc2626", path: "M120 318 L470 118", labelX: 420, labelY: 124, description: "较高的 X 价格使预算线更陡。", examHint: "价格改变先看预算线旋转，再看最优点移动。" },
      { id: "budget-low", kind: "curve", label: "B₂ 低 Px", color: "#2563eb", path: "M120 318 L590 48", labelX: 530, labelY: 62, description: "较低的 X 价格扩大 X 的可购买范围。", examHint: "不要把价格下降直接写成需求曲线右移。" },
      { id: "price-path", kind: "curve", label: "价格—消费路径", color: "#7c3aed", path: "M260 218 C320 205 382 188 450 160", labelX: 410, labelY: 174, description: "不同价格下最优点的轨迹。", examHint: "这条路径仍在商品组合空间，不是需求曲线。" },
      { id: "choice-high", kind: "point", label: "A 高价选择", color: "#dc2626", x: 280, y: 220, labelX: 292, labelY: 216, description: "高价格下的最优组合。", examHint: "把 x 坐标记录下来，作为需求曲线上的一个数量点。" },
      { id: "choice-low", kind: "point", label: "B 低价选择", color: "#059669", x: 440, y: 164, labelX: 452, labelY: 160, description: "低价格下通常购买更多 X。", examHint: "连接价格—数量配对才能得到个人需求。" },
      { id: "price-guide", kind: "guide", label: "x*(Px)", color: "#6b7280", path: "M280 220 V340 M440 164 V340", labelX: 286, labelY: 368, dashed: true, description: "把最优点的 X 坐标投影出来。", examHint: "需求曲线是最优选择的投影，不是预算线本身。" },
    ],
  }),
  dedicatedEconomicsTemplate({
    id: "income-engel",
    title: "收入—消费曲线与恩格尔曲线",
    subtitle: "收入改变会使最优消费组合移动，收入与某商品购买量的配对形成恩格尔曲线。",
    xLabel: "收入 I",
    yLabel: "消费数量",
    overview: "收入—消费曲线画在商品组合空间，恩格尔曲线画在收入—数量空间。正常品、必需品、奢侈品与劣等品的区别要看收入弹性和曲线形状。",
    defaultElementId: "engel-normal",
    elements: [
      { id: "income-path", kind: "curve", label: "收入—消费路径", color: "#2563eb", path: "M160 300 C250 260 330 210 500 120", labelX: 402, labelY: 170, description: "不同收入下最优消费点的轨迹。", examHint: "收入变化不改变相对价格，但可能改变最优数量。" },
      { id: "engel-normal", kind: "curve", label: "正常品恩格尔曲线", color: "#059669", path: "M120 320 C230 270 350 195 540 100", labelX: 440, labelY: 150, description: "正常品收入增加时购买量增加。", examHint: "正常品收入弹性为正。" },
      { id: "engel-inferior", kind: "curve", label: "劣等品恩格尔曲线", color: "#dc2626", path: "M120 110 C260 160 380 245 540 320", labelX: 430, labelY: 260, description: "劣等品收入增加时购买量可能减少。", examHint: "劣等品收入弹性为负，不等于质量必然差。" },
      { id: "income-guide", kind: "guide", label: "收入增加", color: "#6b7280", path: "M160 300 H540 M120 320 V100", labelX: 430, labelY: 312, dashed: true, description: "横轴收入、纵轴购买量的配对关系。", examHint: "恩格尔曲线不要和预算线混淆。" },
    ],
  }),
  dedicatedEconomicsTemplate({
    id: "slutsky-decomposition",
    title: "替代效应与收入效应分解",
    subtitle: "价格变化先改变相对价格，再改变实际购买力，总效应可分解为替代效应和收入效应。",
    xLabel: "商品 X",
    yLabel: "商品 Y",
    overview: "用原预算线、补偿预算线和新预算线区分 A→B 的替代效应与 B→C 的收入效应。补偿方式不同会改变中间点，但总效应一致。",
    defaultElementId: "compensated-choice",
    elements: [
      { id: "old-budget", kind: "curve", label: "B₀ 原预算线", color: "#6b7280", path: "M120 318 L500 100", labelX: 450, labelY: 108, description: "价格变化前的预算约束。", examHint: "A 是原价格下的最优点。" },
      { id: "comp-budget", kind: "curve", label: "Bᶜ 补偿预算线", color: "#7c3aed", path: "M150 318 L560 82", labelX: 500, labelY: 90, description: "保持原效用或原购买力的辅助预算线。", examHint: "补偿线只用于分解，不是现实中一定存在的预算线。" },
      { id: "new-budget", kind: "curve", label: "B₁ 新预算线", color: "#2563eb", path: "M120 318 L590 48", labelX: 530, labelY: 58, description: "价格变化后的预算约束。", examHint: "C 是新价格下的最终最优点。" },
      { id: "original-choice", kind: "point", label: "A 原选择", color: "#111827", x: 300, y: 220, labelX: 312, labelY: 216, description: "价格变化前的最优组合。", examHint: "A→B 是替代效应。" },
      { id: "compensated-choice", kind: "point", label: "B 补偿选择", color: "#7c3aed", x: 360, y: 190, labelX: 372, labelY: 186, description: "补偿预算线上保持效用的选择。", examHint: "补偿方式不同，中间点位置可能不同。" },
      { id: "new-choice", kind: "point", label: "C 新选择", color: "#dc2626", x: 440, y: 150, labelX: 452, labelY: 146, description: "新价格和新购买力下的最终选择。", examHint: "B→C 是收入效应，A→C 是总效应。" },
      { id: "effect-guide", kind: "guide", label: "效应方向", color: "#6b7280", path: "M300 220 H360 M360 190 H440", labelX: 335, labelY: 242, dashed: true, description: "沿横向比较 X 消费量的替代与收入变化。", examHint: "吉芬品可能出现收入效应大于替代效应的特殊结果。" },
    ],
  }),
  dedicatedEconomicsTemplate({
    id: "market-demand-sum",
    title: "个人需求的横向加总",
    subtitle: "同一价格下把每个消费者愿意购买的数量相加，得到市场需求。",
    xLabel: "数量 Q",
    yLabel: "价格 P",
    overview: "市场需求不是把价格相加，而是在每一个价格水平横向相加个人需求量。消费者数量、收入和偏好变化会改变市场需求。",
    defaultElementId: "market-demand",
    elements: [
      { id: "demand-a", kind: "curve", label: "Dₐ 消费者 A", color: "#2563eb", path: "M120 110 L420 300", labelX: 360, labelY: 286, description: "单个消费者 A 的需求。", examHint: "先固定价格，再读取个人数量。" },
      { id: "demand-b", kind: "curve", label: "Dᵦ 消费者 B", color: "#7c3aed", path: "M120 170 L460 320", labelX: 402, labelY: 312, description: "单个消费者 B 的需求。", examHint: "不同消费者需求形状可以不同。" },
      { id: "market-demand", kind: "curve", label: "D 市场需求", color: "#dc2626", path: "M120 80 L540 330", labelX: 480, labelY: 324, description: "每个价格下个人数量的横向总和。", examHint: "市场需求曲线通常比单个消费者需求更靠右。" },
      { id: "price-guide", kind: "guide", label: "同一价格 P₀", color: "#6b7280", path: "M80 210 H520 M300 210 V340", labelX: 42, labelY: 215, dashed: true, description: "在同一价格线上读取并相加数量。", examHint: "不能纵向加总价格，也不能把个人需求直接平均。" },
      { id: "market-point", kind: "point", label: "Qₐ+Qᵦ", color: "#111827", x: 300, y: 210, labelX: 312, labelY: 206, description: "市场数量等于个人数量之和。", examHint: "消费者数量增加会使市场需求右移。" },
    ],
  }),
];

const specializedEconomicsGraphTemplates: EconomicsGraphTemplate[] = [
  chapterGraphTemplate({
    id: "industry-long-run-supply",
    title: "行业长期供给的三种形状",
    subtitle: "行业扩张时，投入价格不变、上升或下降，分别对应三类长期供给曲线。",
    xLabel: "行业产量 Q",
    yLabel: "长期价格 P",
    overview: "把成本不变、成本递增和成本递减行业放在同一坐标系比较。长期均衡价格由行业扩张对投入价格和企业成本的反馈决定。",
    defaultElementId: "constant-cost",
    elements: [
      { id: "constant-cost", kind: "curve", label: "LRS₁ 成本不变", color: "#2563eb", path: "M120 210 H540", labelX: 420, labelY: 202, description: "行业扩大不改变投入价格，长期供给近似水平。", examHint: "需求增加时主要表现为行业产量增加，长期价格不变。" },
      { id: "increasing-cost", kind: "curve", label: "LRS₂ 成本递增", color: "#dc2626", path: "M120 300 L540 100", labelX: 430, labelY: 108, description: "行业扩张推高投入价格和企业成本，长期供给向右上方倾斜。", examHint: "需求增加会使长期价格和产量都上升。" },
      { id: "decreasing-cost", kind: "curve", label: "LRS₃ 成本递减", color: "#059669", path: "M120 100 L540 300", labelX: 420, labelY: 292, description: "行业扩张带来外部规模经济，长期供给向右下方倾斜。", examHint: "行业价格下降不等于单个厂商的短期 MC 向下。" },
      { id: "industry-guide", kind: "guide", label: "长期比较", color: "#6b7280", path: "M330 70 V340 M80 210 H540", labelX: 342, labelY: 88, dashed: true, description: "同一产量位置比较三类行业的长期价格。", examHint: "先判断行业成本随规模变化的方向，再写曲线形状。" },
    ],
  }),
  chapterGraphTemplate({
    id: "price-support-quota",
    title: "价格支持与生产配额",
    subtitle: "价格支持由政府托住价格，生产配额直接限制数量；两者都可能改变供给、消费和财政负担。",
    xLabel: "数量 Q",
    yLabel: "价格 P",
    overview: "价格支持高于均衡价格时，政府若承诺收购剩余产量，就会出现财政支出和库存；生产配额则把数量限制在配额线，价格由需求曲线读取。",
    defaultElementId: "support-price",
    elements: [
      { id: "demand", kind: "curve", label: "D 需求", color: "#2563eb", path: "M120 90 L540 320", labelX: 492, labelY: 314, description: "消费者在不同价格下的购买意愿。", examHint: "支持价格下实际消费量从需求曲线读取。" },
      { id: "supply", kind: "curve", label: "S 供给", color: "#dc2626", path: "M120 320 L540 90", labelX: 492, labelY: 96, description: "生产者在不同价格下的供给量。", examHint: "支持价格下生产量通常大于消费量。" },
      { id: "support-price", kind: "guide", label: "P_s 支持价格", color: "#7c3aed", path: "M80 145 H540", labelX: 48, labelY: 140, dashed: true, description: "高于均衡价格的支持价格。", examHint: "政府收购剩余时，财政支出=P_s×(Q_s-Q_d)。" },
      { id: "quota", kind: "guide", label: "Q_q 配额", color: "#059669", path: "M360 70 V340", labelX: 368, labelY: 88, dashed: true, description: "配额直接限制可交易或可生产数量。", examHint: "配额造成的价格要从需求曲线读，不能直接等于支持价格。" },
      { id: "government-purchase", kind: "area", label: "政府收购", color: "#f59e0b", path: "M360 145 L450 145 L450 194 L360 194 Z", labelX: 374, labelY: 174, description: "支持价格下政府收购的剩余产量区间。", examHint: "收购支出是转移或财政成本，不应直接当成社会净收益。" },
    ],
  }),
  chapterGraphTemplate({
    id: "tax-subsidy",
    title: "单位税与单位补贴的价格楔子",
    subtitle: "税收把买方价格与卖方净价拉开，补贴则把卖方得到的价格推到买方支付价格之上。",
    xLabel: "数量 Q",
    yLabel: "价格 P",
    overview: "同一张图对照税收和补贴的方向：税收使 P_b>P_s，补贴使 P_s>P_b，交易量分别下降和上升，并伴随政府收入或支出。",
    defaultElementId: "tax-wedge",
    elements: [
      { id: "demand", kind: "curve", label: "D", color: "#2563eb", path: "M120 90 L540 320", labelX: 500, labelY: 314, description: "边际支付意愿。", examHint: "买方价格 P_b 从需求曲线读取。" },
      { id: "supply", kind: "curve", label: "S", color: "#dc2626", path: "M120 320 L540 90", labelX: 500, labelY: 96, description: "边际成本与卖方供给。", examHint: "卖方净价 P_s 从供给曲线读取。" },
      { id: "tax-wedge", kind: "guide", label: "税收 t", color: "#7c3aed", path: "M80 165 H540 M80 235 H540 M380 165 V235", labelX: 48, labelY: 160, dashed: true, description: "税收形成 P_b-P_s=t 的垂直楔子。", examHint: "税负归宿由弹性决定，不由法律缴税对象决定。" },
      { id: "subsidy-wedge", kind: "guide", label: "补贴 s", color: "#059669", path: "M80 260 H540 M80 320 H540 M300 260 V320", labelX: 48, labelY: 255, dashed: true, description: "补贴形成 P_s-P_b=s 的反向楔子。", examHint: "补贴扩大交易量，但可能造成过度生产的无谓损失。" },
      { id: "tax-quantity", kind: "point", label: "Q_t", color: "#dc2626", x: 380, y: 200, labelX: 392, labelY: 196, description: "征税后的较低交易量。", examHint: "税收使原本满足 MB>MC 的部分交易消失。" },
      { id: "subsidy-quantity", kind: "point", label: "Q_s", color: "#111827", x: 300, y: 290, labelX: 312, labelY: 286, description: "补贴后的较高交易量。", examHint: "政府支出为单位补贴乘以交易量。" },
    ],
  }),
  chapterGraphTemplate({
    id: "natural-monopoly-regulation",
    title: "自然垄断的边际成本定价与平均成本定价",
    subtitle: "自然垄断的规模经济使平均成本持续下降，规制需要在效率与成本回收之间取舍。",
    xLabel: "产量 Q",
    yLabel: "价格/成本 P",
    overview: "自然垄断的需求覆盖平均成本下降区间。P=MC 实现配置效率但可能低于平均成本；P=AC 能回收成本但通常高于 MC。",
    defaultElementId: "mc-price",
    elements: [
      { id: "demand", kind: "curve", label: "D", color: "#2563eb", path: "M120 90 L540 320", labelX: 500, labelY: 314, description: "市场需求曲线。", examHint: "规制价格必须同时满足需求和企业收支约束。" },
      { id: "mc", kind: "curve", label: "MC", color: "#dc2626", path: "M120 300 C250 270 380 220 540 130", labelX: 492, labelY: 140, description: "边际成本低于平均成本，体现规模经济。", examHint: "P=MC 价格通常低于 AC，需要补贴或公共资金弥补缺口。" },
      { id: "lac", kind: "curve", label: "LAC", color: "#7c3aed", path: "M120 190 C250 170 380 145 540 120", labelX: 492, labelY: 112, description: "长期平均成本在相关区间下降。", examHint: "自然垄断的判据是一个厂商供给整个市场成本更低。" },
      { id: "mc-price", kind: "point", label: "P=MC", color: "#059669", x: 390, y: 205, labelX: 402, labelY: 201, description: "边际成本定价点，配置效率较高。", examHint: "若 P<AC，要说明成本回收缺口。" },
      { id: "ac-price", kind: "point", label: "P=AC", color: "#111827", x: 330, y: 170, labelX: 342, labelY: 166, description: "平均成本定价点，企业收支平衡但存在加价。", examHint: "P=AC 通常不能实现 P=MC 的全部效率。" },
      { id: "subsidy-gap", kind: "guide", label: "补贴缺口", color: "#f59e0b", path: "M80 205 H390 M80 170 H330", labelX: 48, labelY: 200, dashed: true, description: "边际成本定价下的成本回收缺口需要补贴或其他融资。", examHint: "规制分析要同时写效率、成本回收和财政约束。" },
    ],
  }),
  chapterGraphTemplate({
    id: "third-degree-discrimination",
    title: "三级价格歧视：分市场定价",
    subtitle: "厂商把市场分组，在每个市场分别满足 MR_i=MC，并通过共同边际成本协调总产量。",
    xLabel: "各分市场数量 q_i",
    yLabel: "价格/边际收益",
    overview: "两个市场的需求弹性不同，最优价格可以不同；统一条件是 MR₁=MR₂=MC，而不是把两个价格强行设为相同。",
    defaultElementId: "market-one",
    elements: [
      { id: "demand-one", kind: "curve", label: "D₁", color: "#2563eb", path: "M110 90 L300 320", labelX: 270, labelY: 312, description: "市场1需求。", examHint: "需求越缺乏弹性，最优加价通常越高。" },
      { id: "mr-one", kind: "curve", label: "MR₁", color: "#7c3aed", path: "M110 150 L300 340", labelX: 260, labelY: 334, description: "市场1边际收益。", examHint: "从 MR₁=MC 读取市场1数量和价格。" },
      { id: "demand-two", kind: "curve", label: "D₂", color: "#059669", path: "M350 110 L540 300", labelX: 500, labelY: 292, description: "市场2需求。", examHint: "可分割市场必须阻止转售或套利。" },
      { id: "mr-two", kind: "curve", label: "MR₂", color: "#dc2626", path: "M350 170 L540 340", labelX: 500, labelY: 334, description: "市场2边际收益。", examHint: "市场2也必须满足 MR₂=MC。" },
      { id: "mc", kind: "guide", label: "MC", color: "#111827", path: "M80 220 H580", labelX: 48, labelY: 214, dashed: true, description: "共同边际成本基准。", examHint: "联立 MR₁=MR₂=MC，而不是分别与不同 MC 比较。" },
      { id: "market-one", kind: "point", label: "q₁,p₁", color: "#2563eb", x: 245, y: 220, labelX: 252, labelY: 212, description: "市场1的均衡组合。", examHint: "价格从 D₁ 读取，数量从 MR₁=MC 读取。" },
      { id: "market-two", kind: "point", label: "q₂,p₂", color: "#dc2626", x: 485, y: 220, labelX: 492, labelY: 212, description: "市场2的均衡组合。", examHint: "价格差异来自需求弹性差异，而不是成本不同。" },
    ],
  }),
  chapterGraphTemplate({
    id: "peak-load-pricing",
    title: "高峰定价与跨期需求",
    subtitle: "高峰期需求更强且容量约束更紧，价格应覆盖高峰期较高的边际成本。",
    xLabel: "各时段数量 Q",
    yLabel: "价格/边际收益",
    overview: "把高峰和非高峰时段分开比较：高峰需求与边际收益更高，价格通常更高；非高峰容量闲置时价格可以更低。",
    defaultElementId: "peak-point",
    elements: [
      { id: "peak-demand", kind: "curve", label: "D_peak", color: "#dc2626", path: "M110 90 L300 320", labelX: 250, labelY: 312, description: "高峰时段需求较强。", examHint: "高峰价格不只是简单的‘涨价’，还反映容量机会成本。" },
      { id: "peak-mr", kind: "curve", label: "MR_peak", color: "#7c2d12", path: "M110 150 L300 340", labelX: 240, labelY: 334, description: "高峰时段边际收益。", examHint: "高峰最优条件仍是 MR=MC_peak。" },
      { id: "off-demand", kind: "curve", label: "D_off", color: "#2563eb", path: "M350 150 L540 320", labelX: 500, labelY: 312, description: "非高峰时段需求较弱。", examHint: "非高峰价格应覆盖非高峰边际成本。" },
      { id: "off-mr", kind: "curve", label: "MR_off", color: "#059669", path: "M350 205 L540 340", labelX: 500, labelY: 334, description: "非高峰时段边际收益。", examHint: "不要把两个时段的需求横向合并后统一定价。" },
      { id: "peak-mc", kind: "guide", label: "MC_peak", color: "#111827", path: "M80 220 H580", labelX: 48, labelY: 214, dashed: true, description: "高峰期容量紧张导致的边际成本基准。", examHint: "高峰价格高的一个原因是高峰边际成本更高。" },
      { id: "off-mc", kind: "guide", label: "MC_off", color: "#6b7280", path: "M80 270 H580", labelX: 48, labelY: 264, dashed: true, description: "非高峰期闲置容量对应的较低边际成本。", examHint: "跨期定价要说明需求和成本都可能随时段变化。" },
      { id: "peak-point", kind: "point", label: "P_peak", color: "#dc2626", x: 245, y: 220, labelX: 252, labelY: 212, description: "高峰时段较高价格。", examHint: "高峰定价可缓解排队和容量过度使用。" },
      { id: "off-point", kind: "point", label: "P_off", color: "#2563eb", x: 485, y: 270, labelX: 492, labelY: 262, description: "非高峰时段较低价格。", examHint: "低谷折扣不等于厂商放弃利润，而是利用闲置容量。" },
    ],
  }),
  chapterGraphTemplate({
    id: "cartel-output",
    title: "卡特尔把行业当作一个垄断者",
    subtitle: "共谋时先用行业 MR=MC 决定总产量，再按边际成本相等原则分配给成员。",
    xLabel: "行业总产量 Q",
    yLabel: "价格/边际收益",
    overview: "卡特尔总量低于古诺均衡、价格高于古诺均衡。图中直接标出垄断总量、共谋价格和分配前的行业决策。",
    defaultElementId: "cartel-point",
    elements: [
      { id: "demand", kind: "curve", label: "D 行业需求", color: "#2563eb", path: "M120 90 L540 320", labelX: 492, labelY: 314, description: "行业总需求。", examHint: "先由 Q_m 回到需求曲线读共谋价格。" },
      { id: "mr", kind: "curve", label: "MR 行业边际收益", color: "#7c3aed", path: "M120 170 L540 350", labelX: 468, labelY: 340, description: "行业边际收益低于需求曲线。", examHint: "共谋总量满足 MR=MC，而不是 P=MC。" },
      { id: "mc", kind: "curve", label: "MC 行业边际成本", color: "#dc2626", path: "M120 300 C260 270 380 220 540 130", labelX: 476, labelY: 144, description: "成员边际成本合成的行业成本。", examHint: "多厂商分配时满足 MC₁=MC₂=…=MR。" },
      { id: "cartel-point", kind: "point", label: "Q_m 共谋总量", color: "#111827", x: 350, y: 220, labelX: 362, labelY: 214, description: "MR 与 MC 的交点决定共谋总量。", examHint: "总量确定后再考虑成员产量分配。" },
      { id: "price-guide", kind: "guide", label: "P_m", color: "#059669", path: "M80 150 H350 M350 150 V340", labelX: 48, labelY: 145, dashed: true, description: "从共谋产量向上投影到需求曲线读取价格。", examHint: "不要把 MR 交点的纵坐标直接当作市场价格。" },
    ],
  }),
  chapterGraphTemplate({
    id: "dominant-firm",
    title: "主导厂商与剩余需求",
    subtitle: "主导厂商面对市场需求扣除竞争性边缘厂商供给后的剩余需求。",
    xLabel: "主导厂商产量 Q_d",
    yLabel: "价格/边际收益",
    overview: "先从市场需求中减去边缘厂商在每个价格下的供给，得到主导厂商剩余需求，再用剩余 MR=MC 决定主导厂商产量。",
    defaultElementId: "dominant-point",
    elements: [
      { id: "market-demand", kind: "curve", label: "D 市场需求", color: "#2563eb", path: "M110 90 L540 320", labelX: 490, labelY: 314, description: "整个行业的市场需求。", examHint: "剩余需求不是把市场需求原样交给主导厂商。" },
      { id: "fringe-supply", kind: "curve", label: "S_f 边缘供给", color: "#059669", path: "M110 300 L540 100", labelX: 470, labelY: 112, description: "竞争性边缘厂商在各价格下的供给。", examHint: "边缘供给越大，主导厂商剩余需求越小。" },
      { id: "residual-demand", kind: "curve", label: "D_r 剩余需求", color: "#7c3aed", path: "M150 150 L500 330", labelX: 430, labelY: 324, description: "市场需求减去边缘供给后的主导厂商需求。", examHint: "在每个价格下做数量相减，得到剩余需求。" },
      { id: "residual-mr", kind: "curve", label: "MR_r", color: "#dc2626", path: "M150 220 L500 360", labelX: 442, labelY: 354, description: "剩余需求对应的边际收益。", examHint: "主导厂商按 MR_r=MC 选择产量。" },
      { id: "mc", kind: "guide", label: "MC_d", color: "#111827", path: "M80 260 H560", labelX: 48, labelY: 254, dashed: true, description: "主导厂商边际成本基准。", examHint: "求出 Q_d 后回到 D_r 读主导厂商价格。" },
      { id: "dominant-point", kind: "point", label: "Q_d*", color: "#111827", x: 360, y: 260, labelX: 372, labelY: 254, description: "主导厂商的利润最大化产量。", examHint: "剩余需求题的顺序是 D_m、S_f、D_r、MR_r、MC。" },
    ],
  }),
  chapterGraphTemplate({
    id: "union-monopoly",
    title: "工会卖方垄断与劳动市场目标",
    subtitle: "工会面对劳动需求和劳动供给，最大化就业、经济租金或工资总额会给出不同结果。",
    xLabel: "就业量 L",
    yLabel: "工资 w / 边际收益",
    overview: "工会卖方垄断不能只看一个 MR_L=S_L 交点。要先说明目标：最大化经济租金、工资总额或就业量，工资从劳动需求曲线读取。",
    defaultElementId: "rent-point",
    elements: [
      { id: "labor-demand", kind: "curve", label: "D_L 劳动需求", color: "#2563eb", path: "M120 90 L540 320", labelX: 490, labelY: 314, description: "厂商愿意支付的劳动边际收益。", examHint: "工资从 D_L 读取，不从 MR_L 直接读取。" },
      { id: "labor-supply", kind: "curve", label: "S_L 劳动供给", color: "#059669", path: "M120 320 L540 90", labelX: 486, labelY: 96, description: "劳动者愿意提供劳动的最低工资集合。", examHint: "经济租金是需求价格与保留工资之间的面积。" },
      { id: "labor-mr", kind: "curve", label: "MR_L 工会边际收益", color: "#dc2626", path: "M120 210 L540 350", labelX: 466, labelY: 344, description: "增加就业一单位对工资总额或租金目标的边际变化。", examHint: "目标函数不同，MR_L 的解释和最优点也不同。" },
      { id: "rent-point", kind: "point", label: "L_r 最大租金", color: "#111827", x: 300, y: 220, labelX: 312, labelY: 214, description: "工会追求经济租金时的参考就业量。", examHint: "工资从 D_L 的对应点读取，再比较租金面积。" },
      { id: "employment-point", kind: "point", label: "L_c 最大就业", color: "#f59e0b", x: 390, y: 240, labelX: 402, labelY: 234, description: "最大就业目标通常靠近竞争性均衡数量。", examHint: "双边垄断下工资和就业可能需要谈判决定。" },
      { id: "rent-guide", kind: "guide", label: "w*", color: "#7c3aed", path: "M80 165 H300 M300 165 V340", labelX: 48, labelY: 160, dashed: true, description: "从目标就业量回到劳动需求曲线读取工资。", examHint: "不能把工会边际收益曲线的纵坐标直接当工资。" },
    ],
  }),
  chapterGraphTemplate({
    id: "liquidity-trap",
    title: "流动性陷阱中的货币市场",
    subtitle: "利率接近下限时，货币需求近似水平，货币供给增加几乎不再压低利率。",
    xLabel: "实际货币余额 M/P",
    yLabel: "利率 r",
    overview: "用货币需求曲线的低利率水平段和两条货币供给线展示：M_s 右移主要增加闲置余额，均衡利率几乎不变。",
    defaultElementId: "trap-equilibrium",
    elements: [
      { id: "money-demand", kind: "curve", label: "L(r,Y) 货币需求", color: "#2563eb", path: "M120 300 C220 260 300 230 350 205 L540 205", labelX: 420, labelY: 196, description: "低利率区域货币需求对利率极其敏感，接近水平。", examHint: "流动性陷阱不是货币需求完全不变，而是对利率变化非常敏感。" },
      { id: "money-supply-old", kind: "guide", label: "M_s0", color: "#dc2626", path: "M330 70 V340", labelX: 338, labelY: 88, dashed: true, description: "初始实际货币供给。", examHint: "供给线右移时要观察均衡利率是否变化。" },
      { id: "money-supply-new", kind: "guide", label: "M_s1", color: "#059669", path: "M470 70 V340", labelX: 478, labelY: 88, dashed: true, description: "扩张后的实际货币供给。", examHint: "在陷阱区间，新增货币主要被公众持有。" },
      { id: "trap-equilibrium", kind: "point", label: "r≈0", color: "#111827", x: 330, y: 205, labelX: 342, labelY: 199, description: "两条供给线与近似水平需求段给出几乎相同利率。", examHint: "货币政策传导链在利率环节卡住，财政政策挤出效应较弱。" },
      { id: "rate-guide", kind: "guide", label: "利率下限", color: "#7c3aed", path: "M80 205 H540", labelX: 48, labelY: 200, dashed: true, description: "低利率下限区域。", examHint: "答题要写成立条件：低利率、货币需求高弹性和货币扩张难以继续降息。" },
    ],
  }),
  chapterGraphTemplate({
    id: "housing-stock-flow",
    title: "住房存量与住房投资流量",
    subtitle: "既有住房存量在短期近似固定，新建住房投资是随价格变化的流量。",
    xLabel: "住房数量/新建量",
    yLabel: "房价 P",
    overview: "住房市场要区分存量均衡和流量供给：短期既有存量供给近似垂直，长期新建住房供给向上，房价变化才会传导到新建投资。",
    defaultElementId: "stock-price",
    elements: [
      { id: "housing-demand", kind: "curve", label: "D_h 住房需求", color: "#2563eb", path: "M120 90 L540 320", labelX: 492, labelY: 314, description: "家庭对住房服务和住房存量的需求。", examHint: "人口、收入和利率变化会移动住房需求。" },
      { id: "stock-supply", kind: "guide", label: "S_stock 短期存量", color: "#dc2626", path: "M330 70 V340", labelX: 338, labelY: 88, dashed: true, description: "既有住房存量短期近似固定。", examHint: "短期需求冲击主要体现为房价变动。" },
      { id: "flow-supply", kind: "curve", label: "S_flow 新建供给", color: "#059669", path: "M120 320 L540 100", labelX: 478, labelY: 112, description: "新建住房投资随房价上升而增加。", examHint: "新建量是投资流量，不等于住房存量本身。" },
      { id: "stock-price", kind: "point", label: "P_stock", color: "#111827", x: 330, y: 205, labelX: 342, labelY: 199, description: "既有存量与需求决定的短期房价。", examHint: "短期房价变化通过 q、融资和预期影响投资。" },
      { id: "flow-price", kind: "point", label: "I_h 新建流量", color: "#7c3aed", x: 390, y: 210, labelX: 402, labelY: 204, description: "房价与新建供给曲线共同决定的新建住房投资。", examHint: "解释住房投资时要同时报告存量和流量。" },
    ],
  }),
  chapterGraphTemplate({
    id: "baumol-tobin",
    title: "鲍莫尔—托宾模型的最优取款次数",
    subtitle: "取款次数增加会降低利息机会成本，但提高固定取款成本，总成本呈 U 形。",
    xLabel: "取款次数 N",
    yLabel: "年度成本",
    overview: "总成本 TC(N)=iY/(2N)+FN。第一项随 N 增加而下降，第二项随 N 增加而上升，二者交汇处给出最优取款次数。",
    defaultElementId: "optimal-withdrawals",
    elements: [
      { id: "opportunity-cost", kind: "curve", label: "利息机会成本", color: "#2563eb", path: "M120 100 C220 150 340 230 540 320", labelX: 410, labelY: 270, description: "取款越频繁，平均现金余额越低，利息机会成本越小。", examHint: "iY/(2N) 是随 N 下降的部分。" },
      { id: "withdrawal-cost", kind: "curve", label: "固定取款成本", color: "#dc2626", path: "M120 320 C250 270 390 170 540 90", labelX: 430, labelY: 140, description: "每次取款的固定成本使总取款成本随 N 上升。", examHint: "FN 是随 N 上升的部分。" },
      { id: "total-cost", kind: "curve", label: "TC 总成本", color: "#7c3aed", path: "M120 300 C220 250 300 210 370 205 C450 210 510 250 540 300", labelX: 430, labelY: 214, description: "机会成本和固定成本相加形成 U 形总成本。", examHint: "总成本最低点就是最优取款次数。" },
      { id: "optimal-withdrawals", kind: "point", label: "N*", color: "#111827", x: 370, y: 205, labelX: 382, labelY: 199, description: "TC 最低点对应最优取款次数。", examHint: "N*=sqrt(iY/(2F))，再根据平均现金余额讨论货币需求。" },
      { id: "n-guide", kind: "guide", label: "最优 N", color: "#059669", path: "M370 205 V340", labelX: 358, labelY: 368, dashed: true, description: "把总成本最低点投影到取款次数轴。", examHint: "收入 Y 或利率 i 上升通常提高最优取款次数。" },
    ],
  }),
  chapterGraphTemplate({
    id: "elasticity-shapes",
    title: "需求与供给弹性的几何形状",
    subtitle: "弹性描述数量对价格的反应强度，水平线与竖直线分别代表完全弹性和完全无弹性。",
    xLabel: "数量 Q",
    yLabel: "价格 P",
    overview: "曲线越平，价格变化引起的数量反应越强；曲线越陡，数量反应越弱。斜率和弹性不是同一个概念，线性曲线沿线的弹性仍会变化。",
    defaultElementId: "unit-elastic",
    elements: [
      { id: "inelastic", kind: "curve", label: "缺乏弹性 Dᵢ", color: "#dc2626", path: "M250 80 L270 330", labelX: 278, labelY: 112, description: "价格变化较大而数量变化较小。", examHint: "必需品、短期和替代品少的商品通常更缺乏弹性。" },
      { id: "unit-elastic", kind: "curve", label: "单位弹性 Dᵤ", color: "#2563eb", path: "M120 100 L540 320", labelX: 470, labelY: 312, description: "数量与价格的百分比变化相等。", examHint: "在线性需求的中点通常是单位弹性，但要以具体函数为准。" },
      { id: "elastic", kind: "curve", label: "富有弹性 Dₑ", color: "#059669", path: "M120 220 L540 205", labelX: 470, labelY: 198, description: "很小的价格变化即可带来较大的数量变化。", examHint: "替代品多、长期和可延迟购买的商品通常更富有弹性。" },
      { id: "price-guide", kind: "guide", label: "ΔP", color: "#7c3aed", path: "M80 190 H330 M330 190 V230", labelX: 48, labelY: 185, dashed: true, description: "同样的价格变化在不同曲线上的数量反应不同。", examHint: "答题先写弹性定义，再解释曲线形状和收入含义。" },
      { id: "quantity-guide", kind: "guide", label: "ΔQ", color: "#6b7280", path: "M330 230 H420 M420 230 V205", labelX: 350, labelY: 244, dashed: true, description: "水平曲线上的数量反应更大。", examHint: "不要只凭曲线斜率判断所有点的点弹性。" },
      { id: "unit-point", kind: "point", label: "弹性比较", color: "#111827", x: 330, y: 210, labelX: 342, labelY: 206, description: "同一价格附近比较三种曲线的反应强度。", examHint: "政策归宿取决于供需双方相对弹性。" },
    ],
  }),
  chapterGraphTemplate({
    id: "supply-shift-revenue",
    title: "供给冲击、缺乏弹性需求与销售收入",
    subtitle: "丰收使供给右移；需求缺乏弹性时价格跌幅可能超过销量增幅，销售收入反而下降。",
    xLabel: "数量 Q",
    yLabel: "价格 P",
    overview: "同一张图同时读出供给移动、旧新均衡和 P×Q 的矩形面积。它适用于‘谷贱伤农’、石油限产和其他供给冲击题。",
    defaultElementId: "new-equilibrium",
    elements: [
      { id: "demand", kind: "curve", label: "D 缺乏弹性需求", color: "#2563eb", path: "M120 90 L540 320", labelX: 474, labelY: 314, description: "需求较陡，价格变化对数量反应较小。", examHint: "需求缺乏弹性时，降价不一定增加销售收入。" },
      { id: "supply-old", kind: "curve", label: "S₀ 丰收前", color: "#dc2626", path: "M120 320 L540 100", labelX: 476, labelY: 112, description: "冲击前的市场供给。", examHint: "先标旧均衡，再画供给右移。" },
      { id: "supply-new", kind: "curve", label: "S₁ 丰收后", color: "#059669", path: "M170 330 L590 110", labelX: 520, labelY: 122, description: "产量增加或成本下降使供给右移。", examHint: "供给右移通常使价格下降、数量上升。" },
      { id: "old-equilibrium", kind: "point", label: "E₀", color: "#111827", x: 300, y: 188, labelX: 312, labelY: 184, description: "丰收前均衡。", examHint: "旧收入矩形为 P₀×Q₀。" },
      { id: "new-equilibrium", kind: "point", label: "E₁", color: "#f59e0b", x: 350, y: 218, labelX: 362, labelY: 214, description: "丰收后均衡，价格下降、数量上升。", examHint: "比较 P×Q 而不是只看数量。" },
      { id: "old-revenue", kind: "area", label: "TR₀=P₀Q₀", color: "#7c3aed", path: "M80 188 H300 V340 H80 Z", labelX: 150, labelY: 180, description: "冲击前销售收入的示意矩形。", examHint: "面积只是示意，具体数值要由题目函数计算。" },
      { id: "new-revenue", kind: "area", label: "TR₁=P₁Q₁", color: "#f59e0b", path: "M80 218 H350 V340 H80 Z", labelX: 180, labelY: 210, description: "冲击后销售收入的示意矩形。", examHint: "需求缺乏弹性时，TR₁可能小于 TR₀。" },
      { id: "price-guide", kind: "guide", label: "P₀→P₁", color: "#6b7280", path: "M80 188 H300 M80 218 H350", labelX: 38, labelY: 203, dashed: true, description: "比较均衡价格的下降幅度。", examHint: "收入方向要结合需求弹性，不能只凭价格或数量单独判断。" },
    ],
  }),
  chapterGraphTemplate({
    id: "ak-growth",
    title: "AK 内生增长模型",
    subtitle: "资本的边际报酬不递减时，资本积累可以持续推动产出增长。",
    xLabel: "资本 K",
    yLabel: "产出/投资",
    overview: "AK 模型用 Y=AK 表示资本的边际产品恒定。若储蓄投资 sAK 高于折旧和资本稀释线，资本与产出可持续增长，不会像基本 Solow 模型那样自动停在零增长稳态。",
    defaultElementId: "growth-gap",
    elements: [
      { id: "ak-output", kind: "curve", label: "Y=AK", color: "#2563eb", path: "M120 320 L540 80", labelX: 472, labelY: 94, description: "线性生产函数，资本边际产品 A 不递减。", examHint: "关键不是图线变陡，而是不存在资本边际报酬递减。" },
      { id: "saving-investment", kind: "curve", label: "sAK 投资", color: "#059669", path: "M120 340 L540 150", labelX: 450, labelY: 162, description: "储蓄率乘以产出形成投资。", examHint: "s 或 A 上升会提高投资线斜率和增长率。" },
      { id: "break-even", kind: "curve", label: "(δ+n)K 保本投资", color: "#dc2626", path: "M120 300 L540 210", labelX: 422, labelY: 218, description: "折旧和人口增长要求的保本投资。", examHint: "若投资线斜率超过保本线，资本继续积累。" },
      { id: "growth-gap", kind: "area", label: "持续增长区间", color: "#f59e0b", path: "M250 250 L430 168 L430 208 L250 288 Z", labelX: 304, labelY: 230, description: "sAK 与保本投资之间的差额是净资本积累。", examHint: "AK 模型把长期增长解释为内生的资本积累。" },
      { id: "growth-guide", kind: "guide", label: "K→增长", color: "#7c3aed", path: "M330 205 V340", labelX: 310, labelY: 368, dashed: true, description: "资本沿横轴增加时，净投资推动产出增长。", examHint: "与 Solow 模型比较时，明确是否存在递减报酬。" },
    ],
  }),
  chapterGraphTemplate({
    id: "growth-convergence",
    title: "经济增长的趋同路径",
    subtitle: "初始资本较低的经济体可能增长更快，逐步接近相同稳态；技术和制度差异会改变终点。",
    xLabel: "时间 t",
    yLabel: "人均产出 y",
    overview: "条件趋同要求储蓄率、人口增长、技术和制度等基本条件相近。图中用两条收敛路径区分低资本经济体的追赶与高资本经济体的减速。",
    defaultElementId: "steady-state-guide",
    elements: [
      { id: "low-start", kind: "curve", label: "低资本起点", color: "#2563eb", path: "M120 310 C210 285 270 240 330 205 C410 160 470 140 540 128", labelX: 420, labelY: 148, description: "起点较低但增长较快的追赶路径。", examHint: "边际报酬递减使低资本阶段的增长率可能较高。" },
      { id: "high-start", kind: "curve", label: "高资本起点", color: "#dc2626", path: "M120 130 C220 150 280 175 330 205 C410 235 470 244 540 248", labelX: 430, labelY: 236, description: "起点较高、接近稳态后增长放缓的路径。", examHint: "高收入不等于必然继续高速增长。" },
      { id: "steady-state", kind: "guide", label: "y* 稳态", color: "#059669", path: "M80 205 H540", labelX: 48, labelY: 199, dashed: true, description: "两条路径趋近的稳态人均产出。", examHint: "基本条件不同会导致不同稳态，不能机械断言绝对趋同。" },
      { id: "steady-state-guide", kind: "guide", label: "t→∞", color: "#7c3aed", path: "M500 205 V340", labelX: 488, labelY: 368, dashed: true, description: "长期趋近稳态的时间投影。", examHint: "区分无条件趋同和条件趋同。" },
      { id: "convergence-point", kind: "point", label: "趋同", color: "#111827", x: 430, y: 205, labelX: 442, labelY: 199, description: "两条路径接近共同稳态。", examHint: "制度、教育和技术扩散决定追赶能否实现。" },
    ],
  }),
  chapterGraphTemplate({
    id: "taylor-rule",
    title: "泰勒规则：通胀与产出缺口决定政策利率",
    subtitle: "通胀高于目标或产出高于潜在水平时，规则要求提高政策利率。",
    xLabel: "通胀缺口 π−π*",
    yLabel: "政策利率 i",
    overview: "泰勒规则把政策利率对通胀缺口和产出缺口的反应写成可预期的函数。图形重点是正向反应，而不是死记某组系数。",
    defaultElementId: "rule-point",
    elements: [
      { id: "rule", kind: "curve", label: "i(π,y) 泰勒规则", color: "#2563eb", path: "M120 300 L540 90", labelX: 430, labelY: 104, description: "通胀缺口扩大时，政策利率上升。", examHint: "通胀偏高时加息，产出低于潜在水平时降息。" },
      { id: "neutral", kind: "guide", label: "ī 中性利率", color: "#6b7280", path: "M80 205 H540", labelX: 48, labelY: 199, dashed: true, description: "无通胀和产出缺口时的基准政策利率。", examHint: "先定义缺口口径，再判断规则方向。" },
      { id: "inflation-axis", kind: "guide", label: "π=π*", color: "#059669", path: "M330 70 V340", labelX: 338, labelY: 88, dashed: true, description: "通胀达到目标的垂直基准线。", examHint: "横轴右侧表示通胀高于目标。" },
      { id: "rule-point", kind: "point", label: "i*", color: "#111827", x: 330, y: 205, labelX: 342, labelY: 199, description: "目标通胀和潜在产出附近的政策利率。", examHint: "规则的价值在于可预期和可信承诺。" },
      { id: "rate-guide", kind: "guide", label: "i↑", color: "#dc2626", path: "M420 160 H540 M420 160 V340", labelX: 444, labelY: 154, dashed: true, description: "通胀缺口为正时沿规则提高利率。", examHint: "不要把规则利率变化写成货币供给必然同方向变化。" },
    ],
  }),
  chapterGraphTemplate({
    id: "short-run-as-models",
    title: "三种短期总供给模型的统一图形",
    subtitle: "黏性工资、黏性价格和不完全信息模型都推出向右上方倾斜的短期总供给。",
    xLabel: "实际产出 Y",
    yLabel: "物价水平 P",
    overview: "三个微观基础不同，但统一结论是未预期的物价变化会让企业改变产出，因而短期总供给向右上方倾斜；预期调整后回到自然产出。",
    defaultElementId: "short-run-point",
    elements: [
      { id: "sticky-wage", kind: "curve", label: "SRAS_w 黏性工资", color: "#2563eb", path: "M120 320 L540 110", labelX: 452, labelY: 118, description: "名义工资暂时固定，价格上升提高实际利润并扩大产出。", examHint: "工资合同使调整存在时滞。" },
      { id: "sticky-price", kind: "curve", label: "SRAS_p 黏性价格", color: "#dc2626", path: "M140 340 L560 130", labelX: 474, labelY: 138, description: "部分厂商价格暂时不变，需求增加时销售量扩大。", examHint: "菜单成本解释价格调整不完全。" },
      { id: "imperfect-info", kind: "curve", label: "SRAS_i 信息不完全", color: "#059669", path: "M100 300 L520 90", labelX: 414, labelY: 100, description: "厂商把总价格变化误判为相对价格变化。", examHint: "预期和信息质量决定短期供给斜率。" },
      { id: "lras", kind: "guide", label: "LRAS Ȳ", color: "#7c3aed", path: "M330 70 V340", labelX: 340, labelY: 88, dashed: true, description: "长期预期调整后产出回到自然水平。", examHint: "三种模型的长期结论一致：不能永久用通胀换取低失业。" },
      { id: "short-run-point", kind: "point", label: "短期响应", color: "#111827", x: 360, y: 205, labelX: 372, labelY: 199, description: "不同模型在短期都允许产出偏离自然水平。", examHint: "先写微观机制，再写统一的 SRAS 结论。" },
    ],
  }),
];

export const economicsGraphTemplates: EconomicsGraphTemplate[] = [
  ...baseEconomicsGraphTemplates,
  ...dedicatedEconomicsGraphTemplates,
  ...extendedEconomicsGraphTemplates,
  ...specializedEconomicsGraphTemplates,
  ...additionalEconomicsGraphTemplates,
  ...macroEconomicsGraphTemplates,
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

const SAFE_ECONOMICS_PATH = /^[MmLlHhVvCcSsQqTtAaZz0-9.,\s-]+$/;

function normalizeColor(value: unknown, fallback = "#0f766e"): string {
  if (typeof value !== "string") return fallback;
  const color = value.trim();
  return /^#[0-9a-f]{6}$/i.test(color) ? color : fallback;
}

export function normalizeEconomicsGraphStrokes(value: unknown): EconomicsGraphStroke[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item, index): EconomicsGraphStroke[] => {
    const objectValue = readObject(item);
    if (!objectValue || typeof objectValue.path !== "string") return [];
    const path = objectValue.path.trim().slice(0, 2_000);
    if (!path || !SAFE_ECONOMICS_PATH.test(path)) return [];
    const label = sanitizeOptionalText(objectValue.label, 60) ?? `手绘曲线 ${index + 1}`;
    const id = typeof objectValue.id === "string" && /^[a-z0-9_-]{1,40}$/i.test(objectValue.id.trim())
      ? objectValue.id.trim()
      : `custom-${index + 1}`;
    return [{
      id,
      label,
      color: normalizeColor(objectValue.color),
      path,
      ...(objectValue.dashed === true ? { dashed: true } : {}),
    }];
  }).slice(0, 8);
}

export type EconomicsGraphLayerCheck = {
  id: "axes" | "curves" | "guides" | "labels";
  label: string;
  passed: boolean;
  detail: string;
};

export function checkEconomicsGraphLayers(spec: EconomicsGraphSpec): EconomicsGraphLayerCheck[] {
  const template = getEconomicsGraphTemplate(spec.template);
  const customStrokes = spec.customStrokes ?? [];
  const elements = template?.elements ?? [];
  return [
    {
      id: "axes",
      label: "坐标轴",
      passed: Boolean(template?.xLabel && template?.yLabel && template?.viewBox),
      detail: template ? `${template.xLabel} / ${template.yLabel}` : "缺少模板坐标轴",
    },
    {
      id: "curves",
      label: "曲线",
      passed: elements.some((element) => element.kind === "curve" && element.path) || customStrokes.length > 0,
      detail: `${elements.filter((element) => element.kind === "curve").length + customStrokes.length} 条`,
    },
    {
      id: "guides",
      label: "辅助线",
      passed: elements.some((element) => element.kind === "guide" && element.path),
      detail: `${elements.filter((element) => element.kind === "guide").length} 条`,
    },
    {
      id: "labels",
      label: "标注",
      passed: elements.some((element) => element.label && element.labelX !== undefined && element.labelY !== undefined)
        || customStrokes.some((stroke) => stroke.label),
      detail: `${elements.filter((element) => element.label && element.labelX !== undefined && element.labelY !== undefined).length + customStrokes.filter((stroke) => stroke.label).length} 个`,
    },
  ];
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
      customStrokes: objectValue ? normalizeEconomicsGraphStrokes(objectValue.customStrokes ?? objectValue.strokes) : [],
    },
  };
}
