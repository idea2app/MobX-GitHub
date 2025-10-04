import { components } from '@octokit/openapi-types';
import { Filter, ListModel, Stream } from 'mobx-restful';
import { buildURLData } from 'web-utility';

import { githubClient } from './client';

export type CheckRun = components['schemas']['check-run'];

export interface CheckRunFilter extends Filter<CheckRun> {
    check_name?: string;
    filter?: 'latest' | 'all';
}

export class CheckRunModel extends Stream<CheckRun, CheckRunFilter>(ListModel) {
    client = githubClient;

    constructor(
        public owner: string,
        public repository: string,
        public ref: string
    ) {
        super();
        this.baseURI = `repos/${owner}/${repository}/commits/${ref}/check-runs`;
    }

    async *openStream(filter: CheckRunFilter) {
        const { client, baseURI } = this;
        const { check_name, filter: filterType = 'latest', ...rest } = filter;

        const { body } = await client.get<{ check_runs: CheckRun[] }>(
            `${baseURI}?${buildURLData({ check_name, filter: filterType, per_page: 100, ...rest })}`
        );
        this.totalCount = body!.check_runs.length;

        yield* body!.check_runs;
    }
}
