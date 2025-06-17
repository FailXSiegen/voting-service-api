import startServer from "./server/server";
import CommandManager from "./command/command-manager";
import closeAsyncEventsCommand from "./command/close-async-events-command";
import eventCleanupCommand from "./command/event-cleanup-command";

startServer();

// Setup cron jobs.
const commandRegistry = new CommandManager();
commandRegistry.registerCommand(closeAsyncEventsCommand);
commandRegistry.registerCommand(eventCleanupCommand);
commandRegistry.setupSchedule();
