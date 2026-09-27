#!/usr/bin/env -S node --import tsx

import { Command } from "commander";

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

const API_URL = "http://localhost:3000";

async function fetchCommands(search?: string): Promise<DevCommand[]> {
  const url = search
    ? `${API_URL}/commands?search=${encodeURIComponent(search)}`
    : `${API_URL}/commands`;

  try {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`API returned ${response.status}`);
    }

    return (await response.json()) as DevCommand[];
  } catch {
    console.error(
      `Could not connect to the Dev Library API at ${API_URL}.`,
    );
    console.error("Make sure the API is running.");
    process.exit(1);
  }
}

function printCommands(commands: DevCommand[]) {
  if (commands.length === 0) {
    console.log("No commands found.");
    return;
  }

  for (const command of commands) {
    const tags = command.tags.map((tag) => tag.name).join(", ");

    console.log(command.title);
    console.log(`  ${command.command}`);

    if (tags) {
      console.log(`  Tags: ${tags}`);
    }

    console.log();
  }
}

const program = new Command();

program
  .name("devlib")
  .description("Dev Library CLI")
  .version("0.1.0");

program
  .command("list")
  .description("List saved commands")
  .action(async () => {
    const commands = await fetchCommands();
    printCommands(commands);
  });

program
  .command("search")
  .description("Search saved commands")
  .argument("<query>", "Search term")
  .action(async (query: string) => {
    const commands = await fetchCommands(query);
    printCommands(commands);
  });

program.parse();