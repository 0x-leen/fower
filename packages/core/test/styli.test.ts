import { createStyle } from '../src/api'
import { Styli } from '../src/styli'
import { isNumber } from '../src/utils'

describe('styli', () => {
  it('config', () => {
    Styli.config({
      unit: '',
      colors: {
        themeColor: '#FCD423',
      },
      convertConfig: [
        {
          isMatch: (prop) => /^theme-\w+$/.test(prop),
          toStyle: (prop) => {
            const [, value] = prop.match(/^theme-(\w+)$/) || []
            switch (value) {
              case 'dark':
                return { color: '#000' }
              case 'light':
                return { color: '#FFF' }
            }
            return {}
          },
        },
      ],
      transformUnit(value) {
        if (isNumber(value)) {
          return Number(value) * 2 + (Styli.getConfig('unit') as 'string')
        }
        return '' + value
      },
    })
    expect(Styli.getConfig('unit')).toEqual('')
    expect(Styli.getConfig('colors')).toHaveProperty('themeColor', '#FCD423')
    expect(Styli.getConfigs()).toHaveProperty('colors')
    expect(createStyle('theme-light')).toMatchObject({ color: '#FFF' })
    expect(createStyle('theme-dark')).toMatchObject({ color: '#000' })
    expect(createStyle('theme-aaa')).toMatchObject({})
    expect(createStyle('p-10')).toMatchObject({ padding: '20' })
  })
})