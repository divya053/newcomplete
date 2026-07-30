// The ONLY import surface for this bounded context. Other code imports from here,
// never from internal files (keeps contexts decoupled — guardrail #8).
export { publishExample } from "./use-cases/example-publish";
export { PublishExampleInput, type ExampleEntity } from "./model";
