import {
    CodeBlockGenerator,
    CodeGenerator,
    Start
} from "../src/model-generator";
import { Visuals } from "../src/model/code";

const cell = (overrides: Partial<Visuals.Cell>): Visuals.Cell => ({
    id: "id",
    _type: "Start",
    name: "Start",
    configurables: [],
    _portConnections: [],
    ...overrides
});

describe("Code generation",()=>{
    describe("CodeBlockGenerator helpers", () => {
        it("matches generator names while ignoring whitespace", () => {
            const startCell = cell({ _type: "Start   " });

            expect(Start.canHandle(startCell)).toBe(true);
        });

        it("transforms configurables array into a map", () => {
            const startCell = cell({
                configurables: [
                    { i: "script", v: "doSomething();" },
                    { i: "reason", v: "\"done\"" }
                ]
            });

            const mapped = (CodeBlockGenerator as any)._getConfigurables(startCell);

            expect(mapped).toEqual({ script: "doSomething();", reason: "\"done\"" });
        });
    });

    describe("CodeGenerator.generateCode", () => {
        it("throws when there is no Start cell", async () => {
            const diagram: Visuals.Diagram = {
                cells: [cell({ id: "rule", _type: "Rule", name: "Rule" })]
            };

            await expect(
                CodeGenerator.generateCode(diagram, "model-id", "v1")
            ).rejects.toThrow("Model model-id@vv1 is missing Start cell");
        });

    it("builds sequential code from Start through Terminator", async () => {
        const diagram: Visuals.Diagram = {
            cells: [
                cell({
                    id: "start",
                        _type: "Start",
                        name: "Start",
                        _portConnections: [{ id: "rule", port: "out1" }]
                    }),
                    cell({
                        id: "rule",
                        _type: "Rule",
                        name: "Rule",
                        configurables: [{ i: "script", v: "model.count = 1;" }],
                        _portConnections: [{ id: "end", port: "out1" }]
                    }),
                    cell({
                        id: "end",
                        _type: "Terminator",
                        name: "End",
                        configurables: [{ i: "reason", v: "\"all good\"" }]
                    })
                ]
            };

            const code = await CodeGenerator.generateCode(diagram, "model", "1.0");
            const normalized = code.replace(/\s+/g, " ");

            expect(code).toContain('Processing Step "Start"');
            expect(code).toContain('Processing Step "Rule"');
            expect(normalized).toContain("model.count = 1;");
        expect(normalized).toContain(
            "return model.terminate(undefined, \"all good\");"
        );
    });

    it("exposes shared ctx object across generated blocks", async () => {
        const diagram: Visuals.Diagram = {
            cells: [
                cell({
                    id: "start",
                    _type: "Start",
                    name: "Start",
                    _portConnections: [{ id: "rule1", port: "out1" }]
                }),
                cell({
                    id: "rule1",
                    _type: "Rule",
                    name: "Rule",
                    configurables: [
                        { i: "script", v: "ctx.value = (ctx.value || 0) + 1;" }
                    ],
                    _portConnections: [{ id: "rule2", port: "out1" }]
                }),
                cell({
                    id: "rule2",
                    _type: "Rule",
                    name: "Rule 2",
                    configurables: [
                        {
                            i: "script",
                            v: "model.captured = (ctx.value || 0) + 5;"
                        }
                    ],
                    _portConnections: [{ id: "end", port: "out1" }]
                }),
                cell({
                    id: "end",
                    _type: "Terminator",
                    name: "End",
                    configurables: [{ i: "reason", v: "\"done\"" }]
                })
            ]
        };

        const code = await CodeGenerator.generateCode(diagram, "model", "1.0");
        expect(code).toContain("const ctx = {}");

        const runner = new Function(
            "model",
            "message",
            `return (async ()=>{${code}})();`
        );

        const model: any = { terminate: jest.fn() };
        await runner(model, {});

        expect(model.captured).toBe(6);
    });
});

describe("Decision branching", () => {
    it("embeds both branch paths in generated code", async () => {
        const diagram: Visuals.Diagram = {
                cells: [
                    cell({
                        id: "start",
                        _type: "Start",
                        name: "Start",
                        _portConnections: [{ id: "decision", port: "out1" }]
                    }),
                    cell({
                        id: "decision",
                        _type: "Decision",
                        name: "Decision",
                        configurables: [{ i: "condition", v: "ctx.flag" }],
                        _portConnections: [
                            { id: "log", port: "out1" },
                            { id: "raise", port: "out2" }
                        ]
                    }),
                    cell({
                        id: "log",
                        _type: "Log",
                        name: "Logger",
                        configurables: [
                            { i: "name", v: "\"branch\"" },
                            { i: "value", v: "\"first\"" }
                        ]
                    }),
                    cell({
                        id: "raise",
                        _type: "Raise",
                        name: "Error",
                        configurables: [
                            { i: "condition", v: "true" },
                            { i: "code", v: "\"ERR\"" },
                            { i: "raiseValue", v: "\"second\"" }
                        ]
                    })
                ]
            };

            const randomSpy = jest.spyOn(Math, "random").mockReturnValue(0.42);
            const code = await Start.traverseCode(
                diagram.cells[0],
                diagram.cells,
                CodeGenerator.Generators
            );
            randomSpy.mockRestore();

            const normalized = code.replace(/\s+/g, " ");

            expect(normalized).toContain("if(ctx.flag){");
            expect(normalized).toContain("console.log(\"first\")");
            expect(normalized).toContain("model.raise('\"ERR\"', \"second\");");
        });
    });

});

describe("Annotate code generation", () => {
    const diagramWithCondition = (condition: string): Visuals.Diagram => ({
        cells: [
            cell({
                id: "start",
                _type: "Start",
                name: "Start",
                _portConnections: [{ id: "annotate", port: "out1" }]
            }),
            cell({
                id: "annotate",
                _type: "Annotate",
                name: "Annotate",
                configurables: [
                    { i: "code", v: "TAG" },
                    { i: "annotationValue", v: "\"VALUE\"" },
                    { i: "condition", v: condition }
                ],
                _portConnections: [{ id: "end", port: "out1" }]
            }),
            cell({
                id: "end",
                _type: "Terminator",
                name: "End",
                configurables: [{ i: "reason", v: "\"done\"" }]
            })
        ]
    });

    const runDiagram = async (diagram: Visuals.Diagram) => {
        const code = await CodeGenerator.generateCode(diagram, "model", "1.0");
        const runner = new Function(
            "model",
            "message",
            `return (async ()=>{${code}})();`
        );
        const model = { annotate: jest.fn(), terminate: jest.fn() };
        await runner(model, {});
        return model;
    };

    it("invokes annotate when condition is truthy", async () => {
        const model = await runDiagram(diagramWithCondition("true"));

        expect(model.annotate).toHaveBeenCalledTimes(1);
        expect(model.annotate).toHaveBeenCalledWith("TAG", "VALUE");
    });

    it("skips annotate when condition is falsy", async () => {
        const model = await runDiagram(diagramWithCondition("false"));

        expect(model.annotate).not.toHaveBeenCalled();
    });

    it("defaults to annotate when condition content is empty", async () => {
        const model = await runDiagram(diagramWithCondition('""'));

        expect(model.annotate).toHaveBeenCalledTimes(1);
        expect(model.annotate).toHaveBeenCalledWith("TAG", "VALUE");
    });
});

describe("Raise code generation", () => {
    const diagramWithCondition = (condition: string): Visuals.Diagram => ({
        cells: [
            cell({
                id: "start",
                _type: "Start",
                name: "Start",
                _portConnections: [{ id: "raise", port: "out1" }]
            }),
            cell({
                id: "raise",
                _type: "Raise",
                name: "Raise",
                configurables: [
                    { i: "code", v: "ERR" },
                    { i: "raiseValue", v: "\"VALUE\"" },
                    { i: "condition", v: condition }
                ],
                _portConnections: [{ id: "end", port: "out1" }]
            }),
            cell({
                id: "end",
                _type: "Terminator",
                name: "End",
                configurables: [{ i: "reason", v: "\"done\"" }]
            })
        ]
    });

    const runDiagram = async (diagram: Visuals.Diagram) => {
        const code = await CodeGenerator.generateCode(diagram, "model", "1.0");
        const runner = new Function(
            "model",
            "message",
            `return (async ()=>{${code}})();`
        );
        const model = { raise: jest.fn(), terminate: jest.fn() };
        await runner(model, {});
        return model;
    };

    it("invokes raise when condition is truthy", async () => {
        const model = await runDiagram(diagramWithCondition("true"));

        expect(model.raise).toHaveBeenCalledTimes(1);
        expect(model.raise).toHaveBeenCalledWith("ERR", "VALUE");
    });

    it("skips raise when condition is falsy", async () => {
        const model = await runDiagram(diagramWithCondition("false"));

        expect(model.raise).not.toHaveBeenCalled();
    });

    it("defaults to raise when condition content is empty", async () => {
        const model = await runDiagram(diagramWithCondition('""'));

        expect(model.raise).toHaveBeenCalledTimes(1);
        expect(model.raise).toHaveBeenCalledWith("ERR", "VALUE");
    });
});
