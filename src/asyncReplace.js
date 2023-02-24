
import async from 'async'

export default async function asyncReplace(str, regexp, replacer) {
  const replacementArgs = []
  const replacementValues = []

  function replacerSync(...args) {
    // Each time this runs, a new task is created
    replacementArgs.push(args)
  }

  // This first replace registers a bunch of async tasks.
  str.replace(regexp, replacerSync)

  await async.eachSeries(replacementArgs, async (args) => {
    replacementValues.push(await replacer(...args))
  })

  const result = str.replace(regexp, () => {
    return replacementValues.shift()
  })

  return result
}