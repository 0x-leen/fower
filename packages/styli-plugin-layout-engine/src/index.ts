import { StyliPlugin } from '@styli/types'
import { getFlexDirection } from '@styli/utils'

const toTop = 'toTop'
const toLeft = 'toLeft'
const toRight = 'toRight'
const toBottom = 'toBottom'

const toBetween = 'toBetween'
const toAround = 'toAround'
const toEvenly = 'toEvenly'
const toStretch = 'toStretch'

const toCenter = 'toCenter'
const toCenterX = 'toCenterX'
const toCenterY = 'toCenterY'

const flexStart = 'flex-start'
const flexEnd = 'flex-end'
const spaceBetween = 'space-between'
const spaceAround = 'space-around'
const spaceEvenly = 'space-evenly'
const center = 'center'

const layoutToolkits = [
  toLeft,
  toRight,
  toTop,
  toBottom,

  toCenter,
  toCenterX,
  toCenterY,

  toBetween,
  toAround,
  toEvenly,
  toStretch,
]

export function isMatch(key: string) {
  return layoutToolkits.includes(key)
}

/**
 * Get alignment style
 * 这里比较复杂
 * @param propKey
 * @param props
 * @returns
 */
export function alignmentPropToStyle(propKey: string, props: any) {
  if (propKey === 'direction') return
  const { toCenter } = props
  const direction = getFlexDirection(props)
  const style: any = {}

  let styleKey: 'justifyContent' | 'alignItems' = '' as any

  /** 根据 row 和 column 设置属性，这里比较复杂 */
  if (direction.startsWith('row')) {
    if ([toLeft, toRight, toCenterX, toBetween, toAround, toEvenly].includes(propKey)) {
      styleKey = 'justifyContent'
    }

    if ([toTop, toBottom, toCenterY, toStretch].includes(propKey)) {
      styleKey = 'alignItems'
    }
  } else {
    if ([toTop, toBottom, toCenterY, toBetween, toAround, toEvenly].includes(propKey)) {
      styleKey = 'justifyContent'
    }
    if ([toLeft, toRight, toCenterX, toStretch].includes(propKey)) {
      styleKey = 'alignItems'
    }
  }

  /** 设置样式 */
  if ([toTop, toLeft].includes(propKey)) {
    style[styleKey] = flexStart
  } else if ([toBottom, toRight].includes(propKey)) {
    style[styleKey] = flexEnd
  } else if ([toCenterX, toCenterY].includes(propKey)) {
    style[styleKey] = center
  } else if (propKey === toBetween) {
    style[styleKey] = spaceBetween
  } else if (propKey === toAround) {
    style[styleKey] = spaceAround
  } else if (propKey === toEvenly) {
    style[styleKey] = spaceEvenly
  } else if (propKey === toStretch) {
    style[styleKey] = spaceEvenly
  }

  if (toCenter) {
    style.justifyContent = center
    style.alignItems = center
  }

  return style
}

export default (): StyliPlugin => {
  return {
    name: 'styli-plugin-layout-engine',
    isMatch,
    onAtomStyleCreate(atom, sheet) {
      atom.style = alignmentPropToStyle(atom.propKey, sheet.props)

      // if ([toLeft, toRight, toTop, toBottom, toCenterX, toCenterY].includes(atom.propKey)) {
      //   const direction = getDirection(sheet.props)
      //   atom.className = direction + '-' + atom.propKey
      //   atom.cache = false
      // }
      return atom
    },

    // TODO: 需要优化
    onStyleCreate(sheet) {
      if (!sheet.atoms || !sheet.atoms.length) return

      const matched = sheet.atoms.find(
        (i) =>
          i.matchedPlugin === 'styli-plugin-flexbox' ||
          i.matchedPlugin === 'styli-plugin-layout-engine',
      )

      if (!matched) return

      const direction = getFlexDirection(sheet.props)

      const prefix = 'flexDirection-'

      const directionAtom = sheet.atoms.find((i) => i.propKey === prefix + direction)

      if (!directionAtom) {
        sheet.atoms.push({
          key: prefix + direction,
          propKey: prefix + direction,
          propValue: '',
          className: prefix + direction,
          type: 'style',
          style: { flexDirection: direction as any },
        })
      }

      const displayAtom = sheet.atoms.find((i) => i.matchedPlugin === 'styli-plugin-display')

      if (!displayAtom) {
        sheet.atoms.push({
          key: 'display-flex',
          propKey: 'display-flex',
          propValue: '',
          className: 'display-flex',
          type: 'style',
          cache: true,
          matchedPlugin: 'styli-plugin-display',
          style: { display: 'flex' },
        })
      }
    },
  }
}
