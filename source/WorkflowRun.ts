import { components } from '@octokit/openapi-types';
import { Filter, ListModel } from 'mobx-restful';
import { buildURLData } from 'web-utility';

import { BaseFilter, githubClient } from './client';

export type WorkflowRun = components['schemas']['workflow-run'];

export type WorkflowRunFilter = Filter<WorkflowRun> & BaseFilter;

/**
 * Model for GitHub Actions workflow runs
 *
 * @see {@link https://docs.github.com/en/rest/actions/workflow-runs?apiVersion=2022-11-28#list-workflow-runs-for-a-repository}
 */
export class WorkflowRunModel extends ListModel<WorkflowRun, WorkflowRunFilter> {
    client = githubClient;
    baseURI = '';

    constructor(
        public owner: string,
        public repository: string
    ) {
        super();
        this.baseURI = `repos/${owner}/${repository}/actions/runs`;
    }

    async loadPage(
        page: number,
        per_page: number,
        { head_branch: branch, actor, ...restFilter }: WorkflowRunFilter
    ) {
        const { body } = await this.client.get<{
            workflow_runs: WorkflowRun[];
            total_count: number;
        }>(`${this.baseURI}?${buildURLData({ branch, actor, per_page, page, ...restFilter })}`);

        return {
            pageData: body!.workflow_runs,
            totalCount: body!.total_count
        };
    }
}
