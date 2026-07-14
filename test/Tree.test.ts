import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { TreeModel } from '../source/Tree';

const owner = 'idea2app';
const repository = 'MobX-GitHub';

describe('Tree model', () => {
    it('should load tree entries from GitHub API with getOne()', async () => {
        const model = new TreeModel(owner, repository);

        const { tree } = await model.getOne('HEAD');

        assert.ok(tree.length > 0);
        assert.ok(
            tree.some(({ path, type }) => path === 'package.json' && type === 'blob'),
            'should contain package.json'
        );
        assert.ok(
            tree.some(({ path, type }) => path === 'source' && type === 'tree'),
            'should contain source directory'
        );
    });

    it('should load unique tree entries with getAll()', async () => {
        const model = new TreeModel(owner, repository);

        const list = await model.getAll();

        assert.ok(list.length > 0);
        assert.equal(model.totalCount, list.length);
        assert.equal(
            new Set(list.map(({ path }) => path)).size,
            list.length,
            'all returned paths should be unique'
        );
    });

    it('should respect path filter with getAll()', async () => {
        const model = new TreeModel(owner, repository);

        const list = await model.getAll({ path: 'source/' });

        assert.ok(list.length > 0);
        assert.ok(list.every(({ path }) => path!.startsWith('source/')));
        assert.ok(list.some(({ path }) => path!.endsWith('.ts')));
    });

    it('should return empty list for missing path with getAll()', async () => {
        const model = new TreeModel(owner, repository);

        const list = await model.getAll({ path: '__path_not_exists__/' });

        assert.equal(list.length, 0);
    });
});
