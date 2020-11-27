import 'dotenv/config'
import 'regenerator-runtime'
import parseArgs from 'minimist'
import { create, update, findOneByEmail } from '../repository/organizer-repository.js'

(async () => {
  const argv = parseArgs(process.argv.slice(2))

  // Build organizer object by arguments.
  const organizer = {
    username: argv.username || null,
    email: argv.email || null,
    password: (argv.password || '').toString(),
    publicName: argv['public-name'] || null
  }

  // Validate organizer object.
  if (organizer.username === null) {
    console.error('Missing argument value of "--email".')
  }
  if (organizer.email === null) {
    console.error('Missing argument value of "--username".')
  }
  if (organizer.password === null) {
    console.error('Missing argument value of "--password".')
  }
  if (organizer.publicName === null) {
    console.error('Missing argument value of "--public-name".')
  }

  // Validate email for uniqueness and create new organizer
  const existingUser = await findOneByEmail(organizer.email)
  if (existingUser) {
    await update(organizer)
    console.log('Successfully registered updated organizer')
  } else {
    await create(organizer)
    console.log('Successfully registered new organizer')
  }
})().catch((error) => {
  console.log('An error occurred while trying to register a new organizer')
  console.error(error)
})
