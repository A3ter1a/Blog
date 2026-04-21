/**
 * Convert LaTeX delimiters for remark-math compatibility.
 * Converts `\[...\]` to `$$...$$` and `\(...\)` to `$...$`.
 */
export function preprocessLatex(content: string): string {
  return content
    .replace(/\\\[/g, '$$')
    .replace(/\\\]/g, '$$')
    .replace(/\\\(/g, '$')
    .replace(/\\\)/g, '$');
}

/**
 * Convert a File to a base64 string (data URL without prefix).
 */
export async function fileToBase64(file: File): Promise<string> {
  const reader = new FileReader();
  reader.readAsDataURL(file);
  return new Promise<string>((resolve) => {
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1]);
    };
  });
}

/**
 * Convert a File to a base64 data URL (full string including prefix).
 */
export async function fileToDataUrl(file: File): Promise<string> {
  const reader = new FileReader();
  reader.readAsDataURL(file);
  return new Promise<string>((resolve) => {
    reader.onload = () => {
      resolve(reader.result as string);
    };
  });
}
