import { components } from '@octokit/openapi-types';
import { ListModel, Stream, toggle } from 'mobx-restful';
import { buildURLData } from 'web-utility';

import { githubClient } from './client';

export type Organization = components['schemas']['organization-full'];

export class OrganizationModel extends Stream<Organization>(ListModel) {
    client = githubClient;
    baseURI = 'orgs';

    constructor(public user = '') {
        super();
    }

    async *openStream() {
        var per_page = this.pageSize,
            since: number | undefined,
            count = 0;
        const baseURI = this.user ? `users/${this.user}/` : '';

        for (let page = 0; ; page++) {
            const { body } = await this.client.get<Organization[]>(
                `${baseURI}orgs?${buildURLData({ per_page, page, since })}`
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
