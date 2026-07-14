import { components } from '@octokit/openapi-types';
import { Filter, ListModel, Stream, toggle } from 'mobx-restful';
import { buildURLData } from 'web-utility';

import { githubClient } from './client';

type GitTree = components['schemas']['git-tree'];

export type Tree = Pick<GitTree, 'sha'> & Partial<Omit<GitTree & GitTree['tree'][number], 'sha'>>;

export class TreeModel extends Stream<Tree>(ListModel) {
    client = githubClient;

    constructor(
        public owner: string,
        public repository: string
    ) {
        super();
        this.baseURI = `repos/${owner}/${repository}/git/trees`;
    }

    /**
     * @see {@link https://docs.github.com/en/rest/git/trees#get-a-tree}
     */
    @toggle('downloading')
    async getOne(treeSHA = 'HEAD', recursive?: boolean) {
        const { body } = await this.client.get<GitTree>(
            `${this.baseURI}/${treeSHA}?${buildURLData({ recursive })}`
        );
        return body!;
    }

    async *openStream({ path }: Filter<Tree>) {
        const matchFilter = (item: Tree) => !path || item.path.startsWith(path);

        const root = await this.getOne('HEAD', true);

        const pathSet = new Set<string>(),
            treeNodes: Tree[] = [];

        for (const item of root.tree) {
            pathSet.add(item.path);

            if (item.type === 'tree') treeNodes.push(item);

            if (matchFilter(item)) yield item;
        }
        let totalCount = root.tree.length;

        if (root.truncated)
            for (let index = 0; index < treeNodes.length; index++) {
                const { path, sha } = treeNodes[index];

                const { tree } = await this.getOne(sha);

                for (const item of tree) {
                    const fullPath = `${path}/${item.path}`;

                    if (pathSet.has(fullPath)) continue;

                    pathSet.add(fullPath);

                    const node = { ...item, path: fullPath };

                    totalCount += 1;

                    if (matchFilter(node)) yield node;

                    if (node.type === 'tree') treeNodes.push(node);
                }
            }
        this.totalCount = totalCount;
    }
}
