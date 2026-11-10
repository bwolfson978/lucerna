/**
 * Keeps the server's copy of each reply's rating in step with what the person last
 * picked (formal/tla/ReplyRating.tla).
 *
 * A person can tap a thumb, change their mind and add a note within a second, and
 * requests can arrive out of order or fail. So for each reply: one request at a time,
 * each with a higher sequence number (the server ignores an older one), and when a
 * request settles the latest pick is sent again unless the server confirmed exactly
 * that. After a failure the server may or may not have applied the request, so the
 * latest pick is sent again, a few times, then left until the next change.
 */

import { sendReplyRating } from "./client";
import type { ReplyRating } from "./types";

type Send = (traceId: string, seq: number, rating: ReplyRating | null) => Promise<boolean>;

interface Entry {
  picked: ReplyRating | null;
  /** What the server holds, as JSON; undefined when unknown. */
  acked: string | undefined;
  inflight: boolean;
  seq: number;
  failures: number;
}

export const MAX_RETRIES = 3;
export const RETRY_MS = 2000;

export class ReplyRatingSync {
  private entries = new Map<string, Entry>();

  constructor(
    private send: Send = sendReplyRating,
    private now: () => number = Date.now,
    private wait: (ms: number) => Promise<void> = (ms) =>
      new Promise((resolve) => setTimeout(resolve, ms))
  ) {}

  /** The person's latest choice for a reply. `acked` is what the server is known to hold. */
  pick(traceId: string, rating: ReplyRating | null): void {
    let entry = this.entries.get(traceId);
    if (!entry) {
      // A reply rated before a reload: what the server holds isn't known, so send.
      entry = { picked: rating, acked: undefined, inflight: false, seq: 0, failures: 0 };
      this.entries.set(traceId, entry);
    }
    entry.picked = rating;
    entry.failures = 0;
    void this.pump(traceId, entry);
  }

  /** Resolves when nothing is in flight for any reply (tests). */
  async idle(): Promise<void> {
    while ([...this.entries.values()].some((e) => e.inflight)) await this.wait(0);
  }

  private async pump(traceId: string, entry: Entry): Promise<void> {
    if (entry.inflight) return;
    entry.inflight = true;
    try {
      while (JSON.stringify(entry.picked) !== entry.acked && entry.failures <= MAX_RETRIES) {
        const sending = entry.picked;
        // Wall-clock based, so it keeps rising across reloads of the page.
        entry.seq = Math.max(this.now(), entry.seq + 1);
        const ok = await this.send(traceId, entry.seq, sending);
        if (ok) {
          entry.acked = JSON.stringify(sending);
          entry.failures = 0;
        } else {
          entry.acked = undefined;
          entry.failures += 1;
          if (entry.failures <= MAX_RETRIES) await this.wait(RETRY_MS);
        }
      }
    } finally {
      entry.inflight = false;
    }
  }
}

export const replyRatings = new ReplyRatingSync();
