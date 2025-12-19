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

})

