import type { JiraDeployment } from './client';

// Spec section 8 call table, with the Jira Cloud differences of section 8.2.
const enc = encodeURIComponent;

export const JIRA = {
  myself: () => '/rest/api/2/myself',
  projects: () => '/rest/api/2/project',
  issueTypes: (projectKey: string, startAt: number) =>
    `/rest/api/2/issue/createmeta/${enc(projectKey)}/issuetypes?startAt=${String(startAt)}&maxResults=50`,
  fields: (projectKey: string, issueTypeId: string, startAt: number) =>
    `/rest/api/2/issue/createmeta/${enc(projectKey)}/issuetypes/${enc(issueTypeId)}?startAt=${String(startAt)}&maxResults=100`,
  priorities: () => '/rest/api/2/priority',
  assignable: (deployment: JiraDeployment, projectKey: string, text: string) =>
    `/rest/api/2/user/assignable/search?project=${enc(projectKey)}&${deployment === 'cloud' ? 'query' : 'username'}=${enc(text)}&maxResults=10`,
  search: (deployment: JiraDeployment) =>
    deployment === 'cloud' ? '/rest/api/3/search/jql' : '/rest/api/2/search',
  createIssue: () => '/rest/api/2/issue',
  attachments: (issueKey: string) => `/rest/api/2/issue/${enc(issueKey)}/attachments`,
} as const;
