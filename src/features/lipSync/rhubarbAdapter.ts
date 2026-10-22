import { MouthCue, RhubarbJsonOutput } from '../../types/lipSync';

/**
 * Parses Rhubarb CLI JSON output format.
 */
export function parseRhubarbJson(jsonStr: string): { duration: number; cues: MouthCue[] } {
  let parsed: RhubarbJsonOutput;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (err) {
    throw new Error(`Failed to parse Rhubarb JSON: ${err instanceof Error ? err.message : 'Invalid JSON format'}`);
  }

  const rawCues = parsed.mouthCues || [];
  const duration = parsed.metadata?.duration || (rawCues.length > 0 ? rawCues[rawCues.length - 1].end : 0);

  const cues: MouthCue[] = rawCues.map((c, i) => ({
    id: `cue_${i}_${Date.now()}`,
    start: Number(c.start),
    end: Number(c.end),
    mouthId: (c.value || 'X').toUpperCase().trim(),
  }));

  return { duration, cues: sanitizeCues(cues) };
}

/**
 * Parses Rhubarb CLI TSV / tab-delimited output format.
 * Format 1: <start>\t<end>\t<shape>
 * Format 2: <start>\t<shape> (where end is the next start)
 */
export function parseRhubarbTsv(tsvStr: string, totalDuration: number = 0): { duration: number; cues: MouthCue[] } {
  const lines = tsvStr.trim().split(/\r?\n/).filter((l) => l.trim().length > 0);
  const tempEntries: Array<{ start: number; end?: number; shape: string }> = [];

  for (const line of lines) {
    const parts = line.split(/\t|\s+/);
    if (parts.length >= 3) {
      const start = parseFloat(parts[0]);
      const end = parseFloat(parts[1]);
      const shape = parts[2].trim().toUpperCase();
      if (!isNaN(start) && !isNaN(end)) {
        tempEntries.push({ start, end, shape });
      }
    } else if (parts.length === 2) {
      const start = parseFloat(parts[0]);
      const shape = parts[1].trim().toUpperCase();
      if (!isNaN(start)) {
        tempEntries.push({ start, shape });
      }
    }
  }

  const cues: MouthCue[] = [];
  for (let i = 0; i < tempEntries.length; i++) {
    const curr = tempEntries[i];
    const next = tempEntries[i + 1];
    const start = curr.start;
    const end = curr.end !== undefined ? curr.end : next ? next.start : Math.max(start + 0.2, totalDuration);

    cues.push({
      id: `cue_${i}_${Date.now()}`,
      start,
      end,
      mouthId: curr.shape,
    });
  }

  const maxEnd = cues.length > 0 ? cues[cues.length - 1].end : totalDuration;
  return { duration: Math.max(maxEnd, totalDuration), cues: sanitizeCues(cues) };
}

/**
 * Ensures cues are strictly chronological, non-overlapping, and with positive durations.
 */
export function sanitizeCues(cues: MouthCue[]): MouthCue[] {
  const sorted = [...cues].sort((a, b) => a.start - b.start);

  for (let i = 0; i < sorted.length; i++) {
    const current = sorted[i];
    if (current.end <= current.start) {
      current.end = current.start + 0.05;
    }
    const next = sorted[i + 1];
    if (next && current.end > next.start) {
      current.end = next.start;
    }
  }

  return sorted.filter((c) => c.end > c.start);
}

/**
 * Local Rhubarb runner adapter (connects to optional local companion or parses files).
 */
export class RhubarbAdapter {
  private companionUrl = 'http://127.0.0.1:8765';

  setCompanionUrl(url: string) {
    this.companionUrl = url.replace(/\/$/, '');
  }

  getCompanionUrl(): string {
    return this.companionUrl;
  }

  isCompanionEnabled(): boolean {
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') return false;
    return localStorage.getItem('rhubarb_companion_enabled') === 'true';
  }

  setCompanionEnabled(enabled: boolean): void {
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
    localStorage.setItem('rhubarb_companion_enabled', enabled ? 'true' : 'false');
  }

  async checkCompanionHealth(): Promise<boolean> {
    // Only probe local companion if explicitly enabled by user to prevent ERR_CONNECTION_REFUSED
    if (!this.isCompanionEnabled()) {
      return false;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1200);
      const res = await fetch(`${this.companionUrl}/health`, {
        method: 'GET',
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      return res.ok;
    } catch {
      return false;
    }
  }

  async generateWithCompanion(
    audioBlob: Blob,
    dialogueText: string
  ): Promise<{ cues: MouthCue[]; duration: number }> {
    const formData = new FormData();
    formData.append('audio', audioBlob, 'dialogue.wav');
    formData.append('script', dialogueText);

    const res = await fetch(`${this.companionUrl}/analyze`, {
      method: 'POST',
      body: formData,
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Rhubarb companion error: ${err}`);
    }

    const text = await res.text();
    if (text.trim().startsWith('{')) {
      return parseRhubarbJson(text);
    }
    return parseRhubarbTsv(text);
  }
}

export const rhubarbAdapter = new RhubarbAdapter();
