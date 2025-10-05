import { components } from '@octokit/openapi-types';
import { Filter, ListModel, NewData, Stream, toggle } from 'mobx-restful';
import { buildURLData } from 'web-utility';

import { BaseFilter, githubClient } from './client';
import { PullRequestModel } from './PullRequest';
import { User } from './User';

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
     * Create or update an issue, with support for Copilot assignee
     *
     * @see {@link https://docs.github.com/en/rest/issues/issues#create-an-issue}
     * @see {@link https://docs.github.com/en/rest/issues/issues#update-an-issue}
     */
    async updateOne({ assignees = [], ...rest }: Partial<NewData<Issue>>, id?: number) {
        const assigneeList = assignees as string[];
        const humanAssignees = assigneeList.filter(login => login !== 'copilot');
        const hasCopilotAssignee = assigneeList.length !== humanAssignees.length;

        const issueData = {
            ...rest,
            ...(humanAssignees && { assignees: humanAssignees })
        } as Partial<NewData<Issue>>;

        const issue = await super.updateOne(issueData, id);

        if (hasCopilotAssignee) await this.assignOneToCopilot(issue);

        return issue;
    }

    /**
     * Assign Copilot bot to an issue using GitHub GraphQL API
     */
    @toggle('uploading')
    async assignOneToCopilot(issue: Issue) {
        const getUserQuery = `
            query ($owner: String!, $name: String!) {
                repository(owner: $owner, name: $name) {
                    suggestedActors(
                        loginNames: "copilot"
                        capabilities: [CAN_BE_ASSIGNED]
                        first: 1
                    ) {
                        nodes {
                            login
                            __typename
                            ... on Bot { id }
                        }
                    }
                }
            }`;
        type UserQueryResult = {
            data: { repository: { suggestedActors: { nodes: User[] } } };
        };
        const { body: userResult } = await this.client.post<UserQueryResult>(
            'https://api.github.com/graphql',
            {
                query: getUserQuery,
                variables: { owner: this.owner, name: this.repository }
            }
        );
        const copilotId = userResult!.data.repository.suggestedActors.nodes[0].id;

        const assignMutation = `
            mutation ($issueId: ID!, $userId: ID!) {
                replaceActorsForAssignable(input: {assignableId: $issueId, actorIds: [$userId]}) {
                    assignable {
                        ... on Issue {
                            id
                            title
                            assignees(first: 10) {
                                nodes { login }
                            }
                        }
                    }
                }
            }`;
        await this.client.post('https://api.github.com/graphql', {
            query: assignMutation,
            variables: { issueId: issue.id, userId: [copilotId] }
        });
    }

    /**
     * Get pull requests that close an issue using GraphQL
     *
     * @see {@link https://docs.github.com/en/graphql/reference/objects#pullrequest}
     */
    @toggle('downloading')
    async getLinkedPRs(issueNumber: number, maxCount = 10) {
        const prNumbers = await this.getLinkedPRNumbers(issueNumber, maxCount);

        const prModel = new PullRequestModel(this.owner, this.repository);

        return Promise.all(prNumbers.map(number => prModel.getOne(number)));
    }

    private async getLinkedPRNumbers(issueNumber: number, maxCount = 10) {
        const query = `
            query ($owner: String!, $name: String!, $number: Int!, $maxCount: Int!) {
                repository(owner: $owner, name: $name) {
                    issue(number: $number) {
                        closedByPullRequestsReferences(first: $maxCount) {
                            nodes {
                                number
                            }
                        }
                    }
                }
            }`;
        type IssuePRQueryResult = {
            data: {
                repository: {
                    issue: { closedByPullRequestsReferences: { nodes: { number: number }[] } };
                };
            };
        };
        const { body } = await this.client.post<IssuePRQueryResult>(
            `https://api.github.com/graphql`,
            {
                query,
                variables: {
                    owner: this.owner,
                    name: this.repository,
                    number: issueNumber,
                    maxCount
                }
            }
        );
        return body!.data.repository.issue.closedByPullRequestsReferences.nodes.map(
            ({ number }) => number
        );
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
                `${baseURI}?${buildURLData({ ...filter, per_page, page })}`
            );
            if (!body![0]) break;

            count += body!.length;
            yield* body!;

            if (body!.length < per_page) break;
        }
        this.totalCount = count;
    }
}
