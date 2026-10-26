// Tests use their own database because they empty every table between tests.
// TEST_DATABASE_URL wins; otherwise it's DATABASE_URL with "_test" added to the database name.
export function testDatabaseUrl() {
  const raw = process.env.TEST_DATABASE_URL ?? withTestSuffix(process.env.DATABASE_URL);
  const name = new URL(raw).pathname.slice(1);

  // A guard against ever pointing the tests at the development database.
  if (!/^[a-z0-9_]+_test$/.test(name)) {
    throw new Error(`Refusing to run tests against database "${name}": its name must end in _test.`);
  }

  return raw;
}

function withTestSuffix(databaseUrl: string | undefined) {
  if (!databaseUrl) {
    throw new Error('Set DATABASE_URL or TEST_DATABASE_URL to run the tests.');
  }

  const url = new URL(databaseUrl);
  url.pathname = `${url.pathname}_test`;
  return url.toString();
}
