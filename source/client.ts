import { HTTPClient } from 'koajax';

export const githubPublic = new HTTPClient({
    baseURI: 'https://api.github.com',
    responseType: 'json'
});
