import { IntervalCounters } from "../src/commons";

describe("IntervalCounters", () => {
    it("tracks buckets and rolls over when intervals change", () => {
        const base = 0;
        const counters = new IntervalCounters(base);

        counters.record(1, base);

        const initial = counters.snapshot({}, base);
        expect(initial).toMatchObject({
            total: 1,
            lastS: 1,
            lastM: 1,
            last10M: 1,
            last30M: 1,
            last1H: 1,
            last6H: 1,
            last12H: 1,
            last24H: 1,
            last7D: 1,
            last14D: 1,
            last30D: 1
        });

        const afterSecond = counters.snapshot({}, base + 1_500);
        expect(afterSecond.lastS).toBe(0);
        expect(afterSecond.lastM).toBe(1);
        expect(afterSecond.total).toBe(1);

        counters.record(1, base + 90_000);
        const afterMinute = counters.snapshot({}, base + 90_000);
        expect(afterMinute.total).toBe(2);
        expect(afterMinute.lastS).toBe(1);
        expect(afterMinute.lastM).toBe(1);
        expect(afterMinute.last10M).toBe(2);
    });

    it("returns snapshot without _ticks and can skip rollover", () => {
        const base = 0;
        const counters = new IntervalCounters(base);

        counters.record(1, base);

        const snapshot = counters.snapshot({ rollover: false }, base + 2_000);
        expect(snapshot.lastS).toBe(1); // no rollover, even though time advanced
        expect("_ticks" in snapshot).toBe(false);
    });

    it("hardReset wipes counts and ticks", () => {
        const counters = new IntervalCounters(0);
        counters.record(3, 0).record(2, 10_000);

        counters.hardReset();
        expect((counters as any).counters._ticks).toEqual({});

        const afterReset = counters.snapshot({}, 20_000);
        expect(afterReset.total).toBe(0);
        expect(afterReset.lastS).toBe(0);

        counters.record(1, 20_000);
        const afterRecord = counters.snapshot({}, 20_000);
        expect(afterRecord.total).toBe(1);
        expect(afterRecord.lastS).toBe(1);
    });

    it("serializes and restores counter state", () => {
        const base = 0;
        const counters = new IntervalCounters(base);
        counters.record(1, base).record(1, base + 500);

        const state = counters.toJSON();
        const restored = IntervalCounters.fromJSON(state);

        expect(restored.snapshot({ rollover: false }, base)).toEqual(
            counters.snapshot({ rollover: false }, base)
        );

        restored.record(1, base + 2_000);
        expect(restored.snapshot({}, base + 2_000).total).toBe(3);
        expect(counters.snapshot({ rollover: false }, base).total).toBe(2);
    });

    it("defaults invalid amounts to 1", () => {
        const counters = new IntervalCounters(0);
        counters.record(Number.NaN, 0);

        const snapshot = counters.snapshot({ rollover: false }, 0);
        expect(snapshot.total).toBe(1);
        expect(snapshot.lastM).toBe(1);
    });
});
