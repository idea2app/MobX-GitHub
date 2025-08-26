import { components } from '@octokit/openapi-types';
import { Filter, ListModel, Stream, toggle } from 'mobx-restful';
import { makeArray } from 'web-utility';

import { githubClient } from './client';

export type Content = components['schemas']['content-directory'][number];
export type ContentFile = components['schemas']['content-file'];

export interface ContentFilter extends Filter<Content> {
    parent_path?: string;
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
     * @see {@link https://docs.github.com/en/rest/repos/contents#get-repository-content}
     */
    @toggle('downloading')
    async getOne(path: string) {
        const { body } = await this.client.get<Content | Content[]>(
            `${this.baseURI}/${path}`
        );
        return Array.isArray(body) ? body[0] : body!;
    }

    async *openStream({ path, name }: Filter<Content>) {
        const setCount = (total: number) => (this.totalCount = total);
        const namePattern = name ? new RegExp(name) : null;

        if (path) {
            for await (const content of this.traverseChildren(path, setCount)) {
                if (!namePattern || namePattern.test(content.name)) {
                    yield content;
                }
            }
        } else {
            for await (const content of this.traverseTree(
                undefined,
                setCount
            )) {
                if (!namePattern || namePattern.test(content.name)) {
                    yield content;
                }
            }
        }
    }

    /**
     * Get direct children of a directory
     */
    async *traverseChildren(
        parentPath = '',
        onCount: (total: number) => any = () => {}
    ): AsyncGenerator<Content> {
        const { body } = await this.client.get<Content[]>(
            `${this.baseURI}/${parentPath}`
        );
        const contents = makeArray(body);

        onCount(contents.length);

        yield* contents;
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

        const stream = this.traverseChildren(
            parentContent?.path || '',
            addCount
        );

        for await (const content of stream) {
            yield content;

            if (content.type === 'dir')
                yield* this.traverseTree(content, addCount);
        }

        onCount?.(totalCount);
    }
}
