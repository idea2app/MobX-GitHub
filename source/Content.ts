import { components } from '@octokit/openapi-types';
import { Filter, ListModel, NewData, Stream, toggle } from 'mobx-restful';
import { encodeBase64, makeArray } from 'web-utility';

import { githubClient } from './client';

export type Content = components['schemas']['content-directory'][number] & {
    parent_path?: string;
};

interface ContentResponse {
    content: Content;
    commit: components['schemas']['commit'];
}

export class ContentModel extends Stream<Content>(ListModel) {
    client = githubClient;

    constructor(
        public owner: string,
        public repository: string
    ) {
        super();
        this.baseURI = `repos/${owner}/${repository}/contents`;
    }

    /**
     * Get repository content at a specific path
     *
     * @see {@link https://docs.github.com/en/rest/repos/contents#get-repository-content}
     */
    @toggle('downloading')
    async getOne(path: string) {
        const { body } = await this.client.get<Content | Content[]>(`${this.baseURI}/${path}`);

        return Array.isArray(body) ? body[0] : body!;
    }

    @toggle('uploading')
    async updateOne({ content }: NewData<Content>, path: string, message = `[update] ${path}`) {
        try {
            var { sha } = await this.getOne(path);
        } catch {}

        const { body } = await this.client.put<ContentResponse>(`${this.baseURI}/${path}`, {
            sha,
            message,
            content: encodeBase64(content)
        });
        return body!.content;
    }

    async *openStream({ path, name }: Filter<Content>) {
        const setCount = (total: number) => (this.totalCount = total);

        const namePattern = name && new RegExp(name);

        const stream = path
            ? this.traverseChildren(path, setCount)
            : this.traverseTree(undefined, setCount);

        for await (const content of stream)
            if (!namePattern || namePattern.test(content.name)) yield content;
    }

    /**
     * Get direct children of a directory
     */
    async *traverseChildren(
        parentPath = '',
        onCount: (total: number) => any = () => {}
    ): AsyncGenerator<Content> {
        const { body } = await this.client.get<Content[]>(`${this.baseURI}/${parentPath}`);
        const contents = makeArray(body);

        onCount(contents.length);

        for (const content of contents) {
            content.parent_path = parentPath;

            yield content;
        }
    }

    /**
     * Recursively traverse the entire file tree
     */
    async *traverseTree(
        parentContent?: Content,
        onCount?: (total: number) => any
    ): AsyncGenerator<Content> {
        let totalCount = 0;

        const addCount = (total: number) => (totalCount += total);

        const stream = this.traverseChildren(parentContent?.path || '', addCount);

        for await (const content of stream) {
            yield content;

            if (content.type === 'dir') yield* this.traverseTree(content, addCount);
        }
        onCount?.(totalCount);
    }
}
