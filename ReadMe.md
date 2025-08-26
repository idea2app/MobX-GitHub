# MobX-GitHub

[MobX][1] SDK for [GitHub RESTful API][2], which is based on [MobX-RESTful][3].

[![MobX compatibility](https://img.shields.io/badge/Compatible-1?logo=mobx&label=MobX%206%2F7)][1]
[![NPM Dependency](https://img.shields.io/librariesio/release/npm/mobx-github)][4]
[![CI & CD](https://github.com/idea2app/MobX-GitHub/actions/workflows/main.yml/badge.svg)][5]

[![NPM](https://nodei.co/npm/mobx-github.png?downloads=true&downloadRank=true&stars=true)][6]

## Model

1. [User](source/User.ts)
2. [Organization](source/Organization.ts)
3. [Repository](source/Repository.ts)
    1. Contributor
    2. Language
    3. Issue
4. [Content](source/Content.ts) - Git file tree traversal
    1. Directory traversal
    2. Recursive tree traversal
    3. File search by extension
    4. File search by pattern

## Usage

### Installation

```shell
npm i mobx-github
```

### `tsconfig.json`

```json
{
    "compilerOptions": {
        "target": "ES6",
        "moduleResolution": "Node",
        "useDefineForClassFields": true,
        "experimentalDecorators": false,
        "jsx": "react-jsx"
    }
}
```

### `model/GitHub.ts`

````typescript
import { githubClient, UserModel, ContentModel } from 'mobx-github';

// Any possible way to pass GitHub access token
// from local files or back-end servers to Web pages
const token = new URLSearchParams(location.search).get('token');

githubClient.use(({ request }, next) => {
    if (token)
        request.headers = {
            authorization: `Bearer ${token}`,
            ...request.headers
        };
    return next();
});

export const userStore = new UserModel();

### `page/GitHub.tsx`

Use [WebCell][7] as an Example

```tsx
import { component, observer } from 'web-cell';

import { userStore } from '../model/GitHub';

@component({ tagName: 'github-page' })
@observer
export class GitHubPage extends HTMLElement {
    connectedCallback() {
        userStore.getSession();
    }

    disconnectedCallback() {
        userStore.clear();
    }

    render() {
        const { namespaces } = userStore;

        return (
            <select>
                {namespaces.map(({ login }) => (
                    <option key={login}>{login}</option>
                ))}
            </select>
        );
    }
}
````

[1]: https://mobx.js.org/
[2]: https://docs.github.com/en/rest
[3]: https://github.com/idea2app/MobX-RESTful
[4]: https://libraries.io/npm/mobx-github
[5]: https://github.com/idea2app/MobX-GitHub/actions/workflows/main.yml
[6]: https://nodei.co/npm/mobx-github/
[7]: https://github.com/EasyWebApp/WebCell
