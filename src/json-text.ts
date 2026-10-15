/** Accept one leading UTF-8 encoding marker without changing JSON string values. */
export function parseJsonFileText(text: string): unknown {
  return JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text) as unknown;
}
