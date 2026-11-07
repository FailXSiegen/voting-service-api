import loginRequest from '../request/login';
import loginRefreshRequest from '../request/login/refresh';
import requestVerifyPassword from '../request/login/verify-password';
import verifySlug from '../request/event/verify-slug';
import downloadPollResultCsv from '../request/event/export-results';
import downloadVoteAdjustmentsCsv from '../request/event/export-vote-adjustments';
import validateOrganizerHashRequest from '../request/organizer/validate-hash';
import requestPasswordForgot from '../request/organizer/password-forgot';
import updateOrganizerPassword from '../request/organizer/update-password';
import logoutRequest from '../request/logout';
import createOrganizer from '../request/organizer/create';
import cleanUp from '../request/cleanup';
import fetchEventById from '../request/event/fetch-event';
import activateEventUserAuthToken from '../request/login/activate-event-user-auth-token';
import loginByEventUserAuthToken from '../request/login/login-by-event-user-auth-token';
import loginByShortlink from '../request/login/login-by-shortlink';
import zoomAuthToken from '../request/zoom/zoom-auth-token';
import uploadMedia from '../request/media/upload-media';
import redirectShortlink from '../request/shortlink/redirect';
import resolveShortlink from '../request/shortlink/resolve';
import express from 'express';
import { canAccessEventAsOrganizer } from '../graphql/authorize';
import { lookup } from '../graphql/authorize-lookup';

// SEC-17: authenticate.js setzt req.user (JWT geprüft), hier die Rechte je Route.
const isOrganizer = (req) => process.env.ENABLE_JWT !== '1' || req.user?.type === 'organizer';
const forbidden = (res) => res.status(403).json({ error: 'Not authorized.' });

export default function (app) {
  app.post('/login', async (req, res) => {
    await loginRequest(req, res);
  });
  app.post('/login/refresh', async (req, res) => {
    await loginRefreshRequest(req, res);
  });
  app.post('/login/password-verify', async (req, res) => {
    await requestVerifyPassword(req, res);
  });
  app.post('/login/activate-event-user-auth-token', async (req, res) => {
    await activateEventUserAuthToken(req, res);
  });
  app.post('/login/event-user-auth-token', async (req, res) => {
    await loginByEventUserAuthToken(req, res);
  });
  app.post('/login/shortlink', async (req, res) => {
    await loginByShortlink(req, res);
  });
  app.get('/event/:id', async (req, res) => {
    await fetchEventById(req, res);
  });
  app.post('/event/verify-slug', async (req, res) => {
    await verifySlug(req, res);
  });
  app.post('/event/export-results', async (req, res) => {
    if (!(await canAccessEventAsOrganizer(req.body?.eventId, req.user, lookup)))
      return forbidden(res);
    await downloadPollResultCsv(req, res);
  });
  app.get('/event/:eventId/export-vote-adjustments', async (req, res) => {
    if (!(await canAccessEventAsOrganizer(req.params.eventId, req.user, lookup)))
      return forbidden(res);
    await downloadVoteAdjustmentsCsv(req, res);
  });
  app.post('/organizer/validate-hash', async (req, res) => {
    await validateOrganizerHashRequest(req, res);
  });
  app.post('/organizer/password-forgot', async (req, res) => {
    await requestPasswordForgot(req, res);
  });
  app.post('/organizer/update-password', async (req, res) => {
    await updateOrganizerPassword(req, res);
  });
  // SEC-44: POST bevorzugt; GET bleibt für den bestehenden Client, beide nur vom eigenen Site.
  app.get('/logout', async (req, res) => {
    await logoutRequest(req, res);
  });
  app.post('/logout', async (req, res) => {
    await logoutRequest(req, res);
  });
  app.post('/organizer/create', async (req, res) => {
    await createOrganizer(req, res);
  });
  app.post('/cleanup', async (req, res) => {
    if (!isOrganizer(req) || !(await lookup('isSuperOrganizer', req.user?.id)))
      return forbidden(res);
    await cleanUp(req, res);
  });
  app.post('/zoom/auth/token', async (req, res) => {
    await zoomAuthToken(req, res);
  });

  // Media Upload und Verwaltung
  // SEC-20: nur Organizer mit CMS-Recht (canEditContent) oder Super-Admin.
  app.post('/media/upload', async (req, res) => {
    const organizer = req.user?.organizer;
    if (
      process.env.ENABLE_JWT === '1' &&
      !(isOrganizer(req) && (organizer?.canEditContent || organizer?.superAdmin))
    ) {
      return forbidden(res);
    }
    await uploadMedia(req, res);
  });

  // Static file serving für uploads (über persistentes Volume).
  // SEC-20: kein MIME-Sniffing, und falls doch HTML/SVG im Verzeichnis liegt: Sandbox ohne Skripte.
  const uploadBasePath = process.env.UPLOAD_BASE_PATH || '/app/uploads';
  app.use(
    '/uploads',
    express.static(uploadBasePath, {
      index: false,
      dotfiles: 'deny',
      redirect: false,
      setHeaders: (res) => {
        res.set('X-Content-Type-Options', 'nosniff');
        res.set(
          'Content-Security-Policy',
          "default-src 'none'; style-src 'unsafe-inline'; sandbox"
        );
      },
    })
  );

  // Shortlink API endpoint - returns JSON data for frontend to handle redirect
  app.get('/api/shortlink/:shortCode', async (req, res) => {
    await resolveShortlink(req, res);
  });

  // Legacy: Shortlink redirect with /s/ prefix (kept for backward compatibility)
  app.get('/s/:shortCode', async (req, res) => {
    await redirectShortlink(req, res);
  });
}
