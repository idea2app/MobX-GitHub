import { components } from '@octokit/openapi-types';
import { Filter, ListModel, NewData, Stream } from 'mobx-restful';
import { buildURLData } from 'web-utility';

import { BaseFilter, githubClient } from './client';
import { PullRequest } from './PullRequest';

export type Issue = components['schemas']['issue'];
export type IssueComment = components['schemas']['issue-comment'];

export interface IssueFilter extends Filter<Issue>, BaseFilter {
    sort?: 'created' | 'updated' | 'comments';
}

export type IssueCommentFilter = Filter<IssueComment> & BaseFilter;

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

    /**
     * Create a new issue
     *
     * @see {@link https://docs.github.com/en/rest/issues/issues#create-an-issue}
     */
    async createOne({ title, body, assignees }: Partial<NewData<Issue>>) {
        const { body: issue } = await this.client.post<Issue>(this.baseURI, {
            title,
            body,
            assignees
        });
        return issue!;
    }

    /**
     * Create a comment on an issue
     *
     * @see {@link https://docs.github.com/en/rest/issues/comments#create-an-issue-comment}
     */
    async createComment(issueNumber: number, body: string) {
        const { body: comment } = await this.client.post<IssueComment>(
            `${this.baseURI}/${issueNumber}/comments`,
            { body }
        );
        return comment!;
    }

    /**
     * Get pull requests that close an issue using GraphQL
     *
     * @see {@link https://docs.github.com/en/graphql/reference/objects#pullrequest}
     */
    async getPullRequests(issueNumber: number) {
        const query = `
            query ($owner: String!, $name: String!, $number: Int!) {
                repository(owner: $owner, name: $name) {
                    issue(number: $number) {
                        closedByPullRequestsReferences(first: 10) {
                            nodes {
                                url
                                number
                                head
                                merged
                            }
                        }
                    }
                }
            }`;
        type IssuePRQueryResult = {
            data: {
                repository: {
                    issue: {
                        closedByPullRequestsReferences: {
                            nodes: Pick<PullRequest, 'url' | 'number' | 'head' | 'merged'>[];
                        };
                    };
                };
            };
        };
        const { body } = await this.client.post<IssuePRQueryResult>(
            `https://api.github.com/graphql`,
            {
                query,
                variables: { owner: this.owner, name: this.repository, number: issueNumber }
            }
        );
        return body!.data.repository.issue.closedByPullRequestsReferences.nodes;
    }
}

export class IssueCommentModel extends Stream<IssueComment, IssueCommentFilter>(ListModel) {
    client = githubClient;

    constructor(
        public owner: string,
        public repository: string,
        public issue: number
    ) {
        super();
        this.baseURI = `repos/${owner}/${repository}/issues/${issue}/comments`;
    }

    async *openStream(filter: IssueCommentFilter) {
        const { client, baseURI, pageSize: per_page } = this;

        var count = 0;

        for (let page = 1; ; page++) {
            const { body } = await client.get<IssueComment[]>(
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
