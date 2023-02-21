//

import 'history-events'
export * as qss from 'qss'
import { reactive } from './reactivity.mjs'

const push = (path, options) => {
  const { search, state, hash } = options ?? {}
  let url = path
  if (search) {
    url += qss.encode(search)
  }
  if (hash) {
    url += `#${hash}`
  }
  window.history.pushState(state, '', url)
}

export const history = reactive({
  location: {
    ...window.location,
  },
  push,
  clearSearch: () => {
    push(window.location.pathname)
  },
})

window.addEventListener('changestate', () => {
  history.location = { ...window.location }
})
