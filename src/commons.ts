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