import { components } from '@octokit/openapi-types';
import { Filter, ListModel, Stream } from 'mobx-restful';
import { buildURLData } from 'web-utility';

import { BaseFilter, githubClient } from './client';

export type WorkflowRun = components['schemas']['workflow-run'];

export interface WorkflowRunFilter extends Filter<WorkflowRun>, BaseFilter {
    branch?: string;
    actor?: string;
}

export class WorkflowRunModel extends Stream<WorkflowRun, WorkflowRunFilter>(ListModel) {
    client = githubClient;

    constructor(
        public owner: string,
        public repository: string
    ) {
        super();
        this.baseURI = `repos/${owner}/${repository}/actions/runs`;
    }

    async *openStream(filter: WorkflowRunFilter) {
        const { client, baseURI } = this;
        const { branch, actor, direction, ...rest } = filter;

        const { body } = await client.get<{ workflow_runs: WorkflowRun[] }>(
            `${baseURI}?${buildURLData({ branch, actor, per_page: 100, ...rest })}`
        );

        const runs = body!.workflow_runs;

        // Sort by created_at if direction is specified
        if (direction) {
            runs.sort((a, b) =>
                direction === 'asc'
                    ? +new Date(a.created_at) - +new Date(b.created_at)
                    : +new Date(b.created_at) - +new Date(a.created_at)
            );
        }

        this.totalCount = runs.length;
        yield* runs;
    }
}
