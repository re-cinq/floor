// Replay a greeting visit locally to see what Floor would do next.
import { getNextTransition, type NodeVisit } from "@re-cinq/floor-assembly-lines";
import { graph, problems } from "./hello.mts";

console.log("Validation problems:", problems);
const visit: NodeVisit = { nodeId: "greet", iteration: 1, outcome: null };

// The first argument describes the route; the second is the ordered visit history. https://re-cinq.github.io/floor/sdk/assembly-lines/#nodevisit
console.log("Before any visit:", getNextTransition(graph, []).kind);
console.log("While greet is open:", getNextTransition(graph, [visit]).kind);
console.log("After success:", getNextTransition(graph, [{ ...visit, outcome: "success" }]).kind);
console.log("After failure:", getNextTransition(graph, [{ ...visit, outcome: "failed" }]).kind);
