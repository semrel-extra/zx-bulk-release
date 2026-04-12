import {path} from 'zx-extra'
import {parcelChannel} from './directive.js'

export const verifyParcels = (tars, context) => {
  const {sha7, packages: expected} = context
  const errors = []
  const verified = []

  for (const tarPath of tars) {
    const name = path.basename(tarPath)

    if (!name.startsWith(`parcel.${sha7}.`)) {
      errors.push(`sha mismatch: ${name}`)
      continue
    }

    const channel = parcelChannel(name)
    if (!channel) {
      errors.push(`malformed name: ${name}`)
      continue
    }

    if (channel === 'directive') {
      verified.push(tarPath)
      continue
    }

    const belongsTo = Object.entries(expected).find(([, pkg]) =>
      pkg.tag && name.includes(`.${pkg.tag}.`)
    )
    if (!belongsTo) {
      errors.push(`unexpected parcel (no matching package): ${name}`)
      continue
    }

    const [pkgName, pkg] = belongsTo
    if (!pkg.channels.includes(channel)) {
      errors.push(`unexpected channel '${channel}' for ${pkgName}: ${name}`)
      continue
    }

    verified.push(tarPath)
  }

  return {verified, errors}
}
