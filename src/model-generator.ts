import { Visuals } from "./model/code";

class CodeBlockGenerator {       

    static canHandle(current: Visuals.Cell): boolean {
        return current._type.replaceAll(/\s+/g,"") == this.name;
    }

    static async traverseCode(current: Visuals.Cell, cells: Visuals.Cell[], generators:CodeBlockGenerator[]){
        let codeBlocks = "\n";
        const configurables = this._getConfigurables(current);
        codeBlocks += `// Processing Step "${current.name}" ${configurables.code||""} (type: ${current._type})\n`;
        codeBlocks += `console.log("Step ${current.name} (type: ${current._type})")\n`;                
        codeBlocks += await this._process(current, cells, configurables, generators);

        return codeBlocks;
    }

    static _code(_current: Visuals.Cell, _cells: Visuals.Cell[], _configurables: Visuals.CellConfigurables){
        throw new Error(`Must be implemented`);
    }

    /**
     * Default implementation, generates current cell code and then delegates to next cells
     * @param {*} current 
     * @param {*} cells 
     */
    static async _process(current: Visuals.Cell, cells: Visuals.Cell[], configurables: Visuals.CellConfigurables, generators: CodeBlockGenerator[]){
        let code = `

await (async (model, ctx)=>{        
        `;
        code += this._code(current, cells, configurables);
        code += `
})(model, ctx)
        `

        for(let i=0; i<current._portConnections.length; i++){
            const port = current._portConnections[i];
            if(port.port.startsWith("out")){
                const next = cells.find((item)=>{return item.id == port.id}) 
                const nextGenerator = generators.find(item=>(item as any).canHandle(next!));
                if(!nextGenerator) throw new Error(`Missing generator for ${next!._type}`);
                const result = await (nextGenerator as any).traverseCode(next, cells, generators);                
                code += result ;                
            }
        }

        return code;
    }

    static _getConfigurables(cell: Visuals.Cell){
        let result:Visuals.CellConfigurables = {}
        cell.configurables.forEach((item)=>{
            result[item.i] = item.v
        })
        return result;
    }

    static _safeVariable(name: string){
        return name.replace(/([^a-z0-9]+)/gi, 'a');
    }
    static _randVariable(prefix: string){
        const v = Math.random().toString(18).substring(2, 10);

        return `${prefix||"_v"}_${v}`;
    }
    static _getConfigurable(cell: Visuals.Cell, key: string){
        const result = cell.configurables.find((i)=>{return i.i==key})||{};
        return result;
    }
}

class Terminator extends CodeBlockGenerator {
    static _code(_current: Visuals.Cell, _cells: Visuals.Cell[], configurables: Visuals.CellConfigurables){
        return `
// terminate with success
return model.terminate(${!configurables.code?undefined:configurables.code}, ${configurables.reason});
`           
    }
}

class Start extends CodeBlockGenerator {
    static _code(_current: Visuals.Cell, _cells: Visuals.Cell[], _configurables: Visuals.CellConfigurables){
        return `
`  
    }
}
class Rule extends CodeBlockGenerator{
    static _code(_current: Visuals.Cell, _cells: Visuals.Cell[], configurables: Visuals.CellConfigurables){
    return `
${configurables.script}
`
    }
}
class Annotate extends CodeBlockGenerator{
    static _code(_current: Visuals.Cell, _cells: Visuals.Cell[], configurables: Visuals.CellConfigurables){
        let temp1 = CodeGenerator._randVariable();
        return `
let ${temp1} = ${configurables.condition};

if(typeof ${temp1} == "boolean" || (typeof ${temp1} !== "undefined" && ${temp1}!="")){
            // On Condition is provided so check
            if(${temp1}) model.annotate('${configurables.code}', ${configurables.annotationValue});

}else{
    model.annotate('${configurables.code}', ${configurables.annotationValue});
}
`
    }
}

class ProfileRead extends CodeBlockGenerator{
    static _code(_current: Visuals.Cell, _cells: Visuals.Cell[], configurables: Visuals.CellConfigurables){
    let varName = CodeGenerator._randVariable();
    return `
        let ${varName};
${varName} = await model.api.getProfile(${configurables.propertyName});
${configurables.variableName} = undefined;
if(${varName}) ${configurables.variableName} = ${varName};
        `

    }
}
class ProfileWrite extends CodeBlockGenerator{
    static _code(_current: Visuals.Cell, _cells: Visuals.Cell[], configurables: Visuals.CellConfigurables){
        return `
        await model.api.setProfile(${configurables.propertyName},${configurables.value});            
        `

    }
}

class ListRead extends CodeBlockGenerator{
    static _code(_current: Visuals.Cell, _cells: Visuals.Cell[], configurables: Visuals.CellConfigurables){
        const varName = CodeGenerator._randVariable();
        const readConfiguration = CodeGenerator._randVariable();
        return `
            const ${readConfiguration} = model.message?.p?.mode ? {
                isFuzzy: model.message.p.mode === 'fuzzy',
                broadSearch: model.message?.p?.broadSearch !== 'false',
                minSimilarity: parseInt(model.message?.p?.minSimilarity) || undefined
            } : {
                isFuzzy: ${configurables.mode === 'fuzzy'},
                broadSearch: ${configurables.broadSearch},
                minSimilarity: ${parseInt(configurables.minSimilarity) || undefined}
            }
            const ${varName} = await model.api.getListItem(${configurables.listCode},${configurables.itemKey},${readConfiguration}.isFuzzy,${readConfiguration}.broadSearch,${readConfiguration}.minSimilarity);
            ${configurables.variableName} = undefined;
            if(${varName}) ${configurables.variableName} = ${varName};
            `
    }
}

class ListWrite extends CodeBlockGenerator{
    static _code(_current: Visuals.Cell, _cells: Visuals.Cell[], configurables: Visuals.CellConfigurables){
        return `
        await model.api.setListItem(${configurables.listCode},${configurables.itemKey},${configurables.value});            
        `

    }
}

class APICall extends CodeBlockGenerator{
    static _code(_current: Visuals.Cell, _cells: Visuals.Cell[], _configurables: Visuals.CellConfigurables){
        return `
                   
        `

    }
}

class OCR extends CodeBlockGenerator{
    static _code(_current: Visuals.Cell, _cells: Visuals.Cell[], _configurables: Visuals.CellConfigurables){
        return `
                   
        `

    }
}

class AIImageQuery extends CodeBlockGenerator{
    static _code(_current: Visuals.Cell, _cells: Visuals.Cell[], _configurables: Visuals.CellConfigurables){
        return `
                   
        `

    }
}
class ExecuteModel extends CodeBlockGenerator{
    static _code(_current: Visuals.Cell, _cells: Visuals.Cell[], _configurables: Visuals.CellConfigurables){
        return `
                   
        `

    }
}

class Raise extends CodeBlockGenerator{
    static _code(_current: Visuals.Cell, _cells: Visuals.Cell[], configurables: Visuals.CellConfigurables){
        let temp1 = CodeGenerator._randVariable();
        return `
let ${temp1} = ${configurables.condition};

if(typeof ${temp1} == "boolean" || (typeof ${temp1} !== "undefined" && ${temp1}!="")){
            // On Condition is provided so check
            if(${temp1}) model.raise('${configurables.code}', ${configurables.raiseValue});

}else{
    model.raise('${configurables.code}', ${configurables.raiseValue});
}
`
    }
}

class Decision extends CodeBlockGenerator{    
    static async _process(current: Visuals.Cell, cells: Visuals.Cell[], configurables: Visuals.CellConfigurables, generators: CodeBlockGenerator[]){
        // enter out1 path
        let port = current._portConnections.find(item=>item.port=="out1");
        let next = cells.find((item)=>{return item.id == port!.id});
        let nextGenerator = generators.find(item=>(item as any).canHandle(next));
        if(!nextGenerator) throw new Error(`Missing generator for ${next!._type}`);
        let path1 = await (nextGenerator as any).traverseCode(next, cells, generators);
        
        // enter out2 path
        port = current._portConnections.find(item=>item.port=="out2");
        next = cells.find((item)=>{return item.id == port!.id});
        nextGenerator = generators.find(item=>(item as any).canHandle(next));
        if(!nextGenerator) throw new Error(`Missing generator for ${next!._type}`);
        let path2 = await (nextGenerator as any).traverseCode(next, cells, generators);
        
        
        let code = `
if(${configurables.condition}){
    ${path1}
}else{
    ${path2}
}                
        `;
        
        return code;
    }
}
class Log extends CodeBlockGenerator{
    static _code(_current: Visuals.Cell, _cells: Visuals.Cell[], configurables: Visuals.CellConfigurables){
    return `
// ${configurables.name}
console.log(${configurables.value});
`
    }
}

class CodeGenerator {
    static Generators: (typeof CodeBlockGenerator)[] = [
        Terminator,
        Start,
        Rule,
        Annotate,
        ProfileRead,
        ProfileWrite,
        ListRead,
        ListWrite,
        APICall,
        OCR,
        AIImageQuery,
        ExecuteModel,
        Raise,
        Decision,
        Log
    ] 

    static async generateCode(diagram:Visuals.Diagram, modelId: string, modelVersion: string){
        const startCell = diagram.cells.find((item)=>{
            return item._type == 'Start'
        })
        
        if(!startCell) throw new Error(`Model ${modelId}@v${modelVersion} is missing Start cell`);
                
        let codeBlocks = "";
        codeBlocks += `// code generated at ${Date.now()} from ${modelId}@v${modelVersion}\n`;

        codeBlocks += `
        
// this is a shared context object to which all steps can read and write data between steps
const ctx = {}
        
        `
                
        // codeBlocks.push(`console.log(\`Processing  \${message.c} captured at \${message.ctx.a} by ${modelId}@v${modelVersion}\`)`)
        codeBlocks += await Start.traverseCode(startCell, diagram.cells, CodeGenerator.Generators);      
                
        return codeBlocks;
    }

    static _randVariable(prefix?:string){
        const v = Math.random().toString(18).substring(2, 10);

        return `${prefix||"_v"}_${v}`;
    }
}

export {
    CodeBlockGenerator,
    Terminator,
    Start,
    Rule,
    Annotate,
    ProfileRead,
    ProfileWrite,
    ListRead,
    ListWrite,
    APICall,
    OCR,
    AIImageQuery,
    ExecuteModel,
    Raise,
    Decision,
    Log,
    CodeGenerator
}
