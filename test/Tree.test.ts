import assert from 'node:assert/strict';
import test from 'node:test';

import { Tree, TreeModel } from '../source/Tree';

const owner = 'idea2app';
const repository = 'MobX-GitHub';

const collect = async (filter: Partial<Tree> = {}) => {
    const model = new TreeModel(owner, repository);
    const list: Tree[] = [];

    for await (const item of model.openStream(filter)) list.push(item);

    return { list, model };
};

test('TreeModel#openStream() should load tree entries from GitHub API', async () => {
    const { list, model } = await collect();

    assert.ok(list.length > 0);
    assert.ok(
        list.some(({ path, type }) => path === 'package.json' && type === 'blob'),
        'should contain package.json'
    );
    assert.ok(
        list.some(({ path, type }) => path === 'source/index.ts' && type === 'blob'),
        'should contain source/index.ts'
    );
    assert.equal(model.totalCount, list.length);
    assert.equal(
        new Set(list.map(({ path }) => path)).size,
        list.length,
        'all returned paths should be unique'
    );
});

test('TreeModel#openStream() should respect path filter', async () => {
    const { list } = await collect({ path: 'source/' });

    assert.ok(list.length > 0);
    assert.ok(list.every(({ path }) => path.startsWith('source/')));
    assert.ok(list.some(({ path }) => path.endsWith('.ts')));
});
