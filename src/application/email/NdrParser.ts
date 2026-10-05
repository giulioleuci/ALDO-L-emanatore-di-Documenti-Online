export interface ParsedNdr {
  recipient: string;
  code: string;
  reason: string;
}

const EMAIL = "[\\w.+'-]+@[\\w.-]+\\.[A-Za-z]{2,}";
const RECIPIENT = [
  new RegExp(`Final-Recipient:\\s*rfc822;\\s*(${EMAIL})`, 'i'),
  new RegExp(`wasn't delivered to\\s+<?(${EMAIL})`, 'i'),
  new RegExp(`(?:recipients or groups:|failed:)\\s*<?(${EMAIL})`, 'i')
];
const STATUS = /\b([45]\d{2})[ -]([45]\.\d{1,3}\.\d{1,3})\b[^\n']*/;

/** Permanent (5xx) NDR → failed recipient + SMTP diagnostic; null for transient (4xx) or non-NDR text. */
export function parseNdr(body: string): ParsedNdr | null {
  const status = STATUS.exec(body);
  if (status === null || !status[1]!.startsWith('5')) return null;
  for (const re of RECIPIENT) {
    const m = re.exec(body);
    if (m !== null)
      return { recipient: m[1]!.toLowerCase(), code: status[1]!, reason: status[0].trim() };
  }
  return null;
}
