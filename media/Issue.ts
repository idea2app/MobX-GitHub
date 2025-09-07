import { components } from '@octokit/openapi-types';
import { Filter, ListModel, Stream } from 'mobx-restful';
import { buildURLData } from 'web-utility';

import { BaseFilter, githubClient } from './client';

export type Issue = components['schemas']['issue'];

export interface IssueFilter extends Filter<Issue>, BaseFilter {
    sort?: 'created' | 'updated' | 'comments';
}

export class IssueModel extends Stream<Issue, IssueFilter>(ListModel) {
    client = githubClient;

    constructor(
        public owner: string,
        public repository: string
    ) {
        super();
        this.baseURI = `repos/${owner}/${repository}/issues`;
    }

    async *openStream(filter: IssueFilter) {
        var per_page = this.pageSize,
            count = 0;

        for (let page = 1; ; page++) {
            const { body } = await this.client.get<Issue[]>(
                `${this.baseURI}?${buildURLData({ per_page, page, ...filter })}`
            );
            const list = body!.filter(({ pull_request }) => !pull_request);

            if (!body![0]) break;

            count += list.length;
            yield* list;

            if (body.length < this.pageSize) break;
        }
        this.totalCount = count;
    }
}
