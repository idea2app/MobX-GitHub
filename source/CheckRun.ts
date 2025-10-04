import { components } from '@octokit/openapi-types';
import { Filter, ListModel } from 'mobx-restful';
import { buildURLData } from 'web-utility';

import { githubClient } from './client';

export type CheckRun = components['schemas']['check-run'];

export interface CheckRunFilter extends Filter<CheckRun> {
    check_name?: string;
    filter?: 'latest' | 'all';
}

/**
 * Model for GitHub Actions check runs
 *
 * @see {@link https://docs.github.com/en/rest/checks/runs?apiVersion=2022-11-28#list-check-runs-for-a-git-reference}
 */
export class CheckRunModel extends ListModel<CheckRun, CheckRunFilter> {
    client = githubClient;
    baseURI = '';

    constructor(
        public owner: string,
        public repository: string,
        public ref: string
    ) {
        super();
        this.baseURI = `repos/${owner}/${repository}/commits/${ref}/check-runs`;
    }

    async loadPage(
        page: number,
        per_page: number,
        { check_name, filter: filterType = 'latest' }: CheckRunFilter
    ) {
        const { body } = await this.client.get<{
            check_runs: CheckRun[];
            total_count: number;
        }>(`${this.baseURI}?${buildURLData({ check_name, filter: filterType, per_page, page })}`);

        return {
            pageData: body!.check_runs,
            totalCount: body!.total_count
        };
    }
}
