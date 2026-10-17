import { Compiler } from "inkjs/compiler/Compiler";
import { Beat, StoryRun } from "./engine";

export type Problem = {
    severity: "error" | "warning";
    line: number | null; // 1-based line in the .ink source; null for compiled JSON or whole-story problems
    message: string;
};

export type ValidationResult = {
    ok: boolean;          // no errors; warnings are allowed
    json: string | null;  // compiled story, when it compiles
    title: string | null;
    decisions: number;    // choices made on the longest path
    paths: number;        // distinct playthroughs
    endings: string[];    // `# ending:` titles reached, sorted
    problems: Problem[];
};

// The SPEC.md authoring conventions
export const LIMITS = {
    minChoices: 2,
    maxChoices: 4,
    maxLabelLength: 40,
    maxBeatLength: 700,
    minDecisions: 3,
    maxDecisions: 6,
    neverEndsDecisions: 30,
    maxPaths: 5000,
};

const LOOSE_END = "Apparent loose end";
const DEAD_END_MESSAGE = "Dead end: the story runs out here without reaching an ending or -> END.";

function parseCompilerMessage(message: string, severity: Problem["severity"]): Problem {
    const match = message.match(/^(?:ERROR|WARNING|TODO):\s*(?:line (\d+):\s*)?([\s\S]*)$/);
    const line = match && match[1] ? Number(match[1]) : null;
    const text = match ? match[2] : message;

    if (text.includes(LOOSE_END))
        return { severity: "error", line, message: DEAD_END_MESSAGE };

    return { severity, line, message: text };
}

export function compileInk(source: string) {
    const compiler = new Compiler(source);
    let json: string | null = null;

    try {
        json = compiler.Compile().ToJson() || null;
    } catch {
        // compiler.errors holds the details
    }

    const problems = [
        ...compiler.errors.map(message => parseCompilerMessage(message, "error")),
        ...compiler.warnings.map(message => parseCompilerMessage(message, "warning")),
    ];
    const errors = problems.filter(problem => problem.severity === "error");
    const warnings = problems.filter(problem => problem.severity === "warning");

    return { json: errors.length === 0 ? json : null, errors, warnings };
}

// Maps runtime locations back to .ink source lines, when there is a source
class SourceMap {
    private readonly lines: string[];

    constructor(source: string | null) {
        this.lines = source ? source.split(/\r?\n/) : [];
    }

    knotLine(knot: string | null) {
        if (!knot) return null;
        const header = new RegExp(`^\\s*={2,}\\s*(?:function\\s+)?${knot}\\b`);
        const index = this.lines.findIndex(line => header.test(line));
        return index === -1 ? null : index + 1;
    }

    choiceLine(knot: string | null, label: string) {
        const start = (this.knotLine(knot) ?? 1) - 1;
        for (let index = start; index < this.lines.length; index++) {
            if (/^\s*[*+]/.test(this.lines[index]) && this.lines[index].includes(label))
                return index + 1;
        }
        return this.knotLine(knot);
    }

    // Choices written without [brackets] repeat their label as story text
    unbracketedChoices(): Problem[] {
        const problems: Problem[] = [];
        this.lines.forEach((line, index) => {
            const choice = line.match(/^\s*(?:[*+]\s*)+(.*)$/);
            if (!choice) return;

            let rest = choice[1].trim();
            while (/^(\([^)]*\)|\{[^}]*\})/.test(rest))
                rest = rest.replace(/^(\([^)]*\)|\{[^}]*\})\s*/, "");

            if (rest && !rest.startsWith("[") && !rest.startsWith("->"))
                problems.push({
                    severity: "warning",
                    line: index + 1,
                    message: "Choice text isn't in [brackets], so Ink will repeat it as story text.",
                });
        });
        return problems;
    }
}

function knotOf(choicePath: string | undefined) {
    if (!choicePath) return null;
    const first = choicePath.split(".")[0];
    return /^\d+$/.test(first) ? null : first;
}

function plural(count: number, word: string) {
    return `${count} ${word}${count === 1 ? "" : "s"}`;
}

// Plays every path through the story, checking each beat against LIMITS
function explore(json: string, source: string | null) {
    const map = new SourceMap(source);
    const problems: Problem[] = [];
    const endings = new Set<string>();
    let paths = 0;
    let shortest = Infinity;
    let longest = 0;
    let stopped = false;

    let run: StoryRun;
    try {
        run = StoryRun.start(json);
    } catch (err) {
        problems.push({ severity: "error", line: null, message: `Not a compiled Ink story: ${(err as Error).message}` });
        return { title: null, paths, decisions: 0, endings: [], problems };
    }

    const title = run.title;
    if (!title)
        problems.push({ severity: "warning", line: null, message: "The story has no `# title:` tag at the top." });

    const visit = (beat: Beat, path: string[], errorsBefore: number) => {
        if (stopped) return;

        const newErrors = run.errors.slice(errorsBefore);
        newErrors.forEach(message => {
            // A compiled .ink with a loose end is rejected before this; compiled JSON can still have one
            if (message.includes("ran out of content"))
                problems.push({ severity: "error", line: null, message: `${DEAD_END_MESSAGE} (after ${path.join(" → ") || "the start"})` });
            else
                problems.push({ severity: "error", line: null, message });
        });

        const knot = knotOf(run.currentChoicePaths()[0]);

        if (beat.text.length > LIMITS.maxBeatLength)
            problems.push({
                severity: "warning",
                line: map.knotLine(knot),
                message: `Beat is ${beat.text.length} characters; keep it under ${LIMITS.maxBeatLength} so it fits one phone screen.`,
            });

        if (beat.ended) {
            paths++;
            shortest = Math.min(shortest, path.length);
            longest = Math.max(longest, path.length);

            if (beat.endingTitle)
                endings.add(beat.endingTitle);
            else if (newErrors.length === 0)
                problems.push({ severity: "warning", line: null, message: "An ending has no `# ending:` tag, so the recap can't name it." });

            if (paths >= LIMITS.maxPaths) {
                problems.push({ severity: "error", line: null, message: `The story has too many paths to check (over ${LIMITS.maxPaths}).` });
                stopped = true;
            }
            return;
        }

        const count = beat.choices.length;
        if (count < LIMITS.minChoices || count > LIMITS.maxChoices)
            problems.push({
                severity: "error",
                line: map.knotLine(knot),
                message: `This beat offers ${plural(count, "choice")}; use ${LIMITS.minChoices} to ${LIMITS.maxChoices}.`,
            });

        beat.choices.forEach(label => {
            if (label.length > LIMITS.maxLabelLength)
                problems.push({
                    severity: "warning",
                    line: map.choiceLine(knot, label),
                    message: `Choice "${label}" is ${label.length} characters; keep labels under ${LIMITS.maxLabelLength}.`,
                });
        });

        if (path.length >= LIMITS.neverEndsDecisions) {
            problems.push({ severity: "error", line: null, message: `The story never ends: a path goes past ${LIMITS.neverEndsDecisions} decisions.` });
            stopped = true;
            return;
        }

        const here = run.saveState();
        beat.choices.forEach((label, index) => {
            if (stopped) return;
            run.loadState(here);
            const errorsBeforeChoice = run.errors.length;
            visit(run.choose(index), [...path, label], errorsBeforeChoice);
        });
    };

    visit(run.continue(), [], 0);

    if (paths > 0 && shortest < LIMITS.minDecisions)
        problems.push({
            severity: "warning",
            line: null,
            message: `The shortest path has ${plural(shortest, "decision")}; stories work best with ${LIMITS.minDecisions} to ${LIMITS.maxDecisions}.`,
        });
    if (longest > LIMITS.maxDecisions && !stopped)
        problems.push({
            severity: "warning",
            line: null,
            message: `The longest path has ${plural(longest, "decision")}; stories work best with ${LIMITS.minDecisions} to ${LIMITS.maxDecisions}.`,
        });

    return { title, paths, decisions: longest, endings: [...endings].sort(), problems };
}

// A beat reached on many paths reports its problem once
function dedupe(problems: Problem[]) {
    const seen = new Set<string>();
    return problems.filter(problem => {
        const key = `${problem.severity}|${problem.line}|${problem.message}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function result(json: string | null, explored: ReturnType<typeof explore> | null, problems: Problem[]): ValidationResult {
    const all = dedupe(problems);
    return {
        ok: !all.some(problem => problem.severity === "error"),
        json,
        title: explored ? explored.title : null,
        decisions: explored ? explored.decisions : 0,
        paths: explored ? explored.paths : 0,
        endings: explored ? explored.endings : [],
        problems: all,
    };
}

export function validateInk(source: string): ValidationResult {
    const compiled = compileInk(source);
    const map = new SourceMap(source);
    const sourceProblems = [...compiled.errors, ...compiled.warnings, ...map.unbracketedChoices()];

    if (!compiled.json)
        return result(null, null, sourceProblems);

    const explored = explore(compiled.json, source);

    return result(compiled.json, explored, [...sourceProblems, ...explored.problems]);
}

export function validateStoryJson(json: string): ValidationResult {
    const explored = explore(json, null);
    const ok = !explored.problems.some(problem => problem.severity === "error");

    return result(ok ? json : null, explored, explored.problems);
}
