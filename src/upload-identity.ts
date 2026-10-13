/** Escape internal ID separators without changing ordinary public-address IDs. */
export function uploadIdentity(buffer: string, authority: string): string {
  return [buffer,authority].map(value => value.replaceAll('%','%25').replaceAll(':','%3A')).join(':');
}
