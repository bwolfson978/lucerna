import { MAX_RETRIES, ReplyRatingSync } from "../replyRating";
import type { ReplyRating } from "../types";

/** A server like backend/app/agent/feedback.py: applies a request unless it has a newer one. */
function fakeServer() {
  let stored: ReplyRating | null = null;
  let storedSeq = -1;
  const waiting: { seq: number; rating: ReplyRating | null; done: (ok: boolean) => void }[] = [];
  return {
    get stored() {
      return stored;
    },
    waiting,
    send: (_id: string, seq: number, rating: ReplyRating | null) =>
      new Promise<boolean>((done) => waiting.push({ seq, rating, done })),
    /** Deliver the oldest waiting request; answer it, or lose the answer. */
    deliver(answer = true) {
      const request = waiting.shift()!;
      if (request.seq > storedSeq) {
        stored = request.rating;
        storedSeq = request.seq;
      }
      request.done(answer);
    },
    /** The request never arrives. */
    drop() {
      waiting.shift()!.done(false);
    },
  };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const noWait = () => Promise.resolve();

describe("ReplyRatingSync (formal/tla/ReplyRating.tla)", () => {
  it("OneAtATime: a second pick waits for the first request, then sends the latest", async () => {
    const server = fakeServer();
    const sync = new ReplyRatingSync(server.send, () => 100, noWait);
    sync.pick("t", { value: "down" });
    sync.pick("t", { value: "down", reason: "hard_to_follow" });
    sync.pick("t", { value: "up" });
    await tick();
    expect(server.waiting).toHaveLength(1);
    server.deliver();
    await tick();
    expect(server.waiting.map((r) => r.rating)).toEqual([{ value: "up" }]);
    server.deliver();
    await sync.idle();
    expect(server.stored).toEqual({ value: "up" });
    expect(server.waiting).toHaveLength(0);
  });

  it("sequence numbers rise even when the clock doesn't", async () => {
    const server = fakeServer();
    const sync = new ReplyRatingSync(server.send, () => 100, noWait);
    sync.pick("t", { value: "up" });
    await tick();
    const first = server.waiting[0].seq;
    server.deliver();
    await tick();
    sync.pick("t", null);
    await tick();
    expect(server.waiting[0].seq).toBeGreaterThan(first);
  });

  it("LastPickWins: a request that reached the server but lost its answer is sent again", async () => {
    const server = fakeServer();
    const sync = new ReplyRatingSync(server.send, () => 100, noWait);
    sync.pick("t", { value: "down" });
    await tick();
    sync.pick("t", null);
    server.deliver(false); // applied, but the page saw a failure
    await tick();
    expect(server.stored).toEqual({ value: "down" });
    server.deliver(); // the clear
    await sync.idle();
    expect(server.stored).toBeNull();
  });

  it("retries a lost request, then stops until the next change", async () => {
    const server = fakeServer();
    const sync = new ReplyRatingSync(server.send, () => 100, noWait);
    sync.pick("t", { value: "up" });
    for (let i = 0; i <= MAX_RETRIES; i++) {
      await tick();
      server.drop();
    }
    await sync.idle();
    expect(server.waiting).toHaveLength(0);
    sync.pick("t", { value: "up" });
    await tick();
    server.deliver();
    await sync.idle();
    expect(server.stored).toEqual({ value: "up" });
  });

  it("does not resend a pick the server already confirmed", async () => {
    const server = fakeServer();
    const sync = new ReplyRatingSync(server.send, () => 100, noWait);
    sync.pick("t", { value: "up" });
    await tick();
    server.deliver();
    await sync.idle();
    sync.pick("t", { value: "up" });
    await tick();
    expect(server.waiting).toHaveLength(0);
  });
});
