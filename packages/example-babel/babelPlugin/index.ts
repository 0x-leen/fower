import { Sheet, styli } from '@styli/react'
import { JSXOpeningElement } from '@babel/types'
import { PluginObj, NodePath } from '@babel/core'
import { createProps } from './createProps'
import { rmAttr } from './rmAttr'
import { toStyle } from './toStyle'
import { toCss } from './toCss'
import { Preset } from '@styli/types'
import { output } from './output'

export default (api: any, opt: Preset): PluginObj => {
  styli.configure(() => opt)

  const { inline = true } = styli.getConfig()

  return {
    pre() {
      this.cssStr = ''
    },
    visitor: {
      JSXOpeningElement(path: NodePath<JSXOpeningElement>) {
        const attrs: any = path.node.attributes
        if (!attrs.length) return

        const { props } = createProps(attrs)

        const sheet = new Sheet(props, {} as any)

        if (inline) {
          toStyle(path, sheet, attrs)
        } else {
          ;(this.cssStr as any) += sheet.toCss()
          toCss(path, sheet, attrs)
        }

        rmAttr(path, sheet, props)
      },
    },
    post() {
      output(this.cssStr as any)
    },
  }
}
