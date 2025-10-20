import loginRequest from "../request/login";
import loginRefreshRequest from "../request/login/refresh";
import requestVerifyPassword from "../request/login/verify-password";
import verifySlug from "../request/event/verify-slug";
import downloadPollResultCsv from "../request/event/export-results";
import downloadVoteAdjustmentsCsv from "../request/event/export-vote-adjustments";
import validateOrganizerHashRequest from "../request/organizer/validate-hash";
import requestPasswordForgot from "../request/organizer/password-forgot";
import updateOrganizerPassword from "../request/organizer/update-password";
import logoutRequest from "../request/logout";
import createOrganizer from "../request/organizer/create";
import cleanUp from "../request/cleanup";
import fetchEventById from "../request/event/fetch-event";
import activateEventUserAuthToken from "../request/login/activate-event-user-auth-token";
import loginByEventUserAuthToken from "../request/login/login-by-event-user-auth-token";
import zoomAuthToken from "../request/zoom/zoom-auth-token";
import uploadMedia from "../request/media/upload-media";
import express from "express";
import path from "path";

export default function (app) {
  app.post("/login", async (req, res) => {
    await loginRequest(req, res);
  });
  app.post("/login/refresh", async (req, res) => {
    await loginRefreshRequest(req, res);
  });
  app.post("/login/password-verify", async (req, res) => {
    await requestVerifyPassword(req, res);
  });
  app.post("/login/activate-event-user-auth-token", async (req, res) => {
    await activateEventUserAuthToken(req, res);
  });
  app.post("/login/event-user-auth-token", async (req, res) => {
    await loginByEventUserAuthToken(req, res);
  });
  app.get("/event/:id", async (req, res) => {
    await fetchEventById(req, res);
  });
  app.post("/event/verify-slug", async (req, res) => {
    await verifySlug(req, res);
  });
  app.post("/event/export-results", async (req, res) => {
    await downloadPollResultCsv(req, res);
  });
  app.get("/event/:eventId/export-vote-adjustments", async (req, res) => {
    await downloadVoteAdjustmentsCsv(req, res);
  });
  app.post("/organizer/validate-hash", async (req, res) => {
    await validateOrganizerHashRequest(req, res);
  });
  app.post("/organizer/password-forgot", async (req, res) => {
    await requestPasswordForgot(req, res);
  });
  app.post("/organizer/update-password", async (req, res) => {
    await updateOrganizerPassword(req, res);
  });
  app.get("/logout", async (req, res) => {
    await logoutRequest(req, res);
  });
  app.post("/organizer/create", async (req, res) => {
    await createOrganizer(req, res);
  });
  app.post("/cleanup", async (req, res) => {
    await cleanUp(req, res);
  });
  app.post("/zoom/auth/token", zoomAuthToken);
  
  // Media Upload und Verwaltung
  app.post("/media/upload", async (req, res) => {
    await uploadMedia(req, res);
  });
  
  // Static file serving für uploads (über persistentes Volume)
  const uploadBasePath = process.env.UPLOAD_BASE_PATH || '/app/uploads';
  app.use('/uploads', express.static(uploadBasePath));
}
