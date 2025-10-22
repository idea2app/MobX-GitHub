import { components } from '@octokit/openapi-types';
import { Stream, ListModel, Filter } from 'mobx-restful';
import { buildURLData } from 'web-utility';

import { BaseFilter, githubClient } from './client';

export type PullRequest = components['schemas']['pull-request'];

export type PullRequestFilter = Filter<PullRequest> &
    BaseFilter & {
        state?: 'open' | 'closed' | 'all';
        sort?: 'created' | 'updated' | 'popularity' | 'long-running';
    };

export class PullRequestModel extends Stream<PullRequest, PullRequestFilter>(ListModel) {
    client = githubClient;

    constructor(
        public owner: string,
        public repository: string
    ) {
        super();
        this.baseURI = `repos/${owner}/${repository}/pulls`;
    }

    async *openStream(filter: PullRequestFilter) {
        const { client, baseURI, pageSize: per_page } = this;

        var count = 0;

        for (let page = 1; ; page++) {
            const { body } = await client.get<PullRequest[]>(
                `${baseURI}?${buildURLData({ per_page, page, ...filter })}`
            );
            if (!body![0]) break;

            count += body!.length;
            yield* body!;

            if (body!.length < this.pageSize) break;
        }
        this.totalCount = count;
    }
}
