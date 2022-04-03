import { toggleUserOnlineStateByRequestToken } from '../repository/event-user-repository'
import { pubsub } from './graphql'

export default function (request, response, test) {
  const headers = {
    'Content-Type': 'text/event-stream',
    Connection: 'keep-alive',
    'Cache-Control': 'no-cache'
  }
  response.writeHead(200, headers)

  // On connect.
  toggleEventUserConnectionStatus(request, true)

  request.socket.on('end', function () {
    // On disconnect.
    toggleEventUserConnectionStatus(request, false)
  })
}

function toggleEventUserConnectionStatus (request, onlineState) {
  if (!request.cookies.refreshToken) {
    return
  }

  toggleUserOnlineStateByRequestToken(request.cookies.refreshToken, onlineState).then((tokenRecord) => {
    if (!tokenRecord) {
      return
    }
    pubsub.publish('eventUserLifeCycle', {
      online: onlineState,
      eventUserId: tokenRecord.eventUserId
    })
  }).catch(error => console.error(error))
}
