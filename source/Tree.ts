import { components } from '@octokit/openapi-types';
import { Filter, ListModel, Stream, toggle } from 'mobx-restful';
import { makeArray } from 'web-utility';

import { githubClient } from './client';

export type GitTreeEntry = components['schemas']['git-tree'] & {
    parent_path?: string;
};

interface GitTreeResponse {
    sha: string;
    url: string;
    tree: GitTreeEntry[];
    truncated: boolean;
}

/**
 * Read-only model that streams entries of a Git tree object via the
 * GitHub `GET /repos/{owner}/{repo}/git/trees/{tree_sha}` endpoint.
 *
 * Two-phase retrieval (per issue #7 in idea2app/MobX-GitHub):
 *  1. Recursive single-shot fetch. If the response is NOT truncated, the
 *     entries are yielded directly.
 *  2. When GitHub sets `truncated: true`, fall back to non-recursive
 *     traversal of the already-fetched `tree` nodes: any entry whose
 *     `type` is `tree` (directory) is re-queried at depth+1 so that new
 *     entries are streamed iteratively until no new SHAs are produced.
 *
 * @see https://docs.github.com/en/rest/git/trees?apiVersion=2022-11-28#get-a-tree
 */
export class TreeModel extends Stream<GitTreeEntry>(ListModel) {
    client = githubClient;

    constructor(
        public owner: string,
        public repository: string,
        public tree_sha = 'HEAD'
    ) {
        super();
        this.baseURI = `repos/${owner}/${repository}/git/trees/${tree_sha}`;
    }

    /**
     * Get a single tree snapshot.
     *
     * @param recursive Pass `true` to ask GitHub for a recursive tree
     * (note: GitHub may still set `truncated: true` on huge repositories).
     */
    @toggle('downloading')
    async getOne(recursive = true): Promise<GitTreeResponse> {
        const { body } = await this.client.get<GitTreeResponse>(this.baseURI, {
            recursive: recursive ? 'true' : 'false'
        });
        return body!;
    }

    /**
     * Stream every entry of the tree, transparently recovering from
     * GitHub's 100k-entry truncation by iteratively re-querying visible
     * sub-trees at depth+1.
     */
    async *openStream({ path, name }: Filter<GitTreeEntry> = {}) {
        const namePattern = name && new RegExp(name);

        for await (const entry of this.iterateTree(this.tree_sha, '', new Set<string>())) {
            if (path && !entry.path?.startsWith(path)) continue;
            if (namePattern && !namePattern.test(entry.name)) continue;
            yield entry;
        }
    }

    /**
     * Internal: iterative two-phase walker. Uses a `seen` set keyed by
     * SHA so that we never yield the same entry twice (which would happen
     * when a parent tree is `tree`-typed and gets re-walked after GitHub
     * truncated the original recursive response).
     */
    private async *iterateTree(
        tree_sha: string,
        parent_path: string,
        seen: Set<string>
    ): AsyncGenerator<GitTreeEntry> {
        const response = await this.getOne(true);
        this.totalCount = (this.totalCount ?? 0) + response.tree.length;

        for (const entry of response.tree) {
            entry.parent_path = parent_path;
            if (seen.has(entry.sha)) continue;
            seen.add(entry.sha);
            yield entry;
        }

        if (!response.truncated) return;

        // Phase 2: any `tree`-typed entry at this snapshot is a candidate
        // for a deeper query. We loop until no new SHAs are produced.
        let frontier = response.tree.filter(e => e.type === 'tree' && e.sha !== tree_sha);
        while (frontier.length > 0) {
            const nextFrontier: GitTreeEntry[] = [];

            for (const dir of frontier) {
                if (!dir.path) continue;
                const childPath = parent_path ? `${parent_path}/${dir.path}` : dir.path;
                const child = await this.getTreeRecursive(dir.sha, childPath);
                for (const entry of child.tree) {
                    entry.parent_path = childPath;
                    if (seen.has(entry.sha)) continue;
                    seen.add(entry.sha);
                    yield entry;
                    if (entry.type === 'tree') nextFrontier.push(entry);
                }
            }
            frontier = nextFrontier;
        }
    }

    /**
     * Fetch a single non-recursive tree snapshot by SHA.
     * GitHub returns the immediate children only — useful for the
     * truncated-recovery loop in {@link iterateTree}.
     */
    private async getTreeRecursive(sha: string, parent_path: string) {
        const { body } = await this.client.get<GitTreeResponse>(
            `repos/${this.owner}/${this.repository}/git/trees/${sha}`,
            { recursive: 'false' }
        );
        // Annotate for downstream consumers
        makeArray(body!.tree).forEach(e => (e.parent_path = parent_path));
        return body!;
    }
}