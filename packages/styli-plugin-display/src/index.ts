import { Plugin } from '@styli/core'
import { kebab } from '@styli/utils'

export const displayTypes = ['hide', 'display', 'inline', 'inlineBlock', 'block', 'grid', 'table']

export function isDisplayKey(key: string) {
  return /^(hide|inline|inline[Bb]lock|block|grid|table)$|^display(-.+)?/.test(key)
}

export function displayPropToStyle(prop: string, propValue: any): any {
  if (prop == 'hide') return { display: 'none' }
  if (/^inline[Bb]lock$/) return { display: 'inline-block' }

  /** display */
  if (/^display(-.+)?/.test(prop)) {
    if (typeof propValue === 'string') return { display: propValue }

    return { display: kebab(prop.replace(/^display-/, '')) }
  }

  return { display: prop }
}

export default (): Plugin => {
  return {
    name: 'styli-plugin-display',
    isMatch: isDisplayKey,
    onVisitProp(atom) {
      atom.style = displayPropToStyle(atom.propKey, atom.propValue)
      return atom
    },
  }
}
