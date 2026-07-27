const JSON_ESCAPES = new Set(["\"", "\\", "/", "b", "f", "n", "r", "t"]);

// These commands overlap with JSON's one-letter escapes (for example
// `\frac` starts with `\f`). When a model emits raw LaTeX inside a JSON
// string, they must be protected before JSON.parse sees them.
const LATEX_COMMANDS = new Set([
  "alpha", "approx", "array", "bar", "begin", "beta", "big", "Big", "bigg", "Bigg",
  "cdot", "cases", "circ", "cos", "dfrac", "delta", "det", "dots", "end", "equiv",
  "eta", "exists", "forall", "frac", "gamma", "ge", "geq", "hat", "in", "infty",
  "int", "iint", "lambda", "left", "le", "leq", "lim", "ln", "mathbb", "mathrm",
  "mu", "nabla", "neq", "notin", "nu", "omega", "partial", "pi", "pm", "prod",
  "quad", "right", "rho", "sin", "sqrt", "sum", "text", "theta", "times", "to",
  "underbrace", "xi", "zeta",
]);

function readLatexCommand(text: string, start: number): string | null {
  const match = text.slice(start).match(/^[A-Za-z]+/);
  if (!match || !LATEX_COMMANDS.has(match[0])) return null;
  return match[0];
}

/**
 * Repairs the small class of malformed JSON commonly emitted by LLMs:
 * raw LaTeX backslashes and literal control characters inside strings.
 * It deliberately leaves valid JSON escapes untouched.
 */
export function repairAIJsonText(jsonText: string): string {
  let result = "";
  let inString = false;

  for (let index = 0; index < jsonText.length; index += 1) {
    const char = jsonText[index];

    if (!inString) {
      result += char;
      if (char === '"') inString = true;
      continue;
    }

    if (char === '"') {
      result += char;
      inString = false;
      continue;
    }

    if (char === "\\") {
      const next = jsonText[index + 1] ?? "";
      const unicode = jsonText.slice(index + 2, index + 6);
      const latexCommand = readLatexCommand(jsonText, index + 1);

      // Preserve an already-valid escaped backslash as a unit. Without
      // advancing past the second slash, the next iteration would treat the
      // command after it as a second raw LaTeX command and over-escape it.
      if (next === "\\") {
        result += "\\\\";
        index += 1;
        continue;
      }

      // A raw LaTeX command must survive the JSON round trip, even when its
      // first letter happens to be b/f/n/r/t (valid JSON escape prefixes).
      if (latexCommand) {
        result += `\\\\${latexCommand}`;
        index += latexCommand.length;
        continue;
      }

      if (next === "u" && /^[0-9a-fA-F]{4}$/.test(unicode)) {
        result += `\\u${unicode}`;
        index += 5;
        continue;
      }

      if (JSON_ESCAPES.has(next)) {
        result += `\\${next}`;
        index += 1;
        continue;
      }

      // Invalid escape such as `\[` or `\ `: double the slash so the
      // decoded value contains the original literal backslash.
      result += "\\\\";
      continue;
    }

    if (char < " ") {
      const code = char.charCodeAt(0).toString(16).padStart(4, "0");
      result += `\\u${code}`;
      continue;
    }

    result += char;
  }

  return result;
}
