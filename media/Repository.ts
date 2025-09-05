import { components } from '@octokit/openapi-types';
import { memoize } from 'lodash';
import { Filter, ListModel, toggle } from 'mobx-restful';
import { averageOf, buildURLData, groupBy } from 'web-utility';

import { githubClient } from './client';
import { Contributor, ContributorModel } from './Contributor';
import { Issue, IssueModel } from './Issue';
import { OrganizationModel } from './Organization';
import { User } from './User';

type Repository = components['schemas']['minimal-repository'];

export interface GitRepository extends Repository {
    contributors?: Contributor[];
    languages?: string[];
    issues?: Issue[];
}

export interface RepositoryFilter extends Filter<GitRepository> {
    relation: (keyof RepositoryModel['relation'])[];
}

type ReturnMap<T> = {
    [K in keyof T]: T[K] extends (...data: any[]) => Promise<any>
        ? Awaited<ReturnType<T[K]>>
        : T[K] extends (...data: any[]) => any
          ? ReturnType<T[K]>
          : never;
};

export class RepositoryModel extends ListModel<GitRepository, RepositoryFilter> {
    client = githubClient;
    baseURI = '';
    indexKey = 'full_name' as const;

    constructor(public owner = '') {
        super();
        this.baseURI = owner ? `orgs/${owner}/repos` : 'user/repos';
    }

    organizationStore = new OrganizationModel();

    relation = {
        contributors: memoize(async (URI: string) => {
            const [owner, repository] = URI.split('/');

            const body = await new ContributorModel(owner, repository).getAll();

            return body.sort((a, b) => b.contributions - a.contributions) || [];
        }),
        issues: memoize((URI: string) => {
            const [owner, repository] = URI.split('/');

            return new IssueModel(owner, repository).getAll();
        }),
        languages: memoize(async (URI: string) => {
            const { body: languageCount } = await this.client.get<Record<string, number>>(
                `repos/${URI}/languages`
            );
            const languageAverage = averageOf(...Object.values(languageCount!));

            const languageList = Object.entries(languageCount!)
                .filter(([_, score]) => score >= languageAverage)
                .sort(([_, a], [__, b]) => b - a);

            return languageList.map(([name]) => name);
        })
    };

    async getOneRelation(URI: string, relation: RepositoryFilter['relation'] = []) {
        const relationData = await Promise.all(
            relation.map(async key => {
                const value = await this.relation[key](URI);
                return [key, value];
            })
        );
        return Object.fromEntries(relationData) as ReturnMap<RepositoryModel['relation']>;
    }

    @toggle('downloading')
    async getOne(URI: string, relation: RepositoryFilter['relation'] = []) {
        const { body } = await this.client.get<Repository>(`repos/${URI}`);

        return (this.currentOne = {
            ...body!,
            ...(await this.getOneRelation(URI, relation))
        });
    }

    async loadPage(page: number, per_page: number, { relation }: RepositoryFilter) {
        const [kind, namespace] = this.baseURI.split('/'),
            isUser = kind === 'user';

        const { body: list } = await this.client.get<Repository[]>(
            `${this.baseURI}?${buildURLData({
                type: isUser ? 'owner' : 'public',
                sort: 'pushed',
                page,
                per_page
            })}`
        );
        const pageData = await Promise.all(
            list!.map(async item => ({
                ...item,
                ...(await this.getOneRelation(item.full_name, relation))
            }))
        );
        var { totalCount } = this;

        if (!this.totalCount)
            if (!isUser)
                ({ public_repos: totalCount } = await this.organizationStore.getOne(namespace));
            else {
                const { body } = await this.client.get<User>('user');

                totalCount = body!.public_repos + (body!.total_private_repos || 0);
            }
        return { pageData, totalCount };
    }

    async getAllContributors() {
        const repositories = await this.getAll({ relation: ['contributors'] });

        const contributors = repositories
            .filter(({ fork, archived }) => !archived && !fork)
            .flatMap(({ contributors }) => contributors!)
            .filter(({ type }) => type === 'User');

        const userGroup = groupBy(contributors, 'login');

        return Object.entries(userGroup)
            .map(([login, list]) => ({
                ...list[0],
                contributions: list.reduce((sum, { contributions }) => sum + contributions, 0)
            }))
            .sort((a, b) => b.contributions - a.contributions);
    }
}
