import { components } from '@octokit/openapi-types';
import { Filter, ListModel, Stream, toggle } from 'mobx-restful';
import { makeArray } from 'web-utility';

import { githubClient } from './client';

export type ContentItem = components['schemas']['content-directory'][number];
export type ContentFile = components['schemas']['content-file'];

export interface ContentFilter extends Filter<ContentItem> {
    parent_path?: string;
}

export interface ContentItemWithPath extends ContentItem {
    full_path?: string;
}

export class ContentModel extends Stream<ContentItemWithPath>(ListModel) {
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
        const { body } = await this.client.get<ContentItem | ContentItem[]>(
            `${this.baseURI}/${path}`
        );
        return Array.isArray(body) ? body[0] : body!;
    }

    async *openStream({ parent_path }: ContentFilter) {
        const setCount = (total: number) => (this.totalCount = total);

        yield* parent_path
            ? this.traverseChildren(parent_path, setCount)
            : this.traverseTree(undefined, setCount);
    }

    /**
     * Get direct children of a directory
     */
    async *traverseChildren(
        parent_path = '',
        onCount: (total: number) => any = () => {}
    ): AsyncGenerator<ContentItemWithPath> {
        try {
            const { body } = await this.client.get<ContentItem[]>(
                `${this.baseURI}/${parent_path}`
            );
            const contents = makeArray(body);

            onCount(contents.length);

            for (const item of contents) {
                const contentWithPath: ContentItemWithPath = {
                    ...item,
                    full_path: parent_path
                        ? `${parent_path}/${item.name}`
                        : item.name
                };
                yield contentWithPath;
            }
        } catch (error) {
            console.warn(
                `Failed to get contents for path: ${parent_path}`,
                error
            );
            onCount(0);
        }
    }

    /**
     * Recursively traverse the entire file tree
     */
    async *traverseTree(
        parentContent?: ContentItemWithPath,
        onCount?: (total: number) => any
    ): AsyncGenerator<ContentItemWithPath> {
        let totalCount = 0;

        const addCount = (total: number) => (totalCount += total);

        const stream = this.traverseChildren(
            parentContent?.path || '',
            addCount
        );

        for await (const content of stream) {
            // Clean up the name for safer path handling
            const safeName = content.name.replace(/[\\/:*?"<>|]+/g, '-').trim();

            content.full_path = parentContent
                ? `${parentContent.full_path}/${safeName}`
                : safeName;

            yield content;

            // If it's a directory, recursively traverse its contents
            if (content.type === 'dir') {
                yield* this.traverseTree(content, addCount);
            }
        }

        onCount?.(totalCount);
    }

    /**
     * Get all files in the repository (non-recursive)
     */
    async getDirectoryContents(path = '') {
        const results: ContentItemWithPath[] = [];
        for await (const item of this.traverseChildren(path)) {
            results.push(item);
        }
        return results;
    }

    /**
     * Get all files in the repository recursively
     */
    async getAllContents(path = '') {
        const results: ContentItemWithPath[] = [];
        const startContent = path
            ? ({
                  name: '',
                  path,
                  type: 'dir' as const,
                  full_path: path
              } as ContentItemWithPath)
            : undefined;

        for await (const item of this.traverseTree(startContent)) {
            results.push(item);
        }
        return results;
    }

    /**
     * Find files by extension
     */
    async *findByExtension(
        extension: string,
        startPath = ''
    ): AsyncGenerator<ContentItemWithPath> {
        const startContent = startPath
            ? ({
                  name: '',
                  path: startPath,
                  type: 'dir' as const,
                  full_path: startPath
              } as ContentItemWithPath)
            : undefined;

        const stream = this.traverseTree(startContent);

        for await (const content of stream) {
            if (
                content.type === 'file' &&
                content.name.endsWith(`.${extension}`)
            ) {
                yield content;
            }
        }
    }

    /**
     * Find files by name pattern
     */
    async *findByPattern(
        pattern: RegExp,
        startPath = ''
    ): AsyncGenerator<ContentItemWithPath> {
        const startContent = startPath
            ? ({
                  name: '',
                  path: startPath,
                  type: 'dir' as const,
                  full_path: startPath
              } as ContentItemWithPath)
            : undefined;

        const stream = this.traverseTree(startContent);

        for await (const content of stream) {
            if (content.type === 'file' && pattern.test(content.name)) {
                yield content;
            }
        }
    }
}
