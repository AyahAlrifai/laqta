import { MockJira } from './mock-jira';

// Standalone mock Jira for manual runs and E2E: `pnpm --filter @laqta/app mock-jira`.
const port = Number(process.env.PORT ?? 4545);
const mock = new MockJira();
mock.config.token = process.env.MOCK_JIRA_TOKEN ?? 'e2e-token';
void mock.start(port).then((url) => {
  console.log(`mock Jira listening on ${url}`);
});
