import { components } from '@octokit/openapi-types';
import { Filter, ListModel, Stream } from 'mobx-restful';
import { buildURLData } from 'web-utility';

import { BaseFilter, githubClient } from './client';

export type Discussion = components['schemas']['discussion'];
export type DiscussionComment = components['schemas']['webhooks_answer'];

export type DiscussionFilter = Filter<Discussion> & BaseFilter;
export type DiscussionCommentFilter = Filter<DiscussionComment> & BaseFilter;

export class DiscussionModel extends Stream<Discussion, DiscussionFilter>(ListModel) {
    client = githubClient;

    constructor(
        public owner: string,
        public repository: string
    ) {
        super();
        this.baseURI = `repos/${owner}/${repository}/discussions`;
    }

    async *openStream(filter: DiscussionFilter) {
        const { client, baseURI, pageSize: per_page } = this;

        var count = 0;

        for (let page = 1; ; page++) {
            const { body } = await client.get<Discussion[]>(
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

export class DiscussionCommentModel extends Stream<DiscussionComment, DiscussionCommentFilter>(
    ListModel
) {
    client = githubClient;

    constructor(
        public owner: string,
        public repository: string,
        public discussion: number
    ) {
        super();
        this.baseURI = `repos/${owner}/${repository}/discussions/${discussion}/comments`;
    }

    async *openStream(filter: DiscussionCommentFilter) {
        const { client, baseURI, pageSize: per_page } = this;

        const { body } = await client.get<Discussion>(baseURI.split('/').slice(0, -1).join('/'));

        this.totalCount = body!.comments;

        if (!this.totalCount) return;

        for (let page = 1; ; page++) {
            const { body } = await client.get<DiscussionComment[]>(
                `${baseURI}?${buildURLData({ per_page, page, ...filter })}`
            );
            if (!body![0]) break;

            yield* body!;

            if (body!.length < this.pageSize) break;
        }
    }
}
