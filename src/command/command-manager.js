import cron from "node-cron";

export default class CommandManager {
  constructor() {
    this.commands = [];
  }
  registerCommand(command) {
    this.commands.push(command);
  }
  setupSchedule() {
    if (this.commands.length === 0) {
      console.info("[Cron] There are no registered commands to schedule.");
    }
    this.commands.forEach((command) => {
      if (!command.active) {
        return;
      }
      console.info(`[Cron] Schedule command ${command.name}`);
      cron.schedule(command.interval, command.execute, command?.options || {});
    });
  }
}
