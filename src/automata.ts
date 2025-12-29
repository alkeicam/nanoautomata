const {NodeVM} = require("vm2");
import {API, Counters, Models, Nanoautomata, Providers} from "./model/core"
import { ModelError, ProcessorAnnotator, matchAnyPattern, modelVersionFormatter } from "./commons";
import { generateId, IntervalCounters } from "./commons";

// import {generateContextId, ProcessorAnnotator, modelVersionFormatter, matchAnyPattern} = require('@archimedes/adi-ms-common');
// const {generateContextId, ProcessorAnnotator, modelVersionFormatter, matchAnyPattern} = require('../common/src');

const Stopwatch = require('statman-stopwatch');
// const tf = require('@tensorflow/tfjs-node');
// const tf = require('@tensorflow/tfjs-node-gpu');
// NVIDIA® GPU drivers	>450.x
// CUDA® Toolkit	11.2
// cuDNN SDK	8.1.0

/**
 * @typedef {Object} ADIMessage
 * @property {string} v event version
 * @property {string} c event code
 * @property {boolean} i true for realtime events
 * @property {number} t channel timestamp, miliseconds 
 * @property {Payload} p event payload
 * @property {Patient} u patient who originated the event
 * 
 * @typedef {Object} ADIMessageExtended
 * @property {string} v event version
 * @property {string} c event code
 * @property {boolean} i true for realtime events
 * @property {number} t channel timestamp, miliseconds
 * @property {number} st server timestamp, miliseconds
 * @property {Context} ctx message context
 * @property {Payload} p event payload
 * @property {Patient} u patient who originated the event
 *
 * @typedef {Object} ADIEndpointConnectionCredentials
 * @property {string} apiKey api key for communicating with endpoint
 * 
 * @typedef {Object} ADIEndpointConnection
 * @property {"rest"|"soap"|"mq"} type endpoint type
 * @property {string} url endpoint url
 * @property {ADIEndpointConnectionCredentials} credentials endpoint url
 *  
 * @typedef {Object} ADIEndpoint
 * @property {string} name endpoint name
 * @property {ADIEndpointConnection} connection connection details
 * @property {string} queue name of the queue which will send data to the endpoint
 * 
 * 
 * @typedef {Object} ADIAnnotationRaisePayload
 * @property {string} c raise code
 * @property {Object} v raise value (may be a scalar or object or array)
 * @property {string} m model information (which model created this payload)
 * @property {string} t payload type, "r" for raise "a" for annotation
 * 
 */


export class Automata {
    _modelProvider: Providers.ModelProvider;
    _apiProvider: Providers.ModelApiProvider;
    _librariesProvider: Providers.ModelLibrariesProvider;
    _logsSink: Nanoautomata.ExecutionLogsSink;

    _instanceId: string;
    _logger: any;
    // 
    _counters?: Counters.ExecutionCounter;

    constructor(){        
        this._modelProvider = {} as Providers.ModelProvider;
        this._apiProvider = {} as Providers.ModelApiProvider;
        this._librariesProvider = {} as Providers.ModelLibrariesProvider;
        this._logsSink = {} as Nanoautomata.ExecutionLogsSink;
        this._instanceId = generateId(18);
        this._counters = {
            termination: {},
            annotate: {},
            errors: {}
        };
    }
    

    static create(modelProvider: Providers.ModelProvider, apiProvider: Providers.ModelApiProvider, librariesProvider: Providers.ModelLibrariesProvider,  instanceId: string, executionLogsSink: Nanoautomata.ExecutionLogsSink,  logger: Nanoautomata.Logger){                
        const manager = new Automata();  
        manager._instanceId = instanceId;
        manager._modelProvider = modelProvider;  
        manager._logger = logger || console;
        manager._apiProvider = apiProvider;
        manager._librariesProvider = librariesProvider;
        manager._logsSink = executionLogsSink;
        return manager;
    }

    /**
     * Will filter provided model variant to only ones that match mode (environemnt), have a positive sampling ration, marches api channel (when provided on model) 
     * and optionally match against model events filter
     * @param { Models.ModelVariant[]} modelVariants initial model variants
     * @param {API.Message} message target message
     * @param {Nanoautomata.ProcessingModes} mode "runtime" or "test"
     * @returns 
     */
    _filterVariants(modelVariants: Models.ModelVariant[], message: API.Message, mode:Nanoautomata.ProcessingModes = Nanoautomata.ProcessingModes.runtime){
        let result = modelVariants;
        // select variants matching mode "runtime" or "test"
        result = result.filter(item=>item.variant.mode == mode)
        // make sure the sampling ration is positive or is not provided (in such case we assume it's 1)
        result = result.filter(item=>Number.isNaN(item.variant.ratio)?true:item.variant.ratio>0)
        // filter by channel configured on model vs channel which captured the message
        result = result.filter(item=>message.ctx.a&&item.variant.channels?.length>0?item.variant.channels.includes(message.ctx.a):true)
        // when model is limited to certain event codes, select only models matching
        result = result.filter(item=>item.variant.events?.length>0?matchAnyPattern(message.c, item.variant.events, true):true)

        return result;
    }
    

    /**
     * Generic code to handle and process incoming message
     * @param {API.Message} message message to process
     * @param {string} originator originator name
     * @param {string} user originator id
     * @returns 
     */
    async process(message: API.Message, originator: string, user: string, safeConfig?: any){
        // const timer = new Stopwatch("handleMessage", true);
        if(!message.c) throw new Error(`Message code is required`);
        if(!message.ctx){
            message.ctx = {
                i: `${Math.random().toString(16).substring(2,16)}`,
                a: originator,                
            } as API.Context
        }
        if(message.ctx){
            message.ctx.ax = [],
            message.ctx.p = []
        }

        if(!message.u){
            message.u = {
                id: user,
                tenantId: originator
            }
        }
        if(!message.d){
            message.d = {    // debugging flaggs
                e: false,
                s: 0.01
            }
        }            

        this._logger.log(`Processing ${message.c} ${message.ctx.i}@${message.ctx?.a} from ${originator}`); 
        // const timer = new Stopwatch("handleMessage", true);
        ProcessorAnnotator.annotate(message, this._instanceId, Date.now());
        // get models info (without the code)
        const models = await this._modelProvider.getModelsInfo(message.u?.tenantId, message.u.id);

        const modelVariants:Models.ModelVariant[] = models.flatMap((item:Models.ModelInfo)=>{
            const items:Models.ModelVariant[] = [];            
            Object.keys(item.variants).forEach((key,_index)=>{
                const item2 = item.variants[key];
                const copy:Models.ModelVariant = JSON.parse(JSON.stringify(item));
                copy.variant = item2;
                items.push(copy)
            });            
            return items;
        })

        // possible annotations from all model variants (prod & test)
        const annotations:API.Annotation[] = []

        // first we start with runtime/production models/variants and also match channel
        // we check sampling
        // and we also check if event filtering is enabled on model
        // const runtimeVariants = modelVariants.filter(item=>item.variant.mode == "runtime" && item.variant.ratio>0 && item.variant.channels.includes(message.ctx.a) && (!item.variant.events || item.variant.events.trim().length==0||item.variant.events.includes(message.c)));
        const runtimeVariants = this._filterVariants(modelVariants, message, Nanoautomata.ProcessingModes.runtime);
        
        this._logger.log(`Qualified ${runtimeVariants.length} runtime vatiants to run for ${message.c} ${message.ctx.i}.`)

        await this._executeVariants(runtimeVariants, message, annotations, safeConfig);

        
        
        // handle test models/variants
        if(process.env.RUNTIME_MODEL_TESTING_ENABLED){            
            // const testVariants = modelVariants.filter(item=>item.variant.mode == "test" && item.variant.ratio>0 && item.variant.channels.includes(message.ctx.a) && (item.variant.events?.trim().length==0||item.variant.events.includes(message.c)));
            const testVariants = this._filterVariants(modelVariants, message, Nanoautomata.ProcessingModes.test);
            await this._executeVariants(testVariants, message, annotations, safeConfig);            
        }            
        ProcessorAnnotator.annotate(message, this._instanceId, undefined, Date.now());

        // if there are annotations added by any of the model variants send annotated message to streams
        message.ctx.ax = annotations || []                      
        this._logger.info(`Added ${annotations.length} annotations to message ${message.ctx.i} as a result of models' processing.`);        
        return message;
    }
    
    async _executeVariants(variants: Models.ModelVariant[], message: API.Message, annotations: API.Annotation[], safeConfig?: any){
        const promises = []
        for(let i=0; i< variants.length; i++){
            const variant = variants[i];            
                // todo sample message using vartiant ratio
                const random = Math.floor(Math.random() * 100);
                if(random<=variant.variant.ratio){
                    promises.push(this._executeModel(variant, message, safeConfig));                    
                }                                            
        }   
        
        const resultsFromVariantsExecution = await Promise.allSettled(promises);

        // reason value holds annotations array generated by model variant
        const succeed = resultsFromVariantsExecution.filter(result => result.status === "fulfilled").map(result => (<PromiseFulfilledResult<API.Annotation[]>>result).value);
        // in reason we have a message and model variant that failed
        const failed = resultsFromVariantsExecution.filter(result => result.status === "rejected").map(result => {return { reason: (result as PromiseRejectedResult).reason as Models.ProcessingFail}});        
        failed.forEach(fail=>{
            this._logger.warn(`Model variant ${fail.reason.model} failed with ${fail.reason.message} for message ${message.ctx.i}`);
        })

        // each variant execution result is a potential array of annotations returned from variant processing
        succeed.forEach(annotationsFromModel=>annotations.push(...annotationsFromModel))
                                         
    }

    /**
     * Executes model logic agains provided message. 
     * @param {*} modelVariant model variant to execute
     * @param {*} message target message
     * @returns array annotations (if model has added any annotations during processing)
     */
    async _executeModel(modelVariant: Models.ModelVariant, message: API.Message, safeConfig?: any):Promise<API.Annotation[]>{
        const timer = new Stopwatch("_executeModel", true);
        // load model code
        const modelData = await this._modelProvider.getModelVariant(modelVariant.id, modelVariant.variant.variant, message.u?.tenantId, message.u?.id);
        
        const code = modelData.code;
        if(!code) throw new Error(`Tried to execute model variant ${modelVersionFormatter(modelVariant.id, modelVariant.variant.variant)} with missing code`);
        // make a copy of original message
        const messageCopy:API.Message = JSON.parse(JSON.stringify(message));
        // prepare context for model processing
        const model:Models.ExecutionModel = {
            name: modelVariant.id,
            version: modelVariant.variant.variant,
            config: safeConfig,
            // toString: ()=>{return `${modelVariant.id}@v${modelVariant.variant.variant}`},            
            message: messageCopy,
            api: await this._apiProvider.getApi(),
            libs: await this._librariesProvider.getLibraries(),
            logs: [] // used when debugging mode is enabled and captures model execution logs
        }
        try{
            const result = await this._executeScript(model, code, {version: `${modelVersionFormatter(modelVariant.id, modelVariant.variant.variant)}`, profileId: messageCopy.u!.id!, tenantId: messageCopy.u!.tenantId!});        
            this._logger.log(`Model ${modelVersionFormatter(modelVariant.id, modelVariant.variant.variant)} [${modelVariant.variant.mode}] for event ${message.ctx.i} executed with termination result ${result.termination.code}. Took ${timer.stop()} ms.`);

            // send model execution logs (if any)            
            this._logsSink?.consume(model.logs)            

                                  
            const modelVersionString = modelVersionFormatter(model.name, model.version);
            
            // annotate original message
            let annotations:API.Annotation[] = [];            
            if(result&&result.annotate){
                annotations = this._prepareAnnotations(modelVersionString, result.annotate, modelVariant.variant.mode);
            }      

            return annotations;                                
        }catch(error:any){
            
            // append model execution logs (if any) to message context
            this._logsSink?.consume(model.logs);
            throw new ModelError(`Model ${modelVersionFormatter(modelVariant.id, modelVariant.variant.variant)} [${modelVariant.variant.mode}] for event ${message.c} ${message.ctx.i} executed abnormally with error: "${error.message}". Took ${timer.stop()} ms.`,modelVersionFormatter(modelVariant.id, modelVariant.variant.variant));            
        }          
    }

    /**
     * Transforms annotation object to array of annotations with proper structure
     * @param {*} modelVersion 
     * @param {*} annotationsFromModel object where each property is an annotation code, and annotation value is in "v" property
     * @returns array of annotation items {c, v, m}
     */
    _prepareAnnotations(modelVersion: string, annotationsFromModel:any, mode: Nanoautomata.ProcessingModes){
        // make sure empty annotations are not added
        if(Object.keys(annotationsFromModel).length == 0) return [];

        const annotationsArray:API.Annotation[] = [];
        // add model version to each annotation and convert annotations holder object to an array of annotation items
        Object.keys(annotationsFromModel).forEach((key)=>{
            // here we want to have a similar structure to raise messages, so we want to have c- annotation code, m - model, v - annotation value            
            const annotation = annotationsFromModel[key];
            const annotationItem = {
                c: key.replace(":","_"),
                v: annotation.v,
                m: modelVersion,
                t: "a", // "a" for annotation type
                e: mode // "e" for execution mode - runtime or test
            }
            // annotation["c"] = key.replace(":","_");
            // annotation["m"] = modelVersion;       
            // // v - value is provided by model execution  
            annotationsArray.push(annotationItem)   
        })
                
        return annotationsArray;            
    }

    async _executeScript(model: Models.ExecutionModel, script: string, info: {version: string, profileId: string, tenantId: string}):Promise<Models.ModelExecutionResult>{
                
        const codeWrapper = `
        async function wrapper(){  
            const __result = {
                termination: {},
                raise: {},
                annotate: {},
                logs: []
            }
            
            
            model.annotate = (code, value)=>{
                __result.annotate[code] = {
                    v: value
                }
            }
            model.raise = (code, value)=>{
                __result.raise[code] = {
                    v: value                    
                };
            }            
            model.terminate = (code, reason)=>{
                if(!code) code = "SUCCESS";                    
                __result.termination = {
                    code: code,
                    reason: reason
                }
                return __result;
            }
            ${process.env.RUNTIME_MODEL_DISABLE_CONSOLE==="true"?`console = {
                log: ()=>{},
                warn: ()=>{},
                error: ()=>{},
                trace: ()=>{},
                debug: ()=>{}
            }`:''}                  
            try{                
                ${script}                
                return model.terminate();
            }catch(error){
                console.error("Error while executing model: ", error.stack);
                return model.terminate("ERROR", error.message);
            }
        }        
        return wrapper();      
        `        
        const consoleMode = this._logsSink?'redirect':'inherit';        
        const vm = new NodeVM({
            console: consoleMode,
            // todo make it also possible to redirect to events and show in gui 
            // console: 'redirect',
            // vm.on('console.log', (data) => {}), console.warn...
            sandbox: {model: model},
            wrapper: 'none'
        });
        
        const executionLogs:any[] = [];
        try{
            const formatLog = (...input:any[]) => {
                const formatted:string = input.map((arg:any) => {
                    if (typeof arg === 'object' && arg !== null) {
                        // For objects, stringify with minimal formatting
                        return Array.isArray(arg) 
                            ? `[${arg.map((item:any) => formatLog(item)).join(', ')}]` 
                            : `{${Object.entries(arg).map(([key, value]) => `${key}: ${formatLog(value)}`).join(', ')}}`;
                    } else if (typeof arg === 'undefined') {
                        return 'undefined';
                    } else {
                        // Convert other types to strings
                        return String(arg);
                    }
                }).join(' ');
                return formatted;
            }
            const logHander = (...data:any[])=>{    
                this._logger.log(...data);                
                // const when = new Date();

                // const logFormatted = formatLog(`${when} [${when.getTime()}] `, ...data);
                // [${model.name}@${model.version}] it's important as this is used later on to filter logs by model so change sparigly
                const now = Date.now();
                const logFormatted = formatLog(...data);
                const logObject = {                        
                    t: now, // timestamp
                    s: modelVersionFormatter(model.name, model.version), // source
                    m: logFormatted // message

                }
                this._logsSink&&executionLogs.push(logObject);                    
            }
    
            vm.on('console.log', logHander);
            vm.on('console.info', logHander);
            vm.on('console.warn', logHander);
            vm.on('console.error', logHander);
            vm.on('console.trace', logHander);
                        
            const vmResult = await vm.run(codeWrapper) as Models.ModelExecutionResult;   
            // optionally we add log output to result
            // following conditions must be met to capture execution logs
            // 1. model.message.d.e MUST be set to true
            // 2. model.message.d.s if set MUST be greater than 0            
            // 3. env variable CAPTURE_LOGS must be set to true

            if( 
                this._logsSink
                && model.message.d && model.message.d.e       
                && executionLogs.length > 0
            ){
                let sampling = model.message.d.s>0?Math.min(model.message.d.s,1):1;
                if(Math.random()<=sampling){
                    // this._logger.log(`Added logs for message ${model.message.ctx.i} model ${model.name}@${model.version} with size ${executionLogs.length}`);
                    model.logs.push(...executionLogs);
                } 
            }
            this._incrementCounter(vmResult);
            return vmResult;
        }catch(error: any){
            this._logger.error(`Error "${error.message}" executing model ${info.version} for message ${model.message.ctx.i}`, error.stack);
            // when there was an error we add execution logs regardless of debug settings of message
            model.logs.push(...executionLogs);
            this._incrementCounter(undefined, error);
            return Promise.reject(error);
        }finally{
            // context.currentScript = {}             
        }                
    }

    _incrementCounter(result?: Models.ModelExecutionResult, error?: Error,){
        if(error){
            this._counters!.errors[error.message] = this._counters!.errors[error.message] || new IntervalCounters();
            this._counters!.errors[error.message].record(1);
        }
        if(result){
            const code = result.termination.code;
            this._counters!.termination[code] = this._counters!.termination[code] || new IntervalCounters();
            this._counters!.termination[code].record(1);   
            
            // for each annotation raised we also increment counters
            if(result.annotate){
                Object.keys(result.annotate).forEach((key)=>{
                    this._counters!.annotate[key] = this._counters!.annotate[key] || new IntervalCounters();
                    this._counters!.annotate[key].record(1);   
                })                
            }
        }
    }

    getCounters(){
        return JSON.parse(JSON.stringify(this._counters));
    }
}