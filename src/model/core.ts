export namespace Models {
    export interface ExecutionModel {
        name: string,
        version: string,
        message: API.Message,
        api: any, // object holding functions that can be called from model
        libs: any // object holding third party libraries that can be called from model
        logs: string[] // holds execution logs
    }


    export interface ModelVariant extends ModelInfo{
        variant: Variant;  // model variant
    }

    export interface ExecutableModelVariant extends ModelVariant{
        code: string // model variant code
    }

    export interface Variant{
        variant: string // variant id
        mode: Nanoautomata.ProcessingModes,
        ratio: number,
        channels: string[],
        events: string // when provided variant will be triggered only when message with given codes (comma separated, including regexps) is received

    }

    export interface Model{
        id: string, // unique model id
        code: string // model code
    }

    export interface ModelInfo{
        id: string, // unique model id
        variants: Variants        
    }
    export interface Variants {
        [key:string]: Variant
    }

    export interface ProcessingFail {
        message: string,
        model: string
    }
}

export namespace API {    
    export interface ProcessingInfo {
        i: string // instance id        
        b: number // begin timestamp
        e: number // end timestampt
    }
    export interface Context {
        i: string // message id (usually should be unique)
        a: string, // originating channel name (for filtering of models)
        ax: Annotation[]    // annotations added as a result of model processing
        p: ProcessingInfo[] // processors array, here processors put their processing info
    }
    export interface Message {
        c: string, // message code
        ctx: Context    // processing context
        u: { // user context (originator of the message or target of the message)
            id: string
        },
        d: {    // debugging flaggs
            e: boolean // when true logs of the message execution will be captured/recorded
            s: number // sampling <0, 100> - when provided message capture will be sampled according to this ratio. 0 - disables log captures, 100 - logs will be captured for all messages
        }

    }

    export interface Annotation {
        c: string, // annotation code
        v: any, // annotation data (any structure)
        m: string, // model version
        t: string | "a", // "a" for annotation type
        e: Nanoautomata.ProcessingModes // whether annotation was generated from runtime or test model
    }
}

export namespace Providers {
    export interface ModelProvider {
        getModelsInfo: ()=>Promise<Models.ModelInfo[]>
        getModelVariant: (id: string, variantId: string)=>Promise<Models.ExecutableModelVariant>
    }    
    export interface ModelLibrariesProvider {
        getLibraries: ()=>Promise<{
            [key:string]: any // library variable name, library function/module
        }>        
    }
    export interface ModelApiProvider {
        getApi: ()=>Promise<{
            [key:string]: any // function name, function (may be also an async function)
        }>
    }    
}
export namespace Nanoautomata {
    export enum ProcessingModes {
        runtime = "runtime",
        test = "test"
    }

    export interface Logger {
        log: (message: string, ...args: any[]) => void;
        error: (message: string, ...args: any[]) => void;   
        warn: (message: string, ...args: any[]) => void;
        info: (message: string, ...args: any[]) => void;
        debug: (message: string, ...args: any[]) => void;
    }

    export interface ExecutionLogsSink {
        consume: (logs:any[])=>Promise<void>
    }
}