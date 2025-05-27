import { components } from '@octokit/openapi-types';
import { computed, observable } from 'mobx';
import { BaseModel, toggle } from 'mobx-restful';

import { OrganizationModel } from './Organization';
import { githubClient } from './client';

export type User = components['schemas']['public-user'];

export class UserModel extends BaseModel {
    client = githubClient;

    @observable
    accessor session: User | undefined;

    @computed
    get organizationStore() {
        return new OrganizationModel(this.session?.login);
    }

    @computed
    get namespaces() {
        return [this.session, ...this.organizationStore.allItems].filter(
            Boolean
        );
    }

    @toggle('downloading')
    async getSession() {
        if (this.session) return this.session;

        const { body } = await this.client.get<User>('user');

        this.session = body;

        await this.organizationStore.getAll();

        return body!;
    }
}
