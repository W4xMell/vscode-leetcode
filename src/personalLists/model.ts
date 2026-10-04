// Licensed under the MIT license.
import { IProblem, ProblemState } from "../shared";
export interface IListSummary { slug: string; name: string; favoriteType: string; }
export interface IListProblem extends IProblem { internalId: string; slug: string; }
export interface IPersonalList extends IListSummary { problems: IListProblem[]; updatedAt: number; cached?: boolean; error?: string; }
export type GraphQL = (query: string, variables?: any) => Promise<any>;

export const createdQuery = `query studyPlanCreatedLists {
    myCreatedFavoriteList { favorites { name slug favoriteType } hasMore totalLength }
}`;
export const detailQuery = `query studyPlanListDetail($favoriteSlug: String!) {
    favoriteDetailV2(favoriteSlug: $favoriteSlug) { name slug favoriteType questionNumber }
}`;
export const questionsQuery = `query studyPlanListQuestions($favoriteSlug: String!, $limit: Int!, $skip: Int!) {
    favoriteQuestionList(favoriteSlug: $favoriteSlug, limit: $limit, skip: $skip, version: "v2",
        sortBy: { sortField: CUSTOM, sortOrder: ASCENDING }) {
        questions { id questionFrontendId title translatedTitle titleSlug difficulty paidOnly acRate topicTags { name } }
        totalLength hasMore
    }
}`;

export class PersonalListClient {
    constructor(private readonly request: GraphQL) { }
    public async created(): Promise<IListSummary[]> {
        const data = (await this.request(createdQuery)).myCreatedFavoriteList;
        if (!data || !Array.isArray(data.favorites)) throw new Error("Invalid list response.");
        // The website query exposes no offset/limit arguments. Never silently truncate discovery.
        if (data.hasMore) throw new Error("The website returned an incomplete list catalog. Open your lists on LeetCode and retry; list discovery cannot safely truncate results.");
        return data.favorites.filter((list) => list.favoriteType === "NORMAL");
    }
    public async load(slug: string): Promise<IPersonalList> {
        const detail = (await this.request(detailQuery, { favoriteSlug: slug })).favoriteDetailV2;
        if (!detail || detail.favoriteType !== "NORMAL" || detail.slug !== slug) throw new Error("This ordinary list is no longer accessible.");
        const problems: IListProblem[] = [];
        const seen = new Set<string>();
        let total: number | undefined;
        for (let page = 0; page < 1000; page++) {
            const result = (await this.request(questionsQuery, { favoriteSlug: slug, limit: 100, skip: problems.length })).favoriteQuestionList;
            if (!result || !Array.isArray(result.questions) || !Number.isInteger(result.totalLength)) throw new Error("Invalid problem page.");
            if (total !== undefined && result.totalLength !== total) throw new Error("List changed during refresh. Retry to fetch a consistent list.");
            total = result.totalLength;
            for (const question of result.questions) {
                const internalId = String(question.id);
                if (seen.has(internalId)) throw new Error("List order changed during pagination. Retry refresh.");
                if (!question.questionFrontendId || !question.titleSlug || !question.id) throw new Error("Invalid problem identity.");
                seen.add(internalId);
                problems.push({
                    internalId, slug: question.titleSlug, id: String(question.questionFrontendId),
                    name: question.translatedTitle || question.title, difficulty: { EASY: "Easy", MEDIUM: "Medium", HARD: "Hard" }[question.difficulty] || question.difficulty,
                    locked: Boolean(question.paidOnly), state: ProblemState.Unknown, isFavorite: false,
                    passRate: `${(Number(question.acRate || 0) * 100).toFixed(2)}%`, tags: (question.topicTags || []).map((tag) => tag.name), companies: []
                });
            }
            if (!result.hasMore) {
                if (problems.length !== total) throw new Error("Incomplete problem list.");
                return { ...detail, problems, updatedAt: Date.now(), cached: false };
            }
            if (!result.questions.length) throw new Error("Empty page while more problems remain.");
        }
        throw new Error("Too many list pages.");
    }
}

export function accountKey(site: string, user: string): string { return JSON.stringify([site, user]); }
export function completionKey(account: string, slug: string, internalId: string): string { return JSON.stringify([account, slug, internalId]); }
