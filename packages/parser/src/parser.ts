import { Atom, Options } from '@fower/atom'
import { store } from '@fower/store'
import { formatColor } from '@fower/color-helper'
import { styleSheet } from '@fower/sheet'
import { Props, PropItem } from '@fower/types'
import { parse } from '@fower/css-object-processor'
import {
  isEmptyObj,
  objectToClassName,
  jsKeyToCssKey,
  isPercentNumber,
  isNumber,
} from '@fower/utils'
import { isUnitProp } from './is-unit-prop'

type Dict = Record<string, any>

/**
 * @example p2,mx4,left10,spaceX4...
 * @example p-20,opacity-80
 */
export const digitReg =
  /^([mp][xytrbl]?|space[xy]?|top|right|bottom|left|[wh]|square|circle|min[hw]|max[hw]|opacity|delay|duration|translate[xyz]|scale[xy]?|rotate[xy]?|skew[xy]?|text|zIndex|leading|stroke|fontWeight|outlineOffset|order|flex(Grow|Shrink|Basis)?|(row|column)?Gap|gridTemplateColumns|border[trbl]?|rounded(Top(Left|Right)?|Right|Bottom(Left|Right)?|Left)?)(-?-?\d+[a-z]*?|-auto)$/i

//  high-frequency used props in react
const reactProps = ['children', 'onClick', 'onChange', 'onBlur', 'className', 'placeholder']

/**
 * An Abstract tool to handle atomic props
 */
export class Parser {
  constructor(public props = {} as Props) {
    this.traverseProps()

    if (store.config.autoDarkMode) {
      this.autoDarkMode()
    }
  }

  /**
   * atom parsed from props
   */
  atoms: Atom[] = []

  propList: PropItem[] = []

  get uniqueClassName() {
    return objectToClassName(Object.keys(this.props))
  }

  get hasResponsive() {
    return !!this.atoms.find((i) => !!i.meta.breakpoint)
  }

  get config(): any {
    return store.config
  }

  get plugins(): any[] {
    return store.config.plugins
  }

  digitPreprocessor(propItem: PropItem): PropItem {
    const spacings: any = store.config.theme.spacings
    if (!digitReg.test(propItem.key)) return propItem

    // is theme space key
    const isSpace = /^([a-z]+)(\d+)$/i.test(propItem.key)

    /**
     *  match props link: m4,mx2,mt9, spaceX4...
     *  to m4 -> [ key: m, value: 4 ]
     *  to m-20 -> [ key: m, value: 20 ]
     *  to m-20px -> [ key: m, value: '20px' ]
     */

    const keyStr = propItem.key.toString()
    const result =
      keyStr.match(/^([a-z]+)(\d+)$/i) ||
      keyStr.match(/^([a-z]*)-(-?\d+[a-z]*?)$/i) ||
      keyStr.match(/^([a-z]+)-(auto)$/i)

    if (!result) return propItem

    const [, newKey, newPropValue] = result

    propItem.key = newKey
    propItem.value = isSpace ? spacings[newPropValue.toLowerCase()] : newPropValue

    return propItem
  }

  postfixPreprocessor(propItem: PropItem): PropItem {
    const connector = '--'
    const specialPseudos = ['after', 'before', 'placeholder', 'selection']
    const { pseudos = [], theme } = store.config
    const { breakpoints, modes } = theme || {}

    const { propKey, propValue } = propItem

    const breakpointKeys = Object.keys(breakpoints)
    const modeKeys: string[] = modes || []
    const pseudoKeys: string[] = pseudos

    const regResponsiveStr = `${connector}(${breakpointKeys.join('|')})`
    const regModeStr = `${connector}(${modeKeys.join('|')})`
    const regPseudoStr = `${connector}(${pseudoKeys.join('|')})`

    const regMode = new RegExp(regModeStr)
    const regPseudo = new RegExp(regPseudoStr)
    const regResponsive = new RegExp(regResponsiveStr)
    const regImportant = /--i/i
    const regColorPostfix = /--[told](\d{1,2}|100)($|--)/i

    /** handle value like: bg="red500--T40", color="#666--O30" */
    if (regColorPostfix.test(propValue)) {
      const [colorName, postfix] = propValue.split('--')
      propItem.value = colorName
      propItem.meta.colorPostfix = postfix
    }

    const isMode = regMode.test(propKey)
    const isPseudo = regPseudo.test(propKey)
    const isResponsive = regResponsive.test(propKey)
    const isImportant = regImportant.test(propKey)
    const isColorPostfix = regColorPostfix.test(propKey)

    const hasPostfix = isMode || isPseudo || isResponsive || isImportant || isColorPostfix

    if (!hasPostfix) return this.digitPreprocessor(propItem)

    const result = propKey.split(connector)

    propItem.key = result[0] // key that already removed postfix

    if (isMode) {
      propItem.meta.mode = result.find((i) => modeKeys.includes(i))
    }

    if (isPseudo) {
      const pseudo = result.find((i) => pseudoKeys.includes(i)) as string
      const pseudoPrefix = specialPseudos.includes(pseudo) ? '::' : ':'
      propItem.meta.pseudo = pseudoPrefix + pseudo
    }

    if (isResponsive) {
      const breakpointType = result.find((i) => breakpointKeys.includes(i)) as string
      propItem.meta.breakpoint = (breakpoints as any)[breakpointType]
    }

    if (isImportant) {
      propItem.meta.important = !!result.find((i) => i === 'i')
    }

    if (isColorPostfix) {
      propItem.meta.colorPostfix = result.find((i) => regColorPostfix.test(`--${i}`))
    }

    // check is theme space key, if yes, preprocess it
    // this.digitPreprocessor(spacings)
    return this.digitPreprocessor(propItem)
  }

  preprocessProps(): PropItem[] {
    let propList: PropItem[] = []
    if (!this.props) return []

    if (this.props?.className) {
      for (const item of this.props.className.split(/\s+/)) {
        this.props[item] = true
      }
    }

    const { excludedProps = [] } = this.props
    for (const propKey in this.props) {
      if (!Reflect.has(this.props, propKey)) continue

      // the prop should be excluded by user setting
      if (excludedProps.includes(propKey)) continue

      if (reactProps.includes(propKey)) continue

      const propValue = this.props[propKey]

      if (!this.isValidProp(propKey, propValue)) continue

      let propItem = this.postfixPreprocessor({
        propKey,
        propValue,
        key: propKey,
        meta: {},
      } as PropItem)

      for (const plugin of this.plugins) {
        if (plugin.isMatch(propItem.key)) {
          if (plugin.beforeParseProps) {
            plugin.beforeParseProps(propItem, this)
          }

          this.propList.push(propItem)
          break
        }
      }
    }

    return propList
  }

  /**
   * traverse Props to init atoms
   */
  traverseProps(): void {
    if (isEmptyObj(this.props)) return

    const { pseudos = [], theme } = this.config
    const { breakpoints, modes } = theme || {}
    const breakpointKeys = Object.keys(breakpoints)
    const modeKeys: string[] = modes || []
    const pseudoKeys: string[] = pseudos

    this.preprocessProps()

    // traverse Props
    for (const item of this.propList) {
      const { propKey, propValue } = item

      // parse css prop
      if (propKey === 'css') {
        this.parseCSSObject(propValue)
        continue
      }

      /** handle _hover, _sm, _dark... */
      if (propKey.startsWith('_')) {
        const postfix = propKey.replace(/^_/, '')
        const obj = Array.isArray(propValue)
          ? propValue.reduce<any>((r, cur) => ({ ...r, [cur]: true }), {})
          : propValue

        if (modeKeys.includes(postfix)) {
          this.parseCSSObject(obj, { mode: postfix })
          continue
        }
        if (breakpointKeys.includes(postfix)) {
          this.parseCSSObject(obj, { breakpoint: breakpoints[postfix] })
          continue
        }
        if (pseudoKeys.includes(postfix)) {
          this.parseCSSObject(obj, { pseudo: ':' + postfix })
          continue
        }
      }

      const composition = store.compositions.get(propKey)

      if (composition) {
        this.parseCSSObject(composition, {})

        const atom = new Atom({ propKey, propValue })
        atom.handled = true
        atom.style = {}
        this.addAtom(atom)
        continue
      }

      let atom = new Atom(item)

      try {
        this.mutateAtom(atom)

        if (atom.handled) this.addAtom(atom)
      } catch (error) {
        continue
      }
    }

    for (const plugin of this.plugins) {
      if (plugin.afterAtomStyleCreate) {
        plugin.afterAtomStyleCreate(this)
      }
    }
  }

  autoDarkMode() {
    const colorMap: any = {
      white: 'black',
      black: 'white',
      '50': '900',
      '100': '800',
      '200': '700',
      '300': '600',
      '400': '500',
      '500': '400',
      '600': '300',
      '700': '200',
      '800': '100',
      '900': '50',
    }

    const colorKeys = ['color', 'backgroundColor', 'borderColor']
    const darkAtoms: Atom[] = []

    /** TODO: hack for auto dark mode, need to refactor */
    for (const atom of this.atoms) {
      if (colorKeys.includes(atom.type) && !atom.meta.mode) {
        const find = this.atoms.find((i) => colorKeys.includes(i.type) && i.meta.mode === 'dark')
        if (find) continue

        const entries = Object.entries(atom.style)
        if (!entries?.length) continue

        const [, colorValue] = entries[0]

        if (!colorValue) continue

        let [, , mapKey] = colorValue.match(/^([a-z]+)(\d+)$/i) || []
        if (['white', 'black'].includes(colorValue)) mapKey = colorValue
        colorMap

        let str = JSON.stringify(atom).replace(new RegExp(`${mapKey}`, 'g'), colorMap[mapKey])

        if (mapKey === 'white') str = str.replace(/White/g, 'Black')
        if (mapKey === 'black') str = str.replace(/Black/g, 'White')

        const cloned: Atom = JSON.parse(str)

        const darkAtom = new Atom({
          ...cloned,
          className: '',
          propKey: cloned.propKey + '--dark',
          meta: { ...cloned.meta, mode: 'dark' },
        })

        const cachedAtom = store.atomCache.get(darkAtom.id)

        if (cachedAtom) {
          darkAtoms.push(cachedAtom)
        } else {
          darkAtoms.push(darkAtom)
        }
      }
    }

    for (const darkAtom of darkAtoms) {
      this.addAtom(darkAtom)
    }
  }

  /**
   * Get final css value
   * @param key css key, eg: font-szie, padding-top
   * @param value css value
   * @returns
   */
  formatCssValue(key: string, value: any) {
    // no need unit
    if (!isUnitProp(key)) return value

    let numValue = value

    // 80p -> 80%, 50p-> -50%
    if (isPercentNumber(String(value))) {
      return String(value).replace('p', '%')
    }

    if (!isNumber(value)) return value

    numValue = Number(value)

    // if num is between 0 and 1, convert it to percent number.
    if (numValue < 1 && numValue > 0) {
      return numValue * 100 + '%'
    }

    const { config } = store

    if (config.unit !== 'none') {
      if (config.transformUnit) {
        return config.transformUnit(numValue)
      } else {
        return value + store.config.unit
      }
    }

    return numValue
  }

  /**
   * convert style object to string
   * @param style
   * @param meta
   * @example
   * { width: 10 } -> "width: 10px;"
   * { paddingTop: 10, paddingBottom: 10 } -> "padding-top: 10px;padding-bottom: 10px;"
   * @returns
   */
  styleToString(style: Dict, meta: Atom['meta']) {
    const { important, colorPostfix } = meta
    return Object.entries(style).reduce<string>((r, [key, value]) => {
      const cssKey = jsKeyToCssKey(key)
      const posfix = important ? ' !important' : ''
      const colors: any = store.theme.colors

      if (colorPostfix) {
        value = formatColor(colors[value] || value, colorPostfix)
      } else {
        value = this.formatCssValue(cssKey, colors[value] || value)
      }
      return r + `${cssKey}: ${value}${posfix};`
    }, '')
  }

  addAtom(atom: Atom) {
    // if not cached, let's cache it
    if (!store.atomCache.get(atom.id)) {
      store.atomCache.set(atom.id, atom)
    }

    const { modes = {} } = this.config.theme.colors
    const entries = Object.entries<any>(modes)

    /** for color mode */
    for (const [mode, colors] of entries) {
      if (!atom.style) continue
      const entries = Object.entries(atom.style)
      if (!entries.length) continue
      const [styleKey, styleValue] = entries[0]
      const colorValue = colors[styleValue]
      if (colorValue) {
        const postfix = '--' + mode

        // TODO: improve clone
        const modeAtom: Atom = JSON.parse(JSON.stringify(atom))

        modeAtom.className = atom.className + postfix
        modeAtom.key = atom.key + postfix
        modeAtom.id = atom.id + postfix
        modeAtom.meta = { mode, ...atom.meta }
        modeAtom.style[styleKey as 'color'] = colorValue

        this.atoms.push(modeAtom)
      }
    }
    this.atoms.push(atom)
  }

  /**
   * prop that can to handle, only primitive value type is valid
   * @param propKey
   * @param propValue
   * @returns
   */
  isValidProp(propKey: string, propValue: any): boolean {
    const validTypes = ['string', 'boolean', 'number', 'undefined']
    if (propKey === 'css') return true

    // for _hover,_sm,_dark...
    if (propKey.startsWith('_')) return true

    if (Array.isArray(propValue)) return true

    const type = typeof propValue
    if (validTypes.includes(type)) return true

    return false
  }

  /**
   * to mutate atom attribute, and add atom to this.atoms
   * @param atom
   */
  mutateAtom(atom: Atom): void {
    for (const plugin of this.plugins) {
      if (!plugin.isMatch?.(atom.key)) continue

      if (plugin.beforeHandleAtom) {
        atom = plugin.beforeHandleAtom(atom, this as any)
      }
    }

    const cachedAtom = store.atomCache.get(atom.id)

    if (cachedAtom) {
      this.addAtom(cachedAtom)
      throw new Error('atom is cached, add to this.atoms derectly, no need to mutate')
    }

    // if handled, push to this.atoms and skip it
    if (atom.handled) {
      this.addAtom(atom)
      throw new Error('atom is handled, add to this.atoms derectly ,no need to mutate')
    }

    for (const plugin of this.plugins) {
      if (!plugin.isMatch?.(atom.key)) continue

      if (plugin.beforeHandleAtom) {
        atom = plugin.beforeHandleAtom(atom, this as any)
      }

      if (plugin.handleAtom) {
        atom = plugin.handleAtom?.(atom, this as any)
      }

      atom.handled = true

      break // break from this plugin
    }
  }

  parseCSSObject(propValue: any, meta = {}) {
    const parsed = parse(propValue)

    const prefixClassName = objectToClassName(propValue)

    for (const { selector, selectorType, style } of parsed) {
      const entries = Object.entries(style)
      if (!entries.length) continue
      const [propKey, propValue] = entries[0]

      let option: Options = { propKey, propValue, meta }

      if (selectorType === 'pseudo' && option.meta) {
        option.meta.pseudo = selector
      }

      if (selectorType === 'child' && option.meta) {
        option.meta.childSelector = selector
      }

      const atom = new Atom(option)

      const isVoid = selectorType === 'void'

      try {
        this.mutateAtom(atom)
      } catch (error) {
        continue
      }

      // not match atomic props rule
      if (!atom.style) {
        atom.style = style

        // TODO: need refactor
        atom.id = objectToClassName({ style })

        atom.className = isVoid ? objectToClassName(style) : prefixClassName

        atom.handled = true
      }

      const cachedAtom = store.atomCache.get(atom.id)

      if (cachedAtom) {
        this.addAtom(cachedAtom)
      } else {
        this.addAtom(atom)
      }
    }
  }

  makeResponsiveStyle(breakpoint: string, rule: string) {
    return `@media (min-width: ${breakpoint}) {${rule}}`
  }

  /**
   * get component classNames
   */
  getClassNames(): string[] {
    /**
     * handle override style
     * @example
     * <Box class="red200 blue200"></Box> will get <div class="blue200"></div>
     * <Box class="px2 px4"></Box> will get <div class="px4"></div>
     */
    let classNames: string[] = []

    this.atoms.reduce<Atom[]>((result, cur) => {
      if (!cur.style || !Object.keys(cur.style).length) return result

      const index = result.findIndex((i) => {
        return i.styleKeysHash === cur.styleKeysHash
      })

      if (!cur.isValid) return result

      if (index === -1) {
        classNames.push(cur.className)
        result = [...result, cur]
      } else {
        result.splice(index, 1, cur)
        classNames.splice(index, 1, cur.className)
      }

      return result
    }, [])

    const { className = '' } = this.props
    const filteredClassNames = className.split(/\s+/).filter((i) => !classNames.includes(i) && !!i)

    classNames = classNames.concat(filteredClassNames)

    if (this.hasResponsive) classNames.unshift(this.uniqueClassName)

    return classNames
  }

  /**
   * get style object
   */
  toStyle() {
    const style = this.atoms.reduce<any>((result, atom) => {
      if (!atom.isValid) return result // not style type

      const colors: any = store.theme.colors

      const style = Object.entries(atom.style).reduce<any>((c, [key, value]) => {
        const cssValue = this.formatCssValue(jsKeyToCssKey(key), colors[value] || value)
        return { ...c, [key]: cssValue }
      }, {})
      return { ...result, ...style }
    }, {})
    return style
  }

  /**
   * get rules for parser.insertRule
   * @returns
   */
  toRules(enableInserted = false): string[] {
    const { modePrefix = '' } = this.config.theme
    const rules: string[] = []

    // sort responsive style
    this.atoms = this.atoms.sort((a, b) => {
      return parseInt(b.meta.breakpoint || '0') - parseInt(a.meta.breakpoint || '0')
    })

    for (const atom of this.atoms) {
      atom.createClassName(store.config.prefix) // only create atom className when toRules

      let rule: string = ''
      const { className, isValid, style = {} } = atom

      // no style in falsy prop
      if (!isValid) continue

      // empty style
      if (isEmptyObj(style)) continue

      if (!enableInserted) {
        if (atom.inserted) continue
      }

      atom.inserted = true

      const { pseudo, mode, breakpoint = '', childSelector } = atom.meta

      // TODO: need refactor
      const shouldUseUniqueClassName = !!this.atoms.find(
        (i) => i.styleKeys === atom.styleKeys && (atom.meta.breakpoint || i.meta.breakpoint),
      )
      const uniqueSelector =
        shouldUseUniqueClassName || atom.meta.breakpoint ? '.' + this.uniqueClassName : ''

      let selector = `${uniqueSelector}.${className}`
      if (pseudo) selector = selector + pseudo
      if (mode) selector = `.${modePrefix}${mode} ${selector}`
      if (childSelector) selector = `${selector} ${childSelector}`
      rule = `${selector} { ${this.styleToString(style, atom.meta)} }`
      if (breakpoint) rule = this.makeResponsiveStyle(breakpoint, rule)

      rules.push(rule)
    }

    // console.log('this.atoms-----:', this.atoms)

    return rules
  }

  getParsedProps(): any {
    const { props, atoms } = this
    if (isEmptyObj(props)) return {}

    const entries = Object.entries<any>(props)

    /** ignore atomic prop */
    const parsedProps = entries.reduce<any>((result, [key, value]) => {
      const find = atoms.find((atom) => [atom.propKey, atom.key, atom.id, 'css'].includes(key))
      if (!find) result[key] = value
      return result
    }, {})

    return parsedProps
  }

  insertRule() {
    const rules = this.toRules()
    styleSheet.insertStyles(rules)
  }
}
