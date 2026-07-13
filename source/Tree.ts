import { components } from '@octokit/openapi-types';
import { Filter, ListModel, Stream } from 'mobx-restful';
import { buildURLData } from 'web-utility';

import { githubClient } from './client';

type GitTree = components['schemas']['git-tree'];

export type Tree = GitTree['tree'][number];
export type TreeFilter = Filter<Tree> & { name?: string };

export class TreeModel extends Stream<Tree, TreeFilter>(ListModel) {
    client = githubClient;

    constructor(
        public owner: string,
        public repository: string
    ) {
        super();
        this.baseURI = `repos/${owner}/${repository}/git/trees`;
    }

    protected async getTree(treeSHA = 'HEAD', recursive = false) {
        const query = recursive ? `?${buildURLData({ recursive: 1 })}` : '';

        const { body } = await this.client.get<GitTree>(`${this.baseURI}/${treeSHA}${query}`);

        return body!;
    }

    async *openStream({ path, name }: TreeFilter) {
        const namePattern = name && new RegExp(name);
        const pathPrefix = path ? `${path}/` : '';
        const matchFilter = (item: Tree) =>
            (!path || item.path.startsWith(pathPrefix)) &&
            (!namePattern || namePattern.test(item.path.split('/').pop()!));

        const rootTree = await this.getTree('HEAD', true);
        const results = [...rootTree.tree];
        const pathSet = new Set<string>();

        for (const item of results) {
            pathSet.add(item.path);

            if (matchFilter(item)) yield item;
        }

        if (rootTree.truncated) {
            let index = 0;

            while (index < results.length) {
                const parent = results[index];
                index += 1;

                if (parent.type !== 'tree') continue;

                const { tree } = await this.getTree(parent.sha);

                for (const item of tree) {
                    const fullPath = `${parent.path}/${item.path}`;

                    if (pathSet.has(fullPath)) continue;

                    const node = { ...item, path: fullPath };

                    results.push(node);
                    pathSet.add(fullPath);

                    if (matchFilter(node)) yield node;
                }
            }
        }
        this.totalCount = results.length;
    }
}
