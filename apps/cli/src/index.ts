import { Command } from "commander";

const program = new Command();

program
  .name("dev")
  .description("Dev Library CLI")
  .version("0.1.0");

program.parse();