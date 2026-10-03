// Licensed under the MIT license.

import * as path from "path";
import { IProblem } from "../shared";

export interface IPlanProblem {
    order: number;
    title: string;
    kind: "leetcode" | "custom";
    leetcodeId?: number | null;
    difficulty?: string;
    paidOnly?: boolean;
    previousDays?: number[];
    solutionPath?: string;
    note?: string;
    sourceUrl?: string;
}

export interface IPlanDay {
    day: number;
    title: string;
    sourceUrl?: string;
    algorithmSourceUrl?: string;
    problems: IPlanProblem[];
}

export interface IDailyPlan { days: IPlanDay[]; }
export interface IProgressEntry { done: boolean; offset: number; }

export function validatePlan(plan: IDailyPlan): IDailyPlan {
    if (!plan || !Array.isArray(plan.days)) throw new Error("A study plan must contain a days array.");
    const dayNumbers = new Set<number>();
    for (const day of plan.days) {
        if (!day || !Number.isInteger(day.day) || day.day < 1 || dayNumbers.has(day.day) || typeof day.title !== "string" || !Array.isArray(day.problems)) {
            throw new Error("Invalid group number, title, or problem list.");
        }
        dayNumbers.add(day.day);
        validateSource(day.sourceUrl);
        validateSource(day.algorithmSourceUrl);
        const orders = new Set<number>();
        for (const problem of day.problems) {
            if (!problem || !Number.isInteger(problem.order) || problem.order < 1 || orders.has(problem.order) || typeof problem.title !== "string") {
                throw new Error(`Invalid problem order or title in Day ${day.day}.`);
            }
            orders.add(problem.order);
            validateSource(problem.sourceUrl);
            if (problem.kind === "leetcode") {
                if (!Number.isInteger(problem.leetcodeId) || problem.leetcodeId! < 1 || ["Easy", "Medium", "Hard", "简单", "中等", "困难"].indexOf(problem.difficulty || "") < 0) {
                    throw new Error(`Invalid LeetCode ID or difficulty in Day ${day.day}.`);
                }
            } else if (problem.kind !== "custom" || typeof problem.solutionPath !== "string") {
                throw new Error(`Invalid problem kind or local template path in Day ${day.day}.`);
            }
        }
    }
    return plan;
}

function validateSource(url?: string): void {
    if (url === undefined) return;
    try {
        if (typeof url !== "string" || new URL(url).protocol !== "https:") throw new Error();
    } catch { throw new Error("Source links must be valid HTTPS URLs."); }
}

export function practiceKey(day: number, order: number): string { return `${day}:${order}`; }

export function parseProgress(markdown: string): Map<string, IProgressEntry> {
    const result = new Map<string, IProgressEntry>();
    let day: number | undefined;
    let offset = 0;
    for (const line of markdown.split("\n")) {
        const heading = line.match(/^## .*?Day (\d+)(?:\D|$)/);
        if (heading) day = Number(heading[1]);
        const entry = line.match(/^- \[([ xX])\] (\d+)\./);
        if (entry && day !== undefined) {
            const key = practiceKey(day, Number(entry[2]));
            if (result.has(key)) throw new Error(`Duplicate practice entry in PLAN.md: ${key}`);
            result.set(key, { done: entry[1].toLowerCase() === "x", offset: offset + 3 });
        }
        offset += line.length + 1;
    }
    return result;
}

export function workspacePath(root: string, relative: string): string {
    if (typeof relative !== "string" || path.isAbsolute(relative)) throw new Error("Paths must be relative to the workspace.");
    const full = path.resolve(root, relative);
    const difference = path.relative(root, full);
    if (!difference || difference === ".." || difference.startsWith(`..${path.sep}`) || path.isAbsolute(difference)) {
        throw new Error("Files must stay inside the workspace.");
    }
    return full;
}

export function toLeetCodeProblem(problem: IPlanProblem): IProblem {
    if (problem.kind !== "leetcode") throw new Error("Custom exercises can only be practiced locally.");
    const difficulty = { Easy: "Easy", Medium: "Medium", Hard: "Hard", 简单: "Easy", 中等: "Medium", 困难: "Hard" };
    return {
        id: String(problem.leetcodeId),
        name: problem.title.replace(/^\d+[｜.]\s*/, ""),
        difficulty: difficulty[problem.difficulty || ""],
        locked: Boolean(problem.paidOnly),
        state: 3,
        passRate: "",
        isFavorite: false,
        tags: [],
        companies: [],
    };
}
