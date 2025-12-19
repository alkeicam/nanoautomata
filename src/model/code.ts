export namespace Visuals {
    export interface Configurable{
        i: string,
        v: string
    }

    // this is a holder that represents all cell configurables as a key-value map
    export interface CellConfigurables{
        [key:string]: string
    }

    export interface Diagram{
        cells: Cell[],
        
    }

    export interface PortConnection{
        id: string,
        port: string,        
    }

    export interface Cell{
        id: string,
        _type: string | any,
        configurables: Configurable[],
        name: string,
        code?: string,
        _portConnections: PortConnection[], 

    }
}
export namespace Code {

}