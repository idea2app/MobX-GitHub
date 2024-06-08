import { components } from '@octokit/openapi-types';
import { encodeBase64 } from 'koajax';
import { memoize } from 'lodash';
import { Filter, ListModel, toggle } from 'mobx-restful';
import {
    PickSingle,
    averageOf,
    buildURLData,
    groupBy,
    makeArray
} from 'web-utility';

import { OrganizationModel } from './Organization';
import { User } from './User';
import { githubClient } from './client';

type Repository = components['schemas']['minimal-repository'];
export type Contributor = components['schemas']['contributor'];
export type Issue = components['schemas']['issue'];

export interface GitRepository extends Repository {
    contributors?: Contributor[];
    languages?: string[];
    issues?: Issue[];
}
export type GitFile = components['schemas']['content-file'];
export type GitContent = PickSingle<components['schemas']['content-directory']>;

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

export class RepositoryModel extends ListModel<
    GitRepository,
    RepositoryFilter
> {
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
            const { body } = await this.client.get<Contributor[]>(
                `repos/${URI}/contributors?per_page=100`
            );
            return (
                body?.sort((a, b) => b.contributions - a.contributions) || []
            );
        }),
        issues: memoize(async (URI: string) => {
            const { body: issuesList } = await this.client.get<Issue[]>(
                `repos/${URI}/issues?per_page=100`
            );
            return issuesList!.filter(({ pull_request }) => !pull_request);
        }),
        languages: memoize(async (URI: string) => {
            const { body: languageCount } = await this.client.get<
                Record<string, number>
            >(`repos/${URI}/languages`);

            const languageAverage = averageOf(...Object.values(languageCount!));

            const languageList = Object.entries(languageCount!)
                .filter(([_, score]) => score >= languageAverage)
                .sort(([_, a], [__, b]) => b - a);

            return languageList.map(([name]) => name);
        })
    };

    async getOneRelation(
        URI: string,
        relation: RepositoryFilter['relation'] = []
    ) {
        const relationData = await Promise.all(
            relation.map(async key => {
                const value = await this.relation[key](URI);
                return [key, value];
            })
        );
        return Object.fromEntries(relationData) as ReturnMap<
            RepositoryModel['relation']
        >;
    }

    @toggle('downloading')
    async getOne(URI: string, relation: RepositoryFilter['relation'] = []) {
        const { body } = await this.client.get<Repository>(`repos/${URI}`);

        return (this.currentOne = {
            ...body!,
            ...(await this.getOneRelation(URI, relation))
        });
    }

    async loadPage(
        page: number,
        per_page: number,
        { relation }: RepositoryFilter
    ) {
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
        if (!isUser) {
            const { public_repos } =
                await this.organizationStore.getOne(namespace);

            return { pageData, totalCount: public_repos };
        }
        if (!this.totalCount) {
            const { body } = await this.client.get<User>('user');

            var totalCount =
                body!.public_repos + (body!.total_private_repos || 0);
        }
        return { pageData, totalCount };
    }

    @toggle('downloading')
    async getContents(repository = this.currentOne.name, path = '') {
        const { body } = await this.client.get<GitContent[]>(
            `repos/${this.owner}/${repository}/contents/${path}`
        );
        return makeArray(body);
    }

    @toggle('uploading')
    async updateContent(
        path: string,
        content: string | Blob,
        message = `[update] ${path}`,
        repository = this.currentOne.name
    ) {
        try {
            var [{ sha }] = await this.getContents(repository, path);
        } catch {}

        const { body } = await this.client.put<{
            content: GitContent;
            commit: components['schemas']['commit'];
        }>(`repos/${this.owner}/${repository}/contents/${path}`, {
            sha,
            message,
            content: await encodeBase64(content)
        });
        return body!.content;
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
                contributions: list.reduce(
                    (sum, { contributions }) => sum + contributions,
                    0
                )
            }))
            .sort((a, b) => b.contributions - a.contributions);
    }
}
