import { components } from '@octokit/openapi-types';
import { ListModel, Stream, toggle } from 'mobx-restful';
import { buildURLData } from 'web-utility';

import { githubClient } from './client';

export type Organization = components['schemas']['organization-full'];

export class OrganizationModel extends Stream<Organization>(ListModel) {
    client = githubClient;
    baseURI = '';

    constructor(public user = '') {
        super();
        this.baseURI = user ? `users/${user}/orgs` : 'user/orgs';
    }

    async *openStream() {
        var per_page = this.pageSize,
            since: number | undefined,
            count = 0;

        for (let page = 0; ; page++) {
            const { body } = await this.client.get<Organization[]>(
                `${this.baseURI}?${buildURLData({ per_page, page, since })}`
            );
            if (!body![0]) break;

            since = body!.at(-1)?.id;
            count += body!.length;
            yield* body!;

            if (body!.length < this.pageSize) break;
        }
        this.totalCount = count;
    }

    @toggle('downloading')
    async getOne(name: string) {
        return this.currentOne.login === name
            ? this.currentOne
            : super.getOne(name);
    }
}
