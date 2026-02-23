import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import zhJSON from './translations/zh.json'
import enJSON from './translations/en.json'

const resources = {
    zh: {
        translation: zhJSON,
    },
    en: {
        translation: enJSON,
    },
}

i18n
    .use(initReactI18next)
    .init({
        resources,
        lng: localStorage.getItem('language') || 'zh', // Default language
        fallbackLng: 'en',
        interpolation: {
            escapeValue: false, // React already safes from XSS
        },
    })

export default i18n
