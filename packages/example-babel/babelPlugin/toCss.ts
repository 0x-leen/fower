import * as t from '@babel/types'

export function toCss(path: any, sheet: any, attrs: any) {
  const classNames = sheet.getClassNames()

  // get origin style
  const oClassName: any = attrs.find((node: any) => node.name?.name === 'className')

  if (oClassName) {
    // merge style
    oClassName.value.value = oClassName.value.value + ' ' + classNames
  } else {
    // insert style
    const className = t.jsxAttribute(t.jsxIdentifier('className'), t.stringLiteral(classNames))
    path.node.attributes.push(className)
  }
}
