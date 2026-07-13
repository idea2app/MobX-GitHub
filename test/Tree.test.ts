import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { Tree, TreeModel } from '../source/Tree';

const owner = 'idea2app';
const repository = 'MobX-GitHub';

describe('TreeModel', () => {
    it('getOne() should load tree entries from GitHub API', async () => {
        const model = new TreeModel(owner, repository);
        const { tree } = await model.getOne('HEAD', true);

        assert.ok(tree.length > 0);
        assert.ok(
            tree.some(({ path, type }) => path === 'package.json' && type === 'blob'),
            'should contain package.json'
        );
        assert.ok(
            tree.some(({ path, type }) => path === 'source/index.ts' && type === 'blob'),
            'should contain source/index.ts'
        );
    });

    it('getAll() should respect path filter', async () => {
        const model = new TreeModel(owner, repository);
        const filter: Partial<Tree> = { path: 'source/' };
        const list = await model.getAll(filter);

        assert.ok(list.length > 0);
        assert.ok(list.every(({ path }) => path.startsWith('source/')));
        assert.ok(list.some(({ path }) => path.endsWith('.ts')));
        assert.ok(model.totalCount >= list.length);
    });

    it('getAll() should return empty list for missing path', async () => {
        const model = new TreeModel(owner, repository);
        const list = await model.getAll({ path: '__path_not_exists__/' });

        assert.equal(list.length, 0);
    });
});
