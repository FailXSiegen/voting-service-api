import loginRequest from '../request/login'
import loginRefreshRequest from '../request/login/refresh'
import requestVerifyPassword from '../request/login/verify-password'
import verifySlug from '../request/event/verify-slug'
import downloadPollResultCsv from '../request/event/export-results'
import validateOrganizerHashRequest from '../request/organizer/validate-hash'
import requestPasswordForgot from '../request/organizer/password-forgot'
import updateOrganizerPassword from '../request/organizer/update-password'
import logoutRequest from '../request/logout'
import createOrganizer from '../request/organizer/create'
import cleanUp from '../request/cleanup'

export default function (app) {
  app.post('/login', async (req, res) => {
    await loginRequest(req, res)
  })
  app.post('/login/refresh', async (req, res) => {
    await loginRefreshRequest(req, res)
  })
  app.post('/login/password-verify', async (req, res) => {
    await requestVerifyPassword(req, res)
  })
  app.post('/event/verify-slug', async (req, res) => {
    await verifySlug(req, res)
  })
  app.post('/event/export-results', async (req, res) => {
    await downloadPollResultCsv(req, res)
  })
  app.post('/organizer/validate-hash', async (req, res) => {
    await validateOrganizerHashRequest(req, res)
  })
  app.post('/organizer/password-forgot', async (req, res) => {
    await requestPasswordForgot(req, res)
  })
  app.post('/organizer/update-password', async (req, res) => {
    await updateOrganizerPassword(req, res)
  })
  app.get('/logout', async (req, res) => {
    await logoutRequest(req, res)
  })
  app.post('/create', async (req, res) => {
    await createOrganizer(req, res)
  })
  app.post('/cleanup', async (req, res) => {
    await cleanUp(req, res)
  })
}
