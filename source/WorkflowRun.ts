import { components } from '@octokit/openapi-types';
import { Filter, ListModel } from 'mobx-restful';
import { buildURLData } from 'web-utility';

import { BaseFilter, githubClient } from './client';

export type WorkflowRun = components['schemas']['workflow-run'];

export interface WorkflowRunFilter extends Filter<WorkflowRun>, BaseFilter {
    branch?: string;
    actor?: string;
}

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

    async loadPage(page: number, per_page: number, filter: WorkflowRunFilter) {
        const { branch, actor, direction } = filter;

        const { body } = await this.client.get<{
            workflow_runs: WorkflowRun[];
            total_count: number;
        }>(`${this.baseURI}?${buildURLData({ branch, actor, per_page, page })}`);

        const runs = body!.workflow_runs;

        // Sort by created_at if direction is specified
        if (direction) {
            runs.sort((a, b) =>
                direction === 'asc'
                    ? +new Date(a.created_at) - +new Date(b.created_at)
                    : +new Date(b.created_at) - +new Date(a.created_at)
            );
        }

        return {
            pageData: runs,
            totalCount: body!.total_count
        };
    }
}
