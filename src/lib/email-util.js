import nodemailer from "nodemailer";
import { pugEngine } from "nodemailer-pug-engine";

export default {
  transport: null,
  async init() {
    if (process.env.NODE_ENV !== "development") {
      let config = {
        host: process.env.MAIL_HOST,
        port: process.env.MAIL_PORT,
        pool: process.env.MAIL_USE_POOL === "1",
        secure: process.env.MAIL_PORT === "465", // SSL for port 465, STARTTLS for 587
        requireTLS: process.env.MAIL_USE_TLS === "1",
      };

      // Add auth if needed.
      if (process.env.MAIL_USE_AUTH === "1") {
        config = Object.assign(config, {
          auth: {
            user: process.env.MAIL_AUTH_USER,
            pass: process.env.MAIL_AUTH_PASS,
          },
        });
      }
      this.transport = nodemailer.createTransport(config);
    }
    // Create mailer for development
    if (process.env.NODE_ENV === "development") {
      this.transport = nodemailer.createTransport({
        port: 1025,
      });
    }

    await this.transport.verify((error) => {
      if (error) {
        console.error(
          "[ERROR] Server is unable to send mails. Error message: " +
            error.message,
        );
        return;
      }
      console.info("[INFO] Server is ready to send mails.");
    });
    this.transport.use(
      "compile",
      pugEngine({
        templateDir: __dirname + "/emails",
        pretty: true,
      }),
    );
  },
  async sendMail(config) {
    if (!this.transport) {
      await this.init();
    }
    await this.transport.sendMail(config, function (error, info) {
      if (error) {
        console.error(
          "[ERROR] Server is unable to send mails. Error message: " +
            error.message,
        );
      }
      if (info && process.env.ENABLE_DEBUG === "1") {
        console.debug(info);
      }
    });
  },
};
