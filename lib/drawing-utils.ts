/**
 * Canvas 绘图工具函数
 */

interface FunctionGraphParams {
  formula: string;
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  showGrid?: boolean;
}

interface Shape {
  type: "triangle" | "circle" | "rectangle";
  points: [number, number][];
  label?: string;
}

interface GeometryParams {
  shapes: Shape[];
}

/**
 * 绘制函数图像
 */
export function drawFunctionGraph(canvas: HTMLCanvasElement, params: FunctionGraphParams): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const width = canvas.width;
  const height = canvas.height;
  const padding = 50;

  // 背景
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  // 坐标范围
  const { xMin, xMax, yMin, yMax } = params;
  const xRange = xMax - xMin;
  const yRange = yMax - yMin;

  // 坐标转换函数
  const toScreenX = (x: number) => padding + ((x - xMin) / xRange) * (width - 2 * padding);
  const toScreenY = (y: number) => height - padding - ((y - yMin) / yRange) * (height - 2 * padding);

  // 绘制网格
  if (params.showGrid !== false) {
    ctx.strokeStyle = "#e5e7eb";
    ctx.lineWidth = 0.5;
    
    const xStep = calculateStep(xRange);
    const yStep = calculateStep(yRange);

    for (let x = Math.ceil(xMin / xStep) * xStep; x <= xMax; x += xStep) {
      ctx.beginPath();
      ctx.moveTo(toScreenX(x), padding);
      ctx.lineTo(toScreenX(x), height - padding);
      ctx.stroke();
    }

    for (let y = Math.ceil(yMin / yStep) * yStep; y <= yMax; y += yStep) {
      ctx.beginPath();
      ctx.moveTo(padding, toScreenY(y));
      ctx.lineTo(width - padding, toScreenY(y));
      ctx.stroke();
    }
  }

  // 绘制坐标轴
  ctx.strokeStyle = "#374151";
  ctx.lineWidth = 1.5;

  // X 轴
  if (yMin <= 0 && yMax >= 0) {
    ctx.beginPath();
    ctx.moveTo(padding, toScreenY(0));
    ctx.lineTo(width - padding, toScreenY(0));
    ctx.stroke();
  }

  // Y 轴
  if (xMin <= 0 && xMax >= 0) {
    ctx.beginPath();
    ctx.moveTo(toScreenX(0), padding);
    ctx.lineTo(toScreenX(0), height - padding);
    ctx.stroke();
  }

  // 刻度标签
  ctx.fillStyle = "#6b7280";
  ctx.font = "12px Inter, sans-serif";
  ctx.textAlign = "center";

  const xStep = calculateStep(xRange);
  const yStep = calculateStep(yRange);

  for (let x = Math.ceil(xMin / xStep) * xStep; x <= xMax; x += xStep) {
    if (Math.abs(x) < 0.0001) continue;
    ctx.fillText(formatNumber(x), toScreenX(x), toScreenY(0) + 18);
  }

  ctx.textAlign = "right";
  for (let y = Math.ceil(yMin / yStep) * yStep; y <= yMax; y += yStep) {
    if (Math.abs(y) < 0.0001) continue;
    ctx.fillText(formatNumber(y), toScreenX(0) - 8, toScreenY(y) + 4);
  }

  // 绘制函数曲线
  ctx.strokeStyle = "#7c3aed";
  ctx.lineWidth = 2.5;
  ctx.beginPath();

  const formula = params.formula.toLowerCase().replace(/\s/g, "");
  let started = false;

  for (let px = padding; px <= width - padding; px += 1) {
    const x = xMin + ((px - padding) / (width - 2 * padding)) * xRange;
    const y = evaluateFormula(formula, x);

    if (isNaN(y) || !isFinite(y) || y < yMin - yRange || y > yMax + yRange) {
      started = false;
      continue;
    }

    const py = toScreenY(y);
    if (!started) {
      ctx.moveTo(px, py);
      started = true;
    } else {
      ctx.lineTo(px, py);
    }
  }
  ctx.stroke();

  // 绘制图例
  ctx.fillStyle = "#7c3aed";
  ctx.font = "14px Inter, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(`y = ${params.formula}`, padding + 10, padding + 20);
}

/**
 * 绘制几何图形
 */
export function drawGeometry(canvas: HTMLCanvasElement, params: GeometryParams): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const width = canvas.width;
  const height = canvas.height;

  // 背景
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  // 计算边界以自动缩放
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  params.shapes.forEach(shape => {
    shape.points.forEach(([x, y]) => {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    });
  });

  const padding = 60;
  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;
  const scale = Math.min((width - 2 * padding) / rangeX, (height - 2 * padding) / rangeY) * 0.8;
  const offsetX = (width - rangeX * scale) / 2 - minX * scale;
  const offsetY = (height - rangeY * scale) / 2 - minY * scale;

  const toScreenX = (x: number) => x * scale + offsetX;
  const toScreenY = (y: number) => height - (y * scale + offsetY);

  // 绘制图形
  params.shapes.forEach((shape, index) => {
    const colors = ["#7c3aed", "#2563eb", "#059669", "#dc2626"];
    ctx.strokeStyle = colors[index % colors.length];
    ctx.lineWidth = 2.5;
    ctx.fillStyle = colors[index % colors.length] + "20";

    ctx.beginPath();
    shape.points.forEach(([x, y], i) => {
      const px = toScreenX(x);
      const py = toScreenY(y);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 绘制顶点
    shape.points.forEach(([x, y]) => {
      ctx.beginPath();
      ctx.arc(toScreenX(x), toScreenY(y), 4, 0, Math.PI * 2);
      ctx.fillStyle = colors[index % colors.length];
      ctx.fill();
    });

    // 绘制标签
    if (shape.label) {
      ctx.fillStyle = "#1f2937";
      ctx.font = "bold 16px Inter, sans-serif";
      ctx.textAlign = "center";
      
      // 计算图形中心
      const centerX = shape.points.reduce((s, [x]) => s + x, 0) / shape.points.length;
      const centerY = shape.points.reduce((s, [, y]) => s + y, 0) / shape.points.length;
      
      ctx.fillText(shape.label, toScreenX(centerX), toScreenY(centerY) + 6);
    }
  });
}

/**
 * 计算公式值
 */
function evaluateFormula(formula: string, x: number): number {
  try {
    // 替换 y = ... 为表达式
    let expr = formula.replace(/^y\s*=\s*/, "");
    
    // 替换数学函数
    expr = expr.replace(/sin/g, "Math.sin");
    expr = expr.replace(/cos/g, "Math.cos");
    expr = expr.replace(/tan/g, "Math.tan");
    expr = expr.replace(/log/g, "Math.log10");
    expr = expr.replace(/ln/g, "Math.log");
    expr = expr.replace(/sqrt/g, "Math.sqrt");
    expr = expr.replace(/abs/g, "Math.abs");
    expr = expr.replace(/pi/g, "Math.PI");
    expr = expr.replace(/e(?![a-z])/g, "Math.E");
    expr = expr.replace(/\^/g, "**");
    
    // 安全求值
    const fn = new Function("x", `return ${expr}`);
    return fn(x);
  } catch {
    return NaN;
  }
}

/**
 * 计算合适的刻度间隔
 */
function calculateStep(range: number): number {
  const rough = range / 10;
  const pow = Math.pow(10, Math.floor(Math.log10(rough)));
  const normalized = rough / pow;
  
  if (normalized < 1.5) return pow;
  if (normalized < 3) return 2 * pow;
  if (normalized < 7) return 5 * pow;
  return 10 * pow;
}

/**
 * 格式化数字
 */
function formatNumber(n: number): string {
  if (Math.abs(n) < 0.0001) return "0";
  if (Math.abs(n) >= 1000) return n.toFixed(0);
  if (Math.abs(n) >= 1) return parseFloat(n.toFixed(1)).toString();
  return parseFloat(n.toFixed(2)).toString();
}
