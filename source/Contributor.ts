import { components } from '@octokit/openapi-types';
import { Filter, ListModel, Stream } from 'mobx-restful';
import { buildURLData } from 'web-utility';

import { githubClient } from './client';

export type Contributor = components['schemas']['contributor'];

export interface ContributorFilter extends Filter<Contributor> {
    affiliation?: 'outside' | 'direct' | 'all';
    permission?: 'pull' | 'triage' | 'push' | 'maintain' | 'admin';
}

export class ContributorModel extends Stream<Contributor, ContributorFilter>(ListModel) {
    client = githubClient;

    constructor(
        public owner: string,
        public repository: string
    ) {
        super();
        this.baseURI = `repos/${owner}/${repository}/contributors`;
    }

    async *openStream({ affiliation, permission }: ContributorFilter) {
        const { client, baseURI, pageSize: per_page } = this;

        var count = 0;

        for (let page = 1; ; page++) {
            const { body } = await client.get<Contributor[]>(
                `${baseURI}?${buildURLData({ per_page, page, affiliation, permission })}`
            );
            if (!body![0]) break;

            count += body!.length;
            yield* body!;

            if (body!.length < this.pageSize) break;
        }
        this.totalCount = count;
    }
}
