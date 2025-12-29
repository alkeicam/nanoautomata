import { API } from "./model/core";

export class ProcessorAnnotator {
    static annotate(message: API.Message, instanceId: string, startTs?: number, endTs?: number){
        if(!message.ctx) throw new Error(`Context must be ready to annotate ${instanceId}`);
        const processors = message.ctx.p || [];
        // first find if processor already exists, so one can update startTs and endTs
        let processor = processors.find((item:any)=>item.i == instanceId);
        if(!processor){
            processor = {
                i: instanceId,        
                b: startTs!,
                e: endTs!
            }
            processors.push(processor);
        }
        // only overwrite when value was not provided previously
        processor.b = !processor.b?startTs!:processor.b
        processor.e = !processor.e?endTs!:processor.e
        message.ctx.p = processors
    }
}

export class ModelError extends Error {
  readonly model: string;

  constructor(message: string, model: string) {
    super(message);
    this.name = "ModelError";
    this.model = model;

    // Fix prototype chain for downlevel targets
    Object.setPrototypeOf(this, new.target.prototype);

    // Optional: capture stack without constructor frames (V8 only)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ModelError);
    }
  }
}

/**
 * Will return true when target string matches any of provided patterns
 * When patterns are empty "whenPatternsEmpty" is returned.
 * Patterns can be provided as an array of patterns (strings) or
 * comma separated list of patterns
 * @param {*} target string
 * @param {*} patterns array or comma separated list of arrays
 * @param {*} whenPatternsEmpty when patterns are empty what to return (instead of checking)
 * @param {*} separator when patterns is provided as a string, default is ","
 * @returns 
 */
export const matchAnyPattern = (target: string, patterns="", whenPatternsEmpty=true, separator=",") => {
    const patternsArray = Array.isArray(patterns)?patterns:patterns.split(separator);
    if(patternsArray.length==0) return whenPatternsEmpty;

    let result = false;

    patternsArray.forEach(pattern=>{
        const regexp = new RegExp(pattern.trim(),"g");
        // when we have a match we switch result to true, only single match is enough
        result = regexp.test(target)?true:result;        
    })  

    return result;
}

export const modelVersionFormatter = (name: string, version: string)=>{
    return `${name}@v${version}`;
}

export const generateId = (length: number = 16) => {
    const part1 = Math.random().toString(36).substring(2, 12);
    const part2 = Math.random().toString(36).substring(2, 12);
    const part3 = Math.random().toString(36).substring(2, 12);
    const part4 = Math.random().toString(36).substring(2, 12);
    const result = `${part1}${part2}${part3}${part4}`.substring(0, Math.min(length,32));
    return result;
}


export class IntervalCounters {
    counters: {
        total: number;
        lastS: number;
        lastM: number;
        last10M: number;
        last30M: number;
        last1H: number;
        last6H: number;
        last12H: number;
        last24H: number;
        last7D: number;
        last14D: number;
        last30D: number;
        _ticks: any;
    };

    static INTERVALS_MS = {
        lastS: 1_000,
        lastM: 60_000,
        last10M: 10 * 60_000,
        last30M: 30 * 60_000,
        last1H: 60 * 60_000,
        last6H: 6 * 60 * 60_000,
        last12H: 12 * 60 * 60_000,
        last24H: 24 * 60 * 60_000,
        last7D: 7 * 24 * 60 * 60_000,
        last14D: 14 * 24 * 60 * 60_000,
        last30D: 30 * 24 * 60 * 60_000,
    };

    constructor(nowMs = Date.now()) {
        this.counters = {
            total: 0,
            lastS: 0,
            lastM: 0,
            last10M: 0,
            last30M: 0,
            last1H: 0,
            last6H: 0,
            last12H: 0,
            last24H: 0,
            last7D: 7 * 24 * 60 * 60_000,
            last14D: 14 * 24 * 60 * 60_000,
            last30D: 30 * 24 * 60 * 60_000,
            _ticks: {}
        };

        // initialize ticks so buckets start “fresh”
        this.rollover(nowMs, { resetOnInit: true });
    }

    // Resets any bucket whose time-slice changed
    rollover(nowMs = Date.now(), { resetOnInit = false } = {}) {
        const ticks = (this.counters._ticks ??= {});

        for (const [key, sizeMs] of Object.entries(IntervalCounters.INTERVALS_MS)) {
            const tick = Math.floor(nowMs / sizeMs);
            const prevTick = ticks[key];

            if (prevTick === undefined) {
                ticks[key] = tick;
                if (resetOnInit) this.counters[key as keyof typeof this.counters] = 0;
                continue;
            }

            if (tick !== prevTick) {
                ticks[key] = tick;
                this.counters[key as keyof typeof this.counters] = 0;
            }
        }

        return this;
    }

    // Record a new event (optionally with an amount)
    record(amount = 1, nowMs = Date.now()) {
        if (!Number.isFinite(amount)) amount = 1;

        this.rollover(nowMs);

        this.counters.total += amount;
        for (const key of Object.keys(IntervalCounters.INTERVALS_MS)) {
            this.counters[key as keyof typeof this.counters] += amount;
        }

        return this;
    }

    // Reset everything, including total
    hardReset() {
        this.counters.total = 0;
        for (const key of Object.keys(IntervalCounters.INTERVALS_MS)) {
            this.counters[key as keyof typeof this.counters] = 0;
        }
        this.counters._ticks = {};
        return this;
    }

    // Read current counters; optionally ensure buckets are current
    snapshot({ rollover = true } = {}, nowMs = Date.now()) {
        if (rollover) this.rollover(nowMs);
        const { _ticks, ...publicView } = this.counters; // hide internal ticks
        return { ...publicView };
    }

    // If you want to persist and restore state (e.g., Redis/DB)
    toJSON() {
        return structuredClone(this.counters);
    }

    static fromJSON(state: any) {
        const inst = new IntervalCounters();
        inst.counters = {
            total: 0,
            lastS: 0,
            lastM: 0,
            last10M: 0,
            last30M: 0,
            last1H: 0,
            last6H: 0,
            last12H: 0,
            last24H: 0,
            last7D: 0,
            last14D: 0,
            last30D: 0,            
            _ticks: {},
            ...(state || {})
        };
        inst.counters._ticks ??= {};
        return inst;
    }
}

