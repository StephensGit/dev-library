#!/usr/bin/env node

import { Command } from 'commander';

type Tag = {
  id: number;
  name: string;
};

type DevCommand = {
  id: number;
  title: string;
  command: string;
  description: string | null;
  tags: Tag[];
};

const API_URL = 'http://localhost:3000';

async function fetchCommands(search?: string): Promise<DevCommand[]> {
  const url = search ? `${API_URL}/commands?search=${encodeURIComponent(search)}` : `${API_URL}/commands`;

  let response: Response;

  try {
    response = await fetch(url);
  } catch {
    console.error(`Could not connect to the Dev Library API at ${API_URL}.`);
    console.error('Make sure the API is running.');
    process.exit(1);
  }

  // The API needs a login session, and the CLI can't log in yet (see README).
  if (response.status === 401) {
    console.error('The Dev Library API now requires you to log in, and CLI login is not available yet.');
    console.error('Use the web app for now.');
    process.exit(1);
  }

  if (!response.ok) {
    console.error(`The Dev Library API at ${API_URL} returned status ${response.status}.`);
    process.exit(1);
  }

  return (await response.json()) as DevCommand[];
}

function printCommands(commands: DevCommand[]) {
  if (commands.length === 0) {
    console.log('No commands found.');
    return;
  }

  for (const command of commands) {
    const tags = command.tags.map((tag) => tag.name).join(', ');

    console.log(command.title);
    console.log(`  ${command.command}`);

    if (tags) {
      console.log(`  Tags: ${tags}`);
    }

    console.log();
  }
}

const program = new Command();

program.name('devlib').description('Dev Library CLI').version('0.1.0');

program
  .command('list')
  .description('List saved commands')
  .action(async () => {
    const commands = await fetchCommands();
    printCommands(commands);
  });

program
  .command('search')
  .description('Search saved commands')
  .argument('<query>', 'Search term')
  .action(async (query: string) => {
    const commands = await fetchCommands(query);
    printCommands(commands);
  });

program.parse();
