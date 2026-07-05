"use client";

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import katex from "katex";
import GithubSlugger from "github-slugger";
import { renderMarkdownToHtml } from "@/lib/markdown";
import {
  getEconomicsGraphTemplate,
  parseEconomicsGraphSpec,
  type EconomicsGraphElement,
  type EconomicsGraphElementKind,
  type EconomicsGraphSpec,
  type EconomicsGraphTemplate,
} from "@/lib/economics-graphs";
import { splitEconomicsTermText } from "@/lib/economics-term-matcher";
import { normalizeLatexForKatex } from "@/lib/utils";
import "katex/dist/katex.min.css";

interface MarkdownContentProps {
  content: string;
  className?: string;
  style?: React.CSSProperties;
  compact?: boolean;
  enableEconomicsTerms?: boolean;
  enableEconomicsGraphs?: boolean;
}

const DISPLAY_MATH_ENV_PATTERN = /\\begin\{(?:align|equation|gather|aligned|split|cases|multline|array|matrix|pmatrix|bmatrix|vmatrix|Vmatrix)\*?\}/;

function getHeadingText(heading: Element): string {
  const clone = heading.cloneNode(true) as Element;
  clone.querySelectorAll(".econ-term-card").forEach((node) => node.remove());
  return clone.textContent || "";
}

export function processContent(container: HTMLElement) {
  const slugger = new GithubSlugger();
  const headings = container.querySelectorAll("h1, h2, h3, h4, h5, h6");
  headings.forEach((heading) => {
    const text = getHeadingText(heading);
    heading.id = slugger.slug(text);
  });

  if (!container.textContent?.includes("$")) return;

  const processInlineMath = (textNode: Text) => {
    const text = textNode.textContent || "";
    if (!/\$(?!\$)[\s\S]+?\$(?!\$)/.test(text)) return;

    const parent = textNode.parentNode;
    if (!parent) return;

    const parts = text.split(/(?<!\$)\$(?!\$)([\s\S]+?)(?<!\$)\$(?!\$)/g);
    if (parts.length === 1) return;

    const fragment = document.createDocumentFragment();
    parts.forEach((part, index) => {
      if (index % 2 === 0) {
        if (part) fragment.appendChild(document.createTextNode(part));
        return;
      }

      const latex = normalizeLatexForKatex(part).trim();
      const displayMode = DISPLAY_MATH_ENV_PATTERN.test(latex);
      const span = document.createElement("span");
      span.className = displayMode ? "katex-display" : "katex-inline";
      try {
        span.innerHTML = katex.renderToString(latex, {
          throwOnError: false,
          displayMode,
        });
        fragment.appendChild(span);
      } catch {
        fragment.appendChild(document.createTextNode(`$${latex}$`));
      }
    });

    parent.replaceChild(fragment, textNode);
  };

  const processNode = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent || "";
      if (!text.includes("$")) return;

      const parent = node.parentNode as Element | null;
      if (!parent) return;
      if (
        parent.closest(".katex, .katex-display, .katex-html, code, pre")
      ) {
        return;
      }

      if (text.includes("$$")) {
        const parts = text.split(/\$\$([\s\S]*?)\$\$/);
        if (parts.length === 1) {
          processInlineMath(node as Text);
          return;
        }

        const fragment = document.createDocumentFragment();
        parts.forEach((part, index) => {
          if (index % 2 === 0) {
            if (part) fragment.appendChild(document.createTextNode(part));
            return;
          }

          const span = document.createElement("span");
          span.className = "katex-display";
          const latex = normalizeLatexForKatex(part, true)
            .replace(/[\n\r]+/g, " ")
            .trim();
          try {
            span.innerHTML = katex.renderToString(
              latex,
              { throwOnError: false, displayMode: true }
            );
            fragment.appendChild(span);
          } catch {
            fragment.appendChild(document.createTextNode(`$$${latex}$$`));
          }
        });

        parent.replaceChild(fragment, node);
        return;
      }

      processInlineMath(node as Text);
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const element = node as Element;
    if (element.closest(".katex, .katex-display, .katex-html, code, pre")) return;
    Array.from(node.childNodes).forEach(processNode);
  };

  processNode(container);
}

function createEconomicsTermNode(text: string, termId: string, label: string, body: string, hint: string): HTMLElement {
  const wrapper = document.createElement("span");
  wrapper.className = "econ-term-popover";
  wrapper.tabIndex = 0;
  wrapper.setAttribute("data-economics-term", termId);
  wrapper.setAttribute("aria-label", `${label}：${body}`);

  const trigger = document.createElement("span");
  trigger.className = "econ-term-trigger";
  trigger.textContent = text;

  const card = document.createElement("span");
  card.className = "econ-term-card";

  const title = document.createElement("span");
  title.className = "econ-term-card-title";
  title.textContent = label;

  const definition = document.createElement("span");
  definition.className = "econ-term-card-body";
  definition.textContent = body;

  const examHint = document.createElement("span");
  examHint.className = "econ-term-card-hint";
  examHint.textContent = hint;

  card.append(title, definition, examHint);
  wrapper.append(trigger, card);
  return wrapper;
}

function processEconomicsTerms(container: HTMLElement) {
  const walker = document.createTreeWalker(
    container,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        const text = node.textContent ?? "";
        if (!text.trim()) return NodeFilter.FILTER_REJECT;

        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        if (
          parent.closest(
            "a, button, code, pre, script, style, .katex, .katex-display, .katex-html, .econ-term-popover, .econ-graph-block, .english-vocab-mark",
          )
        ) {
          return NodeFilter.FILTER_REJECT;
        }

        return NodeFilter.FILTER_ACCEPT;
      },
    },
  );

  const textNodes: Text[] = [];
  let current = walker.nextNode();
  while (current) {
    textNodes.push(current as Text);
    current = walker.nextNode();
  }

  textNodes.forEach((textNode) => {
    const text = textNode.textContent ?? "";
    const segments = splitEconomicsTermText(text);
    if (!segments.some((segment) => segment.type === "term")) return;

    const fragment = document.createDocumentFragment();
    segments.forEach((segment) => {
      if (segment.type === "text") {
        fragment.appendChild(document.createTextNode(segment.text));
        return;
      }

      const label = `${segment.term.english} · ${segment.term.chinese}`;
      fragment.appendChild(createEconomicsTermNode(
        segment.text,
        segment.term.id,
        label,
        segment.term.plainMeaning,
        segment.term.examHint,
      ));
    });

    textNode.parentNode?.replaceChild(fragment, textNode);
  });
}

const SVG_NS = "http://www.w3.org/2000/svg";

const graphKindLabels: Record<EconomicsGraphElementKind, string> = {
  area: "区域",
  curve: "曲线",
  guide: "辅助线",
  point: "点",
};

function setAttributes(element: Element, attrs: Record<string, string | number | boolean | undefined>) {
  Object.entries(attrs).forEach(([key, value]) => {
    if (value === undefined) return;
    element.setAttribute(key, String(value));
  });
}

function createSvgElement(tagName: string, attrs: Record<string, string | number | boolean | undefined> = {}) {
  const element = document.createElementNS(SVG_NS, tagName);
  setAttributes(element, attrs);
  return element;
}

function createTextElement(tagName: keyof HTMLElementTagNameMap, className: string, text = "") {
  const element = document.createElement(tagName);
  element.className = className;
  element.textContent = text;
  return element;
}

function appendGraphAxes(svg: SVGElement, template: EconomicsGraphTemplate) {
  const grid = createSvgElement("g", { class: "econ-graph-grid" });
  [160, 240, 320, 400, 480, 560].forEach((x) => {
    grid.appendChild(createSvgElement("line", { x1: x, y1: 62, x2: x, y2: 340 }));
  });
  [100, 160, 220, 280].forEach((y) => {
    grid.appendChild(createSvgElement("line", { x1: 80, y1: y, x2: 580, y2: y }));
  });
  svg.appendChild(grid);

  const axes = createSvgElement("g", { class: "econ-graph-axes" });
  axes.appendChild(createSvgElement("path", { d: "M80 340 H580" }));
  axes.appendChild(createSvgElement("path", { d: "M80 340 V52" }));
  axes.appendChild(createSvgElement("path", { d: "M580 340 L568 334 L568 346 Z" }));
  axes.appendChild(createSvgElement("path", { d: "M80 52 L74 64 L86 64 Z" }));

  const xLabel = createSvgElement("text", { x: 540, y: 382, class: "econ-graph-axis-label" });
  xLabel.textContent = template.xLabel;
  const yLabel = createSvgElement("text", { x: 40, y: 58, class: "econ-graph-axis-label" });
  yLabel.textContent = template.yLabel;
  axes.append(xLabel, yLabel);
  svg.appendChild(axes);
}

function appendGraphLabel(svg: SVGElement, element: EconomicsGraphElement) {
  if (element.labelX === undefined || element.labelY === undefined) return;

  const label = createSvgElement("text", {
    x: element.labelX,
    y: element.labelY,
    class: "econ-graph-svg-label",
    fill: element.color,
    "data-econ-graph-label": element.id,
  });
  label.textContent = element.label;
  svg.appendChild(label);
}

function createGraphSvgNode(
  element: EconomicsGraphElement,
  selectElement: (elementId: string) => void,
  focusIds: Set<string>,
) {
  const baseClass = [
    "econ-graph-element",
    `econ-graph-${element.kind}`,
    focusIds.has(element.id.toLowerCase()) ? "is-focus" : "",
  ].filter(Boolean).join(" ");

  let node: SVGElement;
  if (element.kind === "point") {
    const group = createSvgElement("g", { class: baseClass });
    const circle = createSvgElement("circle", {
      cx: element.x,
      cy: element.y,
      r: 6,
      class: "econ-graph-point-dot",
      fill: element.color,
    });
    group.appendChild(circle);
    node = group;
  } else if (element.kind === "area") {
    node = createSvgElement("path", {
      d: element.path,
      class: baseClass,
      fill: element.color,
    });
  } else {
    node = createSvgElement("path", {
      d: element.path,
      class: baseClass,
      stroke: element.color,
      "stroke-dasharray": element.dashed ? "7 7" : undefined,
    });
  }

  node.setAttribute("data-econ-graph-element", element.id);
  node.setAttribute("role", "button");
  node.setAttribute("tabindex", "0");
  node.setAttribute("aria-label", element.label);
  node.addEventListener("click", () => selectElement(element.id));
  node.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    selectElement(element.id);
  });
  return node;
}

function createEconomicsGraphErrorNode(message: string) {
  const node = document.createElement("div");
  node.className = "econ-graph-error";
  const title = createTextElement("strong", "econ-graph-error-title", "经济学图像配置有误");
  const body = createTextElement("span", "econ-graph-error-body", message);
  node.append(title, body);
  return node;
}

function createEconomicsGraphNode(spec: EconomicsGraphSpec) {
  const template = getEconomicsGraphTemplate(spec.template);
  if (!template) return createEconomicsGraphErrorNode("暂不支持这个经济学图像模板。");

  const graph = document.createElement("section");
  graph.className = "econ-graph-block";
  graph.setAttribute("data-econ-graph-template", template.id);

  const header = document.createElement("header");
  header.className = "econ-graph-header";
  const titleGroup = document.createElement("div");
  const eyebrow = createTextElement("span", "econ-graph-eyebrow", "经济学图像");
  const title = createTextElement("h3", "econ-graph-title", spec.title ?? template.title);
  titleGroup.append(eyebrow, title);
  const subtitle = createTextElement("p", "econ-graph-subtitle", template.subtitle);
  header.append(titleGroup, subtitle);

  const layout = document.createElement("div");
  layout.className = "econ-graph-layout";

  const figure = document.createElement("div");
  figure.className = "econ-graph-figure";
  const svg = createSvgElement("svg", {
    class: "econ-graph-svg",
    viewBox: template.viewBox,
    role: "img",
    "aria-label": spec.title ?? template.title,
  });
  appendGraphAxes(svg, template);

  const elementById = new Map(template.elements.map((element) => [element.id, element]));
  const focusIds = new Set(spec.focus.map((id) => id.toLowerCase()).filter((id) => elementById.has(id)));
  const orderedElements = [...template.elements].sort((a, b) => {
    const order: Record<EconomicsGraphElementKind, number> = { area: 0, guide: 1, curve: 2, point: 3 };
    return order[a.kind] - order[b.kind];
  });

  const panel = document.createElement("aside");
  panel.className = "econ-graph-panel";
  const panelKind = createTextElement("span", "econ-graph-panel-kind", "概览");
  const panelTitle = createTextElement("h4", "econ-graph-panel-title", template.title);
  const panelBody = createTextElement("p", "econ-graph-panel-body", template.overview);
  const panelHint = createTextElement("p", "econ-graph-panel-hint", "先确认坐标轴含义，再读曲线交点和投影。");
  const panelFormula = document.createElement("code");
  panelFormula.className = "econ-graph-panel-formula";
  panelFormula.hidden = true;
  const selector = document.createElement("div");
  selector.className = "econ-graph-selector";
  const visibility = document.createElement("div");
  visibility.className = "econ-graph-visibility";
  const visibilityTitle = createTextElement("span", "econ-graph-visibility-title", "显示曲线");
  const visibilityControls = document.createElement("div");
  visibilityControls.className = "econ-graph-visibility-controls";
  visibility.append(visibilityTitle, visibilityControls);

  const setElementVisible = (elementId: string, visible: boolean) => {
    graph.querySelectorAll(
      `[data-econ-graph-element="${elementId}"], [data-econ-graph-label="${elementId}"]`,
    ).forEach((node) => {
      node.classList.toggle("is-hidden", !visible);
    });
  };

  const selectElement = (elementId: string) => {
    const element = elementById.get(elementId);
    if (!element) return;

    graph.querySelectorAll("[data-econ-graph-element]").forEach((node) => {
      node.classList.toggle("is-active", node.getAttribute("data-econ-graph-element") === elementId);
    });
    graph.querySelectorAll("[data-econ-graph-button]").forEach((node) => {
      node.classList.toggle("is-active", node.getAttribute("data-econ-graph-button") === elementId);
    });

    panelKind.textContent = graphKindLabels[element.kind];
    panelTitle.textContent = element.label;
    panelBody.textContent = element.description;
    panelHint.textContent = element.examHint;
    panelFormula.textContent = element.formula ?? "";
    panelFormula.hidden = !element.formula;
  };

  orderedElements.forEach((element) => {
    svg.appendChild(createGraphSvgNode(element, selectElement, focusIds));
  });
  template.elements.forEach((element) => appendGraphLabel(svg, element));

  template.elements.forEach((element) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "econ-graph-selector-button";
    button.setAttribute("data-econ-graph-button", element.id);
    button.textContent = element.label;
    button.addEventListener("click", () => selectElement(element.id));
    selector.appendChild(button);
  });

  template.elements
    .filter((element) => element.kind === "curve")
    .forEach((element) => {
      const control = document.createElement("label");
      control.className = "econ-graph-visibility-control";

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = true;
      checkbox.addEventListener("change", () => setElementVisible(element.id, checkbox.checked));

      const name = createTextElement("span", "econ-graph-visibility-name", element.label);
      control.append(checkbox, name);
      visibilityControls.appendChild(control);
    });

  panel.append(panelKind, panelTitle, panelBody, panelFormula, panelHint, selector, visibility);
  figure.appendChild(svg);
  layout.append(figure, panel);
  graph.append(header, layout);

  const initialElementId = spec.focus.find((id) => elementById.has(id.toLowerCase()))?.toLowerCase()
    ?? template.defaultElementId;
  selectElement(initialElementId);

  return graph;
}

function processEconomicsGraphs(container: HTMLElement) {
  const graphBlocks = container.querySelectorAll("pre > code.language-econgraph, pre > code[class~='language-econgraph']");
  graphBlocks.forEach((codeBlock) => {
    const pre = codeBlock.parentElement;
    if (!pre) return;

    const parsed = parseEconomicsGraphSpec(codeBlock.textContent ?? "");
    const graph = parsed.ok
      ? createEconomicsGraphNode(parsed.spec)
      : createEconomicsGraphErrorNode(parsed.message);
    pre.replaceWith(graph);
  });
}

export function MarkdownContent({
  content,
  className = "",
  style,
  compact = false,
  enableEconomicsTerms = false,
  enableEconomicsGraphs = false,
}: MarkdownContentProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const htmlContent = useMemo(() => renderMarkdownToHtml(content), [content]);

  const processRenderedContent = () => {
    if (containerRef.current) {
      processContent(containerRef.current);
      if (enableEconomicsGraphs) {
        processEconomicsGraphs(containerRef.current);
      }
      if (enableEconomicsTerms) {
        processEconomicsTerms(containerRef.current);
      }
    }
  };

  useLayoutEffect(() => {
    processRenderedContent();
  });

  useEffect(() => {
    const frame = requestAnimationFrame(processRenderedContent);
    const lateFrame = window.setTimeout(processRenderedContent, 120);
    const animationFrame = window.setTimeout(processRenderedContent, 320);

    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(lateFrame);
      window.clearTimeout(animationFrame);
    };
  });

  return (
    <div
      ref={containerRef}
      className={`markdown-surface ${compact ? "markdown-compact" : ""} ${className}`}
      style={style}
      dangerouslySetInnerHTML={{ __html: htmlContent }}
    />
  );
}
