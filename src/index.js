import startServer from "./server/server";
import CommandManager from "./command/command-manager";
import closeAsyncEventsCommand from "./command/close-async-events-command";

startServer();

// Setup cron jobs.
const commandRegistry = new CommandManager();
commandRegistry.registerCommand(closeAsyncEventsCommand);
commandRegistry.setupSchedule();
