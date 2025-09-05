import { HTTPClient } from 'koajax';

export const githubClient = new HTTPClient({
    baseURI: 'https://api.github.com',
    responseType: 'json'
});

export interface BaseFilter {
    direction?: 'asc' | 'desc';
}
